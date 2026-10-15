import { Component, OnDestroy } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { RoleService } from '../auth/role.service';
import { Post, SocialService } from '../social/social.service';
import { CommunityNotification, CommunityService } from '../communities/community.service';


@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage implements OnDestroy {
  posts: Post[] = [];
  role = 'user';
  searchTerm = '';
  selectedCommunity = '';
  selectedFeed: 'recent' | 'popular' | 'mine' | 'following' = 'recent';
  subscriptions: string[] = [];
  unreadNotificationCount = 0;
  feedError = '';
  private stopWatchingPosts?: () => void;
  private stopWatchingSubscriptions?: () => void;
  private stopWatchingNotifications?: () => void;
  private readonly stopWatchingRole: { unsubscribe(): void };

  constructor(
    private router: Router,
    private alertController: AlertController,
    private toastController: ToastController,
    public authService: AuthService,
    private socialService: SocialService,
    private roleService: RoleService,
    private communityService: CommunityService
  ) {
    this.stopWatchingRole = this.roleService.role$.subscribe((role) => this.role = role);
    this.stopWatchingPosts = this.socialService.watchPosts(
      (posts) => {
        this.posts = posts;
        this.feedError = '';
      },
      (error) => {
        console.error('No se pudo cargar el feed.', error);
        this.feedError = 'No se pudo actualizar el feed. Revisa tu conexión.';
      }
    );
    const uid = this.authService.currentUser?.uid;
    if (uid) {
      this.stopWatchingSubscriptions = this.communityService.watchSubscriptions(
        uid,
        (subscriptions) => this.subscriptions = subscriptions,
        (error) => console.error('No se pudieron cargar las comunidades seguidas.', error)
      );
      this.stopWatchingNotifications = this.communityService.watchNotifications(
        uid,
        (notifications: CommunityNotification[]) => {
          this.unreadNotificationCount = notifications.filter((notification) => !notification.read).length;
        },
        (error) => console.error('No se pudieron cargar las notificaciones.', error)
      );
    }
  }

  ngOnDestroy(): void {
    this.stopWatchingPosts?.();
    this.stopWatchingSubscriptions?.();
    this.stopWatchingNotifications?.();
    this.stopWatchingRole.unsubscribe();
  }

  get filteredPosts(): Post[] {
    const normalizedSearch = this.searchTerm.trim().toLowerCase();
    const currentUserId = this.authService.currentUser?.uid;
    let visiblePosts = this.posts.filter((post) => {
      if (this.selectedFeed === 'mine' && post.authorId !== currentUserId) {
        return false;
      }
      if (this.selectedFeed === 'following' && !this.subscriptions.includes(post.community)) {
        return false;
      }
      if (this.selectedCommunity && post.community !== this.selectedCommunity) {
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
    return this.subscriptions.length;
  }

  get userDisplayName(): string {
    const user = this.authService.currentUser;
    return user?.displayName || user?.email?.split('@')[0] || 'Mi perfil';
  }

  get userEmail(): string {
    return this.authService.currentUser?.email || 'Cuenta de HiloHub';
  }

  get userInitials(): string {
    return this.userDisplayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  get roleLabel(): string {
    return this.role === 'admin' ? 'Administrador' : this.role === 'moderator' ? 'Moderador' : 'Miembro';
  }

  get myPostCount(): number {
    const uid = this.authService.currentUser?.uid;
    return this.posts.filter((post) => post.authorId === uid).length;
  }

  get trendingCommunities(): Array<{ name: string; count: number }> {
    const counts = new Map<string, number>();
    for (const post of this.posts) {
      counts.set(post.community, (counts.get(post.community) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((first, second) => second.count - first.count || first.name.localeCompare(second.name))
      .slice(0, 5);
  }

  get feedTitle(): string {
    if (this.selectedCommunity) {
      return `r/${this.selectedCommunity}`;
    }
    return this.selectedFeed === 'mine'
      ? 'Mis publicaciones'
      : this.selectedFeed === 'popular'
        ? 'Conversaciones populares'
        : this.selectedFeed === 'following'
          ? 'Comunidades que sigues'
          : 'Últimas conversaciones';
  }

  selectFeed(feed: 'recent' | 'popular' | 'mine' | 'following'): void {
    this.selectedFeed = feed;
    this.selectedCommunity = '';
  }

  filterByCommunity(event: Event, community: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.selectedCommunity = this.selectedCommunity === community ? '' : community;
    this.selectedFeed = 'recent';
  }

  clearFilters(): void {
    this.selectedFeed = 'recent';
    this.selectedCommunity = '';
    this.searchTerm = '';
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
