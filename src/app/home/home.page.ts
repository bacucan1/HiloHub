import { Component } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { RoleService } from '../auth/role.service';
import { Post, SocialService } from '../social/social.service';


@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage {
  posts: Post[] = [];
  role = 'user';
  searchTerm = '';
  selectedFeed: 'recent' | 'popular' | 'mine' = 'recent';
  private stopWatchingPosts?: () => void;

  constructor(
    private router: Router,
    private alertController: AlertController,
    private toastController: ToastController,
    public authService: AuthService,
    private socialService: SocialService,
    private roleService: RoleService
  ) {
    this.roleService.role$.subscribe((role) => this.role = role);
    this.stopWatchingPosts = this.socialService.watchPosts((posts) => this.posts = posts);
  }

  ngOnDestroy(): void {
    this.stopWatchingPosts?.();
  }

  get filteredPosts(): Post[] {
    const normalizedSearch = this.searchTerm.trim().toLowerCase();
    const currentUserId = this.authService.currentUser?.uid;
    let visiblePosts = this.posts.filter((post) => {
      if (this.selectedFeed === 'mine' && post.authorId !== currentUserId) {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }
      return [post.title, post.body, post.community, post.authorName]
        .some((value) => value.toLowerCase().includes(normalizedSearch));
    });

    if (this.selectedFeed === 'popular') {
      visiblePosts = [...visiblePosts].sort((first, second) => second.score - first.score);
    }
    return visiblePosts;
  }

  get communityCount(): number {
    return new Set(this.posts.map((post) => post.community)).size;
  }

  trackByPost(_: number, post: Post): string {
    return post.id;
  }

  addPost(): void {
    this.router.navigate(['/create']);
  }

  async logout() {
    await this.authService.logout();
    await this.router.navigate(['/auth']);
  }

  async delete(post: Post): Promise<void> {
    const user = this.authService.currentUser;
    if (!user || (post.authorId !== user.uid && !this.roleService.canModerate())) {
      return;
    }

    const alert = await this.alertController.create({
      header: 'Eliminar publicación',
      subHeader: 'Acción de moderación',
      message: 'Esta publicación y sus comentarios se eliminarán. ¿Continuar?',
      cssClass: 'app-delete-alert',
      backdropDismiss: false,
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
          cssClass: 'app-alert-cancel-btn'
        },
        {
          text: 'Eliminar',
          role: 'destructive',
          cssClass: 'app-alert-delete-btn',
          handler: async () => {
            try {
              await this.socialService.deletePost(post.id);
              const toast = await this.toastController.create({
                message: 'Publicación eliminada.',
                duration: 1800,
                color: 'success',
                position: 'top'
              });

              await toast.present();
            } catch {
              const toast = await this.toastController.create({
                message: 'No se pudo eliminar el registro.',
                duration: 1800,
                color: 'danger',
                position: 'top'
              });

              await toast.present();
            }
          }
        }
      ]
    });

    await alert.present();
  }
}
