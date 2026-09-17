import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, Validators } from '@angular/forms';
import { AlertController, ToastController } from '@ionic/angular';
import { DataSnapshot, getDatabase, onValue, ref, remove, set } from "firebase/database";

const db = getDatabase();

@Component({
  selector: 'app-edit',
  templateUrl: './edit.page.html',
  styleUrls: ['./edit.page.scss'],
  standalone: false,
})

export class EditPage {
  info: any = {};
  private readonly infoId = this.route.snapshot.paramMap.get('id');

  infoForm = this.formBuilder.group({
    info_title: ['', Validators.required],
    info_description: ['', Validators.required]
  });

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private formBuilder: FormBuilder,
    private alertController: AlertController,
    private toastController: ToastController
  ) {
    this.getInfo();
  }

  getInfo() {
    if (!this.infoId) {
      this.router.navigate(['/home']);
      return;
    }

    const infoRef = ref(db, 'infos/' + this.infoId);
    onValue(infoRef, (snapshot) => {
      if (!snapshot.exists()) {
        this.router.navigate(['/home']);
        return;
      }

      this.info = snapshotToObject(snapshot);
      this.infoForm.patchValue({
        info_title: this.info.info_title,
        info_description: this.info.info_description
      }, { emitEvent: false });
    });
  }

  async updateInfo() {
    if (!this.infoId) {
      return;
    }

    if (this.infoForm.invalid) {
      this.infoForm.markAllAsTouched();
      return;
    }

    const payload = {
      info_title: this.infoForm.value.info_title?.trim(),
      info_description: this.infoForm.value.info_description?.trim()
    };

    try {
      await set(ref(db, 'infos/' + this.infoId), payload);
      const toast = await this.toastController.create({
        message: 'Cambios guardados correctamente.',
        duration: 1800,
        color: 'success',
        position: 'top'
      });

      await toast.present();
      await this.router.navigate(['/detail', this.infoId]);
    } catch {
      const toast = await this.toastController.create({
        message: 'No se pudieron guardar los cambios.',
        duration: 1800,
        color: 'danger',
        position: 'top'
      });

      await toast.present();
    }
  }

  async deleteInfo() {
    if (!this.infoId) {
      return;
    }

    const alert = await this.alertController.create({
      header: 'Eliminar registro',
      subHeader: 'Accion permanente',
      message: 'Esta accion eliminara el dato de forma permanente.',
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
              await remove(ref(db, 'infos/' + this.infoId));
              const toast = await this.toastController.create({
                message: 'Registro eliminado.',
                duration: 1800,
                color: 'success',
                position: 'top'
              });

              await toast.present();
              await this.router.navigate(['/home']);
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
export const snapshotToObject = (snapshot: DataSnapshot) => {
  let item = snapshot.val() ?? {};
  item.key = snapshot.key;

  return item;
}


