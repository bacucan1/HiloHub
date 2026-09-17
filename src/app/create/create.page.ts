import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, Validators } from '@angular/forms';
import { ToastController } from '@ionic/angular';
import { SocialService } from '../social/social.service';

@Component({
  selector: 'app-create',
  templateUrl: './create.page.html',
  styleUrls: ['./create.page.scss'],
  standalone: false,
})
export class CreatePage {
  private readonly formBuilder = inject(FormBuilder);
  infoForm = this.formBuilder.group({
    title: this.formBuilder.nonNullable.control('', [Validators.required, Validators.maxLength(140)]),
    body: this.formBuilder.nonNullable.control('', [Validators.required, Validators.maxLength(10000)]),
    community: this.formBuilder.nonNullable.control('general', [Validators.required, Validators.pattern(/^[a-z0-9-]+$/)])
  });

  constructor(
    private router: Router,
    private toastController: ToastController,
    private socialService: SocialService
  ) { }

  async saveInfo() {
    if (this.infoForm.invalid) {
      this.infoForm.markAllAsTouched();
      return;
    }

    try {
      const value = this.infoForm.getRawValue();
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
    } catch {
      const toast = await this.toastController.create({
        message: 'No se pudo crear el registro.',
        duration: 1800,
        color: 'danger',
        position: 'top'
      });

      await toast.present();
    }
  }
}
