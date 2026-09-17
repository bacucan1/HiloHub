import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { AuthService } from '../auth/auth.service';
import { RoleService } from '../auth/role.service';
import { Comment, Post, SocialService } from '../social/social.service';

@Component({
  selector: 'app-detail',
  templateUrl: './detail.page.html',
  styleUrls: ['./detail.page.scss'],
  standalone: false,
})

export class DetailPage {
  post: Post | null = null;
  comments: Comment[] = [];
  commentBody = '';
  private readonly postId = this.route.snapshot.paramMap.get('id');
  private stopWatchingPost?: () => void;
  private stopWatchingComments?: () => void;

  constructor(
    private route: ActivatedRoute,
    public router: Router,
    private toastController: ToastController,
    public authService: AuthService,
    public roleService: RoleService,
    private socialService: SocialService
  ) {
    this.watchPost();
  }

  ngOnDestroy(): void {
    this.stopWatchingPost?.();
    this.stopWatchingComments?.();
  }

  private watchPost(): void {
    if (!this.postId) {
      this.router.navigate(['/home']);
      return;
    }

    this.stopWatchingPost = this.socialService.watchPost(this.postId, (post) => {
      if (!post) {
        this.router.navigate(['/home']);
        return;
      }
      this.post = post;
    });
    this.stopWatchingComments = this.socialService.watchComments(this.postId, (comments) => this.comments = comments);
  }

  async vote(value: 1 | -1): Promise<void> {
    if (!this.postId) {
      return;
    }
    try {
      await this.socialService.vote(this.postId, value);
    } catch {
      await this.showToast('No se pudo registrar el voto.', 'danger');
    }
  }

  async addComment(): Promise<void> {
    const body = this.commentBody.trim();
    if (!this.postId || !body) {
      return;
    }
    try {
      await this.socialService.createComment(this.postId, body);
      this.commentBody = '';
    } catch {
      await this.showToast('No se pudo publicar el comentario.', 'danger');
    }
  }

  canDelete(): boolean {
    const user = this.authService.currentUser;
    return !!user && !!this.post && (user.uid === this.post.authorId || this.roleService.canModerate());
  }

  private async showToast(message: string, color: 'success' | 'danger'): Promise<void> {
    const toast = await this.toastController.create({ message, duration: 1800, color, position: 'top' });
    await toast.present();
  }
}
