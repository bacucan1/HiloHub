import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { getDatabase, onValue, ref, remove, set, update } from 'firebase/database';
import { AuthService } from '../auth/auth.service';
import { firebaseApp } from '../firebase';
import { environment } from '../../environments/environment';

export interface Community {
  id: string;
  name: string;
  description: string;
  category: string;
  createdAt: number;
  memberCount?: number;
}

export interface CommunityNotification {
  id: string;
  type: 'new_post';
  postId: string;
  community: string;
  postTitle: string;
  authorName: string;
  createdAt: number;
  read: boolean;
}

export interface NotificationDevice {
  token: string;
  platform: 'web' | 'android' | 'ios';
  updatedAt: number;
}

@Injectable({ providedIn: 'root' })
export class CommunityService {
  private readonly database = getDatabase(firebaseApp);
  private readonly deviceIdKey = 'hilohub.push.device-id';
  private readonly deviceOwnerKey = 'hilohub.push.device-owner';
  private tokenListenerRegistered = false;

  constructor(private readonly authService: AuthService) {}

  watchCommunities(callback: (communities: Community[]) => void, onError: (error: Error) => void): () => void {
    return onValue(ref(this.database, 'communities'), (snapshot) => {
      const communities: Community[] = [];
      snapshot.forEach((child) => {
        const value = child.val() as Partial<Community>;
        communities.push({
          id: child.key ?? '',
          name: value.name || child.key || 'Comunidad',
          description: value.description || '',
          category: value.category || 'General',
          createdAt: Number(value.createdAt) || 0,
          memberCount: Number(value.memberCount) || 0
        });
        return false;
      });
      callback(communities.sort((first, second) => first.name.localeCompare(second.name)));
    }, onError);
  }

  watchSubscriptions(uid: string, callback: (subscriptions: string[]) => void, onError: (error: Error) => void): () => void {
    return onValue(ref(this.database, `communitySubscriptions/${uid}`), (snapshot) => {
      const subscriptions: string[] = [];
      snapshot.forEach((child) => {
        if (child.val() === true && child.key) {
          subscriptions.push(child.key);
        }
        return false;
      });
      callback(subscriptions);
    }, onError);
  }

  async setSubscribed(uid: string, communityId: string, subscribed: boolean): Promise<void> {
    const subscriptionRef = ref(this.database, `communitySubscriptions/${uid}/${communityId}`);
    if (subscribed) {
      await set(subscriptionRef, true);
    } else {
      await remove(subscriptionRef);
    }
  }

  watchNotifications(uid: string, callback: (notifications: CommunityNotification[]) => void, onError: (error: Error) => void): () => void {
    return onValue(ref(this.database, `notifications/${uid}`), (snapshot) => {
      const notifications: CommunityNotification[] = [];
      snapshot.forEach((child) => {
        const value = child.val() as Partial<CommunityNotification>;
        if (value.type === 'new_post' && value.postId && value.community) {
          notifications.push({
            id: child.key ?? value.postId,
            type: 'new_post',
            postId: value.postId,
            community: value.community,
            postTitle: value.postTitle || 'Nueva publicación',
            authorName: value.authorName || 'Un miembro',
            createdAt: Number(value.createdAt) || 0,
            read: value.read === true
          });
        }
        return false;
      });
      callback(notifications.sort((first, second) => second.createdAt - first.createdAt));
    }, onError);
  }

  async markNotificationRead(uid: string, notificationId: string): Promise<void> {
    await update(ref(this.database, `notifications/${uid}/${notificationId}`), { read: true });
  }

  async markAllNotificationsRead(uid: string, notifications: CommunityNotification[]): Promise<void> {
    const updates: Record<string, boolean> = {};
    for (const notification of notifications) {
      if (!notification.read) {
        updates[`${notification.id}/read`] = true;
      }
    }
    if (Object.keys(updates).length) {
      await update(ref(this.database, `notifications/${uid}`), updates);
    }
  }

  watchCurrentDevice(uid: string, callback: (device: NotificationDevice | null) => void, onError: (error: Error) => void): () => void {
    return onValue(ref(this.database, `notificationDevices/${uid}/${this.deviceId}`), (snapshot) => {
      callback(snapshot.exists() ? snapshot.val() as NotificationDevice : null);
    }, onError);
  }

  async enablePushNotifications(): Promise<void> {
    const user = this.authService.currentUser;
    if (!user) {
      throw new Error('Debes iniciar sesión para activar las notificaciones.');
    }

    const supported = await FirebaseMessaging.isSupported();
    if (!supported.isSupported) {
      throw new Error('Este dispositivo no admite notificaciones push.');
    }

    const currentPermission = await FirebaseMessaging.checkPermissions();
    const permission = currentPermission.receive === 'granted'
      ? currentPermission
      : await FirebaseMessaging.requestPermissions();
    if (permission.receive !== 'granted') {
      throw new Error('No se concedió permiso para enviar notificaciones push.');
    }

    const native = Capacitor.isNativePlatform();
    let serviceWorkerRegistration: ServiceWorkerRegistration | undefined;
    if (!native) {
      if (!environment.notifications.vapidKey) {
        throw new Error('Falta configurar la clave VAPID de Firebase Messaging para notificaciones web.');
      }
      if (!('serviceWorker' in navigator)) {
        throw new Error('Este navegador no admite notificaciones push.');
      }
      serviceWorkerRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    }

    const tokenResult = await FirebaseMessaging.getToken({
      ...(native ? {} : {
        vapidKey: environment.notifications.vapidKey,
        serviceWorkerRegistration
      })
    });
    if (!tokenResult.token) {
      throw new Error('Firebase Messaging no devolvió un token de notificaciones.');
    }

    await this.saveDeviceToken(tokenResult.token);
    this.registerTokenRefreshListener();
  }

  async disablePushNotifications(): Promise<void> {
    const user = this.authService.currentUser;
    if (!user) {
      throw new Error('Debes iniciar sesión para cambiar las notificaciones.');
    }
    await remove(ref(this.database, `notificationDevices/${user.uid}/${this.deviceId}`));
    await FirebaseMessaging.deleteToken();
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(this.deviceIdKey);
      localStorage.removeItem(this.deviceOwnerKey);
    }
  }

  private registerTokenRefreshListener(): void {
    if (this.tokenListenerRegistered || !Capacitor.isNativePlatform()) {
      return;
    }
    this.tokenListenerRegistered = true;
    void FirebaseMessaging.addListener('tokenReceived', ({ token }) => {
      void this.saveDeviceToken(token).catch((error: unknown) => {
        console.error('No se pudo actualizar el token de notificaciones.', error);
      });
    }).catch((error: unknown) => {
      this.tokenListenerRegistered = false;
      console.error('No se pudo escuchar la renovación del token de notificaciones.', error);
    });
  }

  private async saveDeviceToken(token: string): Promise<void> {
    const user = this.authService.currentUser;
    if (!user) {
      throw new Error('Debes iniciar sesión para registrar este dispositivo.');
    }
    const platform = Capacitor.getPlatform();
    if (platform === 'android') {
      await FirebaseMessaging.createChannel({
        id: 'community_posts',
        name: 'Publicaciones de comunidades',
        description: 'Nuevas publicaciones de las comunidades que sigues.'
      });
    }
    const device: NotificationDevice = {
      token,
      platform: platform === 'ios' || platform === 'android' ? platform : 'web',
      updatedAt: Date.now()
    };
    const deviceId = this.deviceId;
    const previousUid = localStorage.getItem(this.deviceOwnerKey);
    if (previousUid && previousUid !== user.uid) {
      await remove(ref(this.database, `notificationDevices/${previousUid}/${deviceId}`));
    }
    await set(ref(this.database, `notificationDevices/${user.uid}/${deviceId}`), device);
    localStorage.setItem(this.deviceOwnerKey, user.uid);
  }

  private get deviceId(): string {
    if (typeof localStorage === 'undefined') {
      throw new Error('No se pudo guardar el identificador local de notificaciones.');
    }
    const existingId = localStorage.getItem(this.deviceIdKey);
    if (existingId) {
      return existingId;
    }
    const newId = crypto.randomUUID().replace(/-/g, '');
    localStorage.setItem(this.deviceIdKey, newId);
    return newId;
  }
}
