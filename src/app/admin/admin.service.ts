import { Injectable } from '@angular/core';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { DataSnapshot, getDatabase, onValue, ref, remove, update } from 'firebase/database';
import { firebaseApp } from '../firebase';
import { AppRole } from '../auth/role.service';
import { Post, SocialService } from '../social/social.service';

export interface ManagedUser {
  uid: string;
  displayName: string;
  email: string;
  role: AppRole;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly db = getDatabase(firebaseApp);

  constructor(private socialService: SocialService) {}

  watchUsers(callback: (users: ManagedUser[]) => void): () => void {
    return onValue(ref(this.db, 'users'), (snapshot) => {
      const users: ManagedUser[] = [];
      snapshot.forEach((child) => {
        const value = child.val() as Partial<ManagedUser>;
        users.push({
          uid: child.key as string,
          displayName: value.displayName || 'Usuario sin nombre',
          email: value.email || 'Correo no disponible',
          role: this.normalizeRole(value.role)
        });
      });
      callback(users.sort((first, second) => first.displayName.localeCompare(second.displayName)));
    });
  }

  async ensureCurrentUserProfile(user: { uid: string; displayName: string | null; email: string | null }): Promise<void> {
    const userRef = ref(this.db, `users/${user.uid}`);
    await update(userRef, {
      displayName: user.displayName || user.email?.split('@')[0] || 'Usuario',
      email: user.email || ''
    });
  }

  async updateRole(uid: string, role: AppRole): Promise<void> {
    const setUserRole = httpsCallable<{ uid: string; role: AppRole }, { success: boolean }>(
      getFunctions(firebaseApp),
      'setUserRole'
    );
    await setUserRole({ uid, role });
  }

  async deleteUserProfile(uid: string): Promise<void> {
    await remove(ref(this.db, `users/${uid}`));
  }

  async deletePost(postId: string): Promise<void> {
    await this.socialService.deletePost(postId);
  }

  private normalizeRole(role: unknown): AppRole {
    return role === 'admin' || role === 'moderator' ? role : 'user';
  }
}
