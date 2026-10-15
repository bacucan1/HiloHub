import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { SubscriptionPageRoutingModule } from './subscription-routing.module';
import { SubscriptionPage } from './subscription.page';

@NgModule({
  imports: [CommonModule, IonicModule, SubscriptionPageRoutingModule],
  declarations: [SubscriptionPage]
})
export class SubscriptionPageModule {}
