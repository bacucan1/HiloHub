import { Injectable } from '@angular/core';
import { get, getDatabase, onValue, ref } from 'firebase/database';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from '../firebase';

export interface CurrentSubscription {
  subscriptionId: string;
  plan: string;
  status: string;
  updatedAt: number;
}

@Injectable({ providedIn: 'root' })
export class SubscriptionService {
  private readonly database = getDatabase(firebaseApp);
  private readonly functions = getFunctions(firebaseApp);

  async getCurrentSubscription(uid: string): Promise<CurrentSubscription | null> {
    const snapshot = await get(ref(this.database, `subscriptions/${uid}`));
    return snapshot.exists() ? snapshot.val() as CurrentSubscription : null;
  }

  watchCurrentSubscription(uid: string, callback: (subscription: CurrentSubscription | null) => void): () => void {
    return onValue(
      ref(this.database, `subscriptions/${uid}`),
      (snapshot) => callback(snapshot.exists() ? snapshot.val() as CurrentSubscription : null)
    );
  }

  async verifyPaypalSubscription(subscriptionId: string): Promise<void> {
    const verify = httpsCallable<
      { subscriptionId: string },
      { plan: string; status: string }
    >(this.functions, 'verifyPaypalSubscription');
    await verify({ subscriptionId });
  }
}
