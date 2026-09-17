import { Component } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular';
import { AppRole } from '../auth/role.service';
import { Post, SocialService } from '../social/social.service';
import { AdminService, ManagedUser } from './admin.service';
import { AuthService } from '../auth/auth.service';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.page.html',
  styleUrls: ['./admin.page.scss'],
  standalone: false
})
export class AdminPage {
  users: ManagedUser[] = [];
  posts: Post[] = [];
  private stopWatchingUsers?: () => void;
  private stopWatchingPosts?: () => void;

  constructor(
    private adminService: AdminService,
    private socialService: SocialService,
    private authService: AuthService,
    private alertController: AlertController,
    private toastController: ToastController
  ) {
    const user = this.authService.currentUser;
    if (user) {
      void this.adminService.ensureCurrentUserProfile(user);
    }
    this.stopWatchingUsers = this.adminService.watchUsers((users) => this.users = users);
    this.stopWatchingPosts = this.socialService.watchPosts((posts) => this.posts = posts);
  }

  ngOnDestroy(): void {
    this.stopWatchingUsers?.();
    this.stopWatchingPosts?.();
  }

  async changeRole(user: ManagedUser, role: AppRole): Promise<void> {
    if (!role || role === user.role) {
      return;
    }
    try {
      await this.adminService.updateRole(user.uid, role);
      await this.showToast(`Perfil actualizado a ${role}.`, 'success');
    } catch {
      await this.showToast('No se pudo actualizar el rol.', 'danger');
    }
  }

  async removeProfile(user: ManagedUser): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Eliminar perfil',
      message: `Se eliminará el perfil de ${user.displayName}, pero no su cuenta de acceso.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar', role: 'destructive', handler: () => this.adminService.deleteUserProfile(user.uid) }
      ]
    });
    await alert.present();
  }

  async removePost(post: Post): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Eliminar publicación',
      message: 'También se eliminarán sus comentarios y votos.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar', role: 'destructive', handler: async () => {
          try {
            await this.adminService.deletePost(post.id);
            await this.showToast('Publicación eliminada.', 'success');
          } catch {
            await this.showToast('No se pudo eliminar la publicación.', 'danger');
          }
        } }
      ]
    });
    await alert.present();
  }

  private async showToast(message: string, color: 'success' | 'danger'): Promise<void> {
    const toast = await this.toastController.create({ message, duration: 1800, color, position: 'top' });
    await toast.present();
  }
}
