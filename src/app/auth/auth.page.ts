import { Component, DestroyRef, inject } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { User } from 'firebase/auth';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-auth',
  templateUrl: './auth.page.html',
  styleUrls: ['./auth.page.scss'],
  standalone: false
})
export class AuthPage {
  private readonly destroyRef = inject(DestroyRef);
  readonly authForm = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(6)] })
  });

  isRegistering = false;
  isSubmitting = false;
  errorMessage = '';
  verificationSent = false;
  currentUser: User | null = null;

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly toastController: ToastController
  ) {
    this.authService.user$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((user) => {
        this.currentUser = user;
        if (user?.emailVerified) {
          void this.router.navigate(['/home']);
        }
      });
  }

  toggleMode(): void {
    this.isRegistering = !this.isRegistering;
    this.errorMessage = '';
    this.verificationSent = false;
    this.authForm.reset({ email: this.authForm.controls.email.value, password: '' });
  }

  async submit(): Promise<void> {
    if (this.authForm.invalid) {
      this.authForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';
    const { email, password } = this.authForm.getRawValue();

    try {
      if (this.isRegistering) {
        await this.authService.register(email, password);
        this.verificationSent = true;
      } else {
        await this.authService.login(email, password);
      }
    } catch (error) {
      this.errorMessage = this.getErrorMessage(error);
    } finally {
      this.isSubmitting = false;
    }
  }

  async loginWithGoogle(): Promise<void> {
    this.isSubmitting = true;
    this.errorMessage = '';

    try {
      await this.authService.loginWithGoogle();
    } catch (error) {
      this.errorMessage = this.getErrorMessage(error);
    } finally {
      this.isSubmitting = false;
    }
  }

  async resendVerification(): Promise<void> {
    if (!this.currentUser) {
      return;
    }

    try {
      await this.authService.resendVerification(this.currentUser);
      this.verificationSent = true;
    } catch (error) {
      this.errorMessage = this.getErrorMessage(error);
    }
  }

  async resetPassword(): Promise<void> {
    const email = this.authForm.controls.email.value.trim();
    if (!email || this.authForm.controls.email.invalid) {
      this.authForm.controls.email.markAsTouched();
      this.errorMessage = 'Escribe un correo válido para recuperar tu contraseña.';
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';

    try {
      await this.authService.resetPassword(email);
      const toast = await this.toastController.create({
        message: 'Te enviamos un enlace para restablecer la contraseña.',
        duration: 2200,
        color: 'success',
        position: 'top'
      });
      await toast.present();
    } catch (error) {
      this.errorMessage = this.getErrorMessage(error);
    } finally {
      this.isSubmitting = false;
    }
  }

  private getErrorMessage(error: unknown): string {
    const code = (error as { code?: string })?.code;

    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
        return 'El correo o la contraseña no son correctos.';
      case 'auth/email-already-in-use':
        return 'Ya existe una cuenta con este correo.';
      case 'auth/weak-password':
        return 'La contraseña debe tener al menos 6 caracteres.';
      case 'auth/invalid-email':
        return 'El formato del correo no es válido.';
      case 'auth/user-not-found':
        return 'No encontramos una cuenta con ese correo.';
      case 'auth/missing-email':
        return 'Escribe tu correo para solicitar el restablecimiento.';
      case 'auth/unauthorized-continue-uri':
      case 'auth/invalid-continue-uri':
        return 'El dominio de la aplicación no está autorizado en Firebase.';
      case 'auth/network-request-failed':
        return 'No hay conexión con Firebase. Revisa tu internet e inténtalo de nuevo.';
      case 'auth/too-many-requests':
        return 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.';
      case 'auth/popup-closed-by-user':
        return 'El acceso con Google fue cancelado.';
      case 'auth/popup-blocked':
        return 'El navegador bloqueó la ventana de Google. Permite ventanas emergentes e inténtalo de nuevo.';
      case 'auth/operation-not-allowed':
        return 'El acceso con Google todavía no está habilitado en Firebase.';
      case 'email-not-verified':
        return 'Verifica tu correo antes de iniciar sesión.';
      default:
        return 'No se pudo completar la operación. Inténtalo de nuevo.';
    }
  }
}
