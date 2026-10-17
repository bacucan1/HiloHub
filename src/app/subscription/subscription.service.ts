import { Injectable } from '@angular/core';

export interface CurrentSubscription {
  subscriptionId: string;
  plan: string;
  planName?: string;
  planId?: string;
  price?: string;
  currency?: string;
  status: string;
  nextBillingTime?: string | null;
  createdAt?: number;
  updatedAt: number;
}

@Injectable({ providedIn: 'root' })
export class SubscriptionService {
  getDemoSubscription(uid: string): CurrentSubscription | null {
    const serialized = localStorage.getItem(this.demoStorageKey(uid));
    if (!serialized) {
      return null;
    }

    const value: unknown = JSON.parse(serialized);
    if (
      typeof value !== 'object' ||
      value === null ||
      !('subscriptionId' in value) ||
      typeof value.subscriptionId !== 'string' ||
      !('plan' in value) ||
      typeof value.plan !== 'string' ||
      !('status' in value) ||
      value.status !== 'DEMO_APPROVED' ||
      !('updatedAt' in value) ||
      typeof value.updatedAt !== 'number'
    ) {
      throw new Error('El registro local de la demostración de PayPal no tiene un formato válido.');
    }
    return value as CurrentSubscription;
  }

  saveDemoSubscription(uid: string, subscription: CurrentSubscription): void {
    localStorage.setItem(this.demoStorageKey(uid), JSON.stringify(subscription));
  }

  private demoStorageKey(uid: string): string {
    return `hilohub:paypal-demo-subscription:${uid}`;
  }
}
