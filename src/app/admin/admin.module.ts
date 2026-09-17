import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { AdminPage } from './admin.page';
import { AdminPageRoutingModule } from './admin-routing.module';

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, AdminPageRoutingModule],
  declarations: [AdminPage]
})
export class AdminPageModule {}
