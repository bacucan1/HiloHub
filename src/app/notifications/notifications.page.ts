import { Component, OnDestroy } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { AuthService } from '../auth/auth.service';
import {
  CommunityNotification,
  CommunityService,
  NotificationDevice
} from '../communities/community.service';

@Component({
  selector: 'app-notifications',
  templateUrl: './notifications.page.html',
  styleUrls: ['./notifications.page.scss'],
  standalone: false
})
export class NotificationsPage implements OnDestroy {
  notifications: CommunityNotification[] = [];
  device: NotificationDevice | null = null;
  loading = true;
  saving = false;
  errorMessage = '';
  private readonly stopWatchingNotifications: () => void;
  private readonly stopWatchingDevice: () => void;

  constructor(
    public readonly authService: AuthService,
    private readonly communityService: CommunityService,
    private readonly toastController: ToastController
  ) {
    const uid = this.authService.currentUser?.uid;
    if (!uid) {
      this.loading = false;
      this.errorMessage = 'Inicia sesión para ver tus notificaciones.';
      this.stopWatchingNotifications = () => undefined;
      this.stopWatchingDevice = () => undefined;
      return;
    }
    this.stopWatchingNotifications = this.communityService.watchNotifications(
      uid,
      (notifications) => {
        this.notifications = notifications;
        this.loading = false;
      },
      (error) => {
        console.error('No se pudieron cargar las notificaciones.', error);
        this.errorMessage = 'No se pudieron cargar tus notificaciones. Inténtalo de nuevo.';
        this.loading = false;
      }
    );
    this.stopWatchingDevice = this.communityService.watchCurrentDevice(
      uid,
      (device) => this.device = device,
      (error) => {
        console.error('No se pudo consultar el estado de las notificaciones push.', error);
        this.errorMessage = 'No se pudo consultar el estado de este dispositivo.';
      }
    );
  }

  ngOnDestroy(): void {
    this.stopWatchingNotifications();
    this.stopWatchingDevice();
  }

  get unreadCount(): number {
    return this.notifications.filter((notification) => !notification.read).length;
  }

  async togglePush(): Promise<void> {
    if (this.saving) {
      return;
    }
    this.saving = true;
    try {
      if (this.device) {
        await this.communityService.disablePushNotifications();
        await this.showToast('Se desactivaron las notificaciones push en este dispositivo.', 'success');
      } else {
        await this.communityService.enablePushNotifications();
        await this.showToast('Este dispositivo recibirá notificaciones de tus comunidades.', 'success');
      }
    } catch (error) {
      console.error('No se pudo cambiar la configuración de notificaciones push.', error);
      const message = error instanceof Error
        ? error.message
        : 'No se pudo cambiar la configuración. Revisa tus permisos e inténtalo de nuevo.';
      await this.showToast(message, 'danger');
    } finally {
      this.saving = false;
    }
  }

  async markAllRead(): Promise<void> {
    const uid = this.authService.currentUser?.uid;
    if (!uid || !this.unreadCount || this.saving) {
      return;
    }
    this.saving = true;
    try {
      await this.communityService.markAllNotificationsRead(uid, this.notifications);
    } catch (error) {
      console.error('No se pudieron marcar todas las notificaciones como leídas.', error);
      await this.showToast('No se pudieron actualizar las notificaciones. Inténtalo de nuevo.', 'danger');
    } finally {
      this.saving = false;
    }
  }

  async openNotification(notification: CommunityNotification): Promise<void> {
    const uid = this.authService.currentUser?.uid;
    if (uid && !notification.read) {
      try {
        await this.communityService.markNotificationRead(uid, notification.id);
      } catch (error) {
        console.error('No se pudo marcar la notificación como leída.', error);
        await this.showToast('No se pudo actualizar el estado de la notificación.', 'danger');
        return;
      }
    }
  }

  trackByNotification(_: number, notification: CommunityNotification): string {
    return notification.id;
  }

  private async showToast(message: string, color: 'success' | 'danger'): Promise<void> {
    const toast = await this.toastController.create({ message, duration: 2400, color, position: 'top' });
    await toast.present();
  }
}
