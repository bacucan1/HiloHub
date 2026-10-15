import { Component, DestroyRef, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, Validators } from '@angular/forms';
import { ToastController } from '@ionic/angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RoleService } from '../auth/role.service';
import { SocialService } from '../social/social.service';
import { LocalModerationError, LocalModerationService } from '../social/local-moderation.service';
import { Community, CommunityService } from '../communities/community.service';

@Component({
  selector: 'app-create',
  templateUrl: './create.page.html',
  styleUrls: ['./create.page.scss'],
  standalone: false,
})
export class CreatePage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  ollamaEndpoint = '';
  canManageModeration = false;
  endpointReady = false;
  isCheckingOllama = false;
  ollamaStatus: 'idle' | 'connected' | 'error' = 'idle';
  ollamaMessage = '';
  isSubmitting = false;
  errorMessage = '';
  communities: Community[] = [];
  communitiesError = '';

  infoForm = this.formBuilder.group({
    title: this.formBuilder.nonNullable.control('', [Validators.required, Validators.maxLength(140)]),
    body: this.formBuilder.nonNullable.control('', [Validators.required, Validators.maxLength(10000)]),
    community: this.formBuilder.nonNullable.control('', [
      Validators.required,
      Validators.maxLength(50),
      Validators.pattern(/^[a-z0-9-]+$/)
    ])
  });

  constructor(
    private router: Router,
    private toastController: ToastController,
    private socialService: SocialService,
    private moderationService: LocalModerationService,
    private roleService: RoleService,
    private communityService: CommunityService
  ) {
    this.roleService.role$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((role) => this.canManageModeration = role === 'moderator' || role === 'admin');
    const stopWatchingEndpoint = this.moderationService.watchEndpoint(
      (endpoint) => {
        this.ollamaEndpoint = endpoint;
        this.endpointReady = true;
      },
      () => {
        this.ollamaStatus = 'error';
        this.ollamaMessage = 'No se pudo cargar la configuración de moderación.';
      }
    );
    this.destroyRef.onDestroy(stopWatchingEndpoint);
    const stopWatchingCommunities = this.communityService.watchCommunities(
      (communities) => this.communities = communities,
      (error) => {
        console.error('No se pudieron cargar las comunidades para publicar.', error);
        this.communitiesError = 'No se pudieron cargar las comunidades. Inténtalo de nuevo.';
      }
    );
    this.destroyRef.onDestroy(stopWatchingCommunities);
  }

  async checkOllama(): Promise<void> {
    if (!this.canManageModeration) {
      return;
    }
    this.isCheckingOllama = true;
    this.ollamaStatus = 'idle';
    this.ollamaMessage = '';
    try {
      await this.moderationService.checkConnection(this.ollamaEndpoint);
      this.ollamaEndpoint = await this.moderationService.saveEndpoint(this.ollamaEndpoint);
      this.ollamaStatus = 'connected';
      this.ollamaMessage = `Conectado · ${this.moderationService.model}`;
    } catch (error) {
      this.ollamaStatus = 'error';
      this.ollamaMessage = error instanceof LocalModerationError
        ? error.message
        : 'No se pudo comprobar o guardar la configuración. Verifica tus permisos e inténtalo de nuevo.';
    } finally {
      this.isCheckingOllama = false;
    }
  }

  async saveInfo() {
    if (this.infoForm.invalid || this.isSubmitting || this.isCheckingOllama || !this.endpointReady) {
      this.infoForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';

    try {
      const value = this.infoForm.getRawValue();
      this.ollamaStatus = 'idle';
      this.ollamaMessage = 'Revisando localmente con Ollama…';
      await this.moderationService.review(value.title.trim(), value.body.trim(), this.ollamaEndpoint);
      this.ollamaStatus = 'connected';
      this.ollamaMessage = `Contenido aprobado · ${this.moderationService.model}`;
      const id = await this.socialService.createPost(
        value.title.trim(),
        value.body.trim(),
        value.community.trim().toLowerCase()
      );
      const toast = await this.toastController.create({
        message: 'Publicación creada.',
        duration: 1800,
        color: 'success',
        position: 'top'
      });

      await toast.present();
      await this.router.navigate(['/detail', id]);
    } catch (error) {
      if (error instanceof LocalModerationError && error.code === 'rejected') {
        this.ollamaStatus = 'error';
        this.ollamaMessage = 'Contenido marcado para revisión. No se publicó.';
        this.errorMessage = 'La publicación no pasó la revisión automática. Ajusta el contenido e inténtalo de nuevo.';
      } else if (error instanceof LocalModerationError) {
        this.ollamaStatus = 'error';
        this.ollamaMessage = error.message;
        this.errorMessage = error.message;
      } else if ((error as { code?: string })?.code === 'auth/not-authenticated') {
        this.errorMessage = 'Tu sesión terminó. Inicia sesión de nuevo para publicar.';
      } else {
        console.error('No se pudo guardar la publicación revisada localmente.', error);
        this.errorMessage = 'No se pudo publicar. Revisa tu conexión e inténtalo de nuevo.';
      }
    } finally {
      this.isSubmitting = false;
    }
  }
}
