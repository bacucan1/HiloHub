import { Component, OnDestroy } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { AuthService } from '../auth/auth.service';
import { Post, SocialService } from '../social/social.service';
import { Community, CommunityService } from './community.service';

@Component({
  selector: 'app-communities',
  templateUrl: './communities.page.html',
  styleUrls: ['./communities.page.scss'],
  standalone: false
})
export class CommunitiesPage implements OnDestroy {
  communities: Community[] = [];
  posts: Post[] = [];
  subscriptions: string[] = [];
  searchTerm = '';
  selectedCategory = 'Todas';
  selectedTab: 'discover' | 'following' = 'discover';
  loading = true;
  errorMessage = '';
  pendingCommunity = '';
  private readonly stopWatchingCommunities: () => void;
  private readonly stopWatchingSubscriptions: () => void;
  private readonly stopWatchingPosts: () => void;

  constructor(
    public readonly authService: AuthService,
    private readonly communityService: CommunityService,
    private readonly socialService: SocialService,
    private readonly toastController: ToastController
  ) {
    const uid = this.authService.currentUser?.uid;
    if (!uid) {
      this.loading = false;
      this.errorMessage = 'Inicia sesión para explorar comunidades.';
      this.stopWatchingCommunities = () => undefined;
      this.stopWatchingSubscriptions = () => undefined;
      this.stopWatchingPosts = () => undefined;
      return;
    }
    this.stopWatchingCommunities = this.communityService.watchCommunities(
      (communities) => {
        this.communities = communities;
        this.loading = false;
      },
      (error) => {
        console.error('No se pudieron cargar las comunidades.', error);
        this.errorMessage = 'No se pudieron cargar las comunidades. Inténtalo de nuevo.';
        this.loading = false;
      }
    );
    this.stopWatchingSubscriptions = this.communityService.watchSubscriptions(
      uid,
      (subscriptions) => this.subscriptions = subscriptions,
      (error) => {
        console.error('No se pudieron cargar tus comunidades seguidas.', error);
        this.errorMessage = 'No se pudo consultar tu lista de comunidades.';
      }
    );
    this.stopWatchingPosts = this.socialService.watchPosts(
      (posts) => this.posts = posts,
      (error) => {
        console.error('No se pudieron cargar las publicaciones de las comunidades.', error);
        this.errorMessage = 'No se pudieron cargar las publicaciones recientes.';
      }
    );
  }

  ngOnDestroy(): void {
    this.stopWatchingCommunities();
    this.stopWatchingSubscriptions();
    this.stopWatchingPosts();
  }

  get categories(): string[] {
    return ['Todas', ...new Set(this.communities.map((community) => community.category))];
  }

  get visibleCommunities(): Community[] {
    const query = this.searchTerm.trim().toLocaleLowerCase();
    return this.communities.filter((community) => {
      const isFollowing = this.subscriptions.includes(community.id);
      const matchesTab = this.selectedTab === 'discover' || isFollowing;
      const matchesCategory = this.selectedCategory === 'Todas' || community.category === this.selectedCategory;
      const matchesSearch = !query ||
        [community.name, community.description, community.category]
          .some((value) => value.toLocaleLowerCase().includes(query));
      return matchesTab && matchesCategory && matchesSearch;
    });
  }

  communityPosts(communityId: string): Post[] {
    return this.posts
      .filter((post) => post.community === communityId)
      .slice(0, 2);
  }

  isFollowing(communityId: string): boolean {
    return this.subscriptions.includes(communityId);
  }

  async toggleSubscription(community: Community): Promise<void> {
    const uid = this.authService.currentUser?.uid;
    if (!uid || this.pendingCommunity) {
      return;
    }
    this.pendingCommunity = community.id;
    try {
      const following = this.isFollowing(community.id);
      await this.communityService.setSubscribed(uid, community.id, !following);
      await this.showToast(
        following ? `Dejaste de seguir r/${community.id}.` : `Ahora sigues r/${community.id}.`,
        'success'
      );
    } catch (error) {
      console.error('No se pudo actualizar la suscripción a la comunidad.', error);
      await this.showToast('No se pudo actualizar la comunidad. Revisa tu conexión e inténtalo de nuevo.', 'danger');
    } finally {
      this.pendingCommunity = '';
    }
  }

  trackByCommunity(_: number, community: Community): string {
    return community.id;
  }

  initials(name: string): string {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('');
  }

  private async showToast(message: string, color: 'success' | 'danger'): Promise<void> {
    const toast = await this.toastController.create({ message, duration: 1800, color, position: 'top' });
    await toast.present();
  }
}
