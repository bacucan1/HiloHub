import { AfterViewInit, Component, OnDestroy } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { User } from 'firebase/auth';
import { AuthService } from '../auth/auth.service';
import { environment } from '../../environments/environment';
import { CurrentSubscription, SubscriptionService } from './subscription.service';

interface PaypalSubscriptionData {
  subscriptionID: string;
}

interface PaypalCreateSubscriptionActions {
  subscription: {
    create(options: { plan_id: string; custom_id: string }): Promise<string>;
  };
}

interface PaypalButtons {
  Buttons(options: {
    style?: { layout?: 'vertical'; shape?: 'rect'; label?: 'subscribe' };
    createSubscription(data: unknown, actions: PaypalCreateSubscriptionActions): Promise<string>;
    onApprove(data: PaypalSubscriptionData): Promise<void>;
    onCancel(): void;
    onError(error: Error): void;
  }): { render(selector: string): Promise<void> };
}

declare global {
  interface Window {
    paypal?: PaypalButtons;
  }
}

@Component({
  selector: 'app-subscription',
  templateUrl: './subscription.page.html',
  styleUrls: ['./subscription.page.scss'],
  standalone: false,
})
export class SubscriptionPage implements AfterViewInit, OnDestroy {
  readonly plans = environment.paypal.plans;
  readonly currency = environment.paypal.currency;
  readonly configured = Boolean(
    environment.paypal.clientId &&
    this.plans.length > 0 &&
    this.plans.every((plan) => plan.paypalPlanId)
  );
  currentSubscription: CurrentSubscription | null = null;
  loadingPlan = '';
  errorMessage = '';
  loadingSubscription = true;
  private stopWatchingSubscription?: () => void;

  constructor(
    public authService: AuthService,
    private subscriptionService: SubscriptionService,
    private toastController: ToastController
  ) {}

  async ngAfterViewInit(): Promise<void> {
    const user = this.authService.currentUser;
    if (!user) {
      this.loadingSubscription = false;
      return;
    }
    try {
      this.currentSubscription = await this.subscriptionService.getCurrentSubscription(user.uid);
      this.stopWatchingSubscription = this.subscriptionService.watchCurrentSubscription(
        user.uid,
        (subscription) => this.currentSubscription = subscription
      );
      this.loadingSubscription = false;
      if (this.configured && !this.isActivelySubscribed) {
        await this.loadPaypalSdk();
        await this.renderSubscriptionButtons(user);
      }
    } catch (error) {
      console.error('No se pudo consultar la suscripción actual.', error);
      this.errorMessage = 'No se pudo consultar tu suscripción. Inténtalo de nuevo.';
    } finally {
      this.loadingSubscription = false;
    }
  }

  ngOnDestroy(): void {
    this.stopWatchingSubscription?.();
  }

  get isActivelySubscribed(): boolean {
    return this.currentSubscription?.status === 'ACTIVE';
  }

  get currentPlanName(): string {
    return this.plans.find((plan) => plan.id === this.currentSubscription?.plan)?.name
      ?? this.currentSubscription?.plan
      ?? '';
  }

  get currentSubscriptionStatus(): string {
    const status = this.currentSubscription?.status;
    return status === 'ACTIVE' ? 'Activa' : status === 'CANCELLED' ? 'Cancelada' : status ?? '';
  }

  private async renderSubscriptionButtons(user: User): Promise<void> {
    if (!window.paypal) {
      throw new Error('PayPal SDK did not initialize.');
    }
    for (const plan of this.plans) {
      await window.paypal.Buttons({
        style: { layout: 'vertical', shape: 'rect', label: 'subscribe' },
        createSubscription: (_data, actions) => actions.subscription.create({
          plan_id: plan.paypalPlanId,
          custom_id: user.uid
        }),
        onApprove: async (data) => {
          this.loadingPlan = plan.id;
          this.errorMessage = '';
          try {
            await this.subscriptionService.verifyPaypalSubscription(data.subscriptionID);
            const toast = await this.toastController.create({
              message: 'Tu suscripción fue confirmada.',
              duration: 2500,
              color: 'success',
              position: 'top'
            });
            await toast.present();
          } catch (error) {
            console.error('No se pudo confirmar la suscripción.', error);
            this.errorMessage = 'PayPal recibió tu suscripción, pero aún no pudimos confirmarla. Si el cobro aparece en tu cuenta, vuelve a intentarlo o contacta al soporte.';
          } finally {
            this.loadingPlan = '';
          }
        },
        onCancel: () => {
          this.errorMessage = 'El proceso de suscripción fue cancelado.';
        },
        onError: (error) => {
          console.error('PayPal reportó un error en la suscripción.', error);
          this.errorMessage = 'PayPal no pudo iniciar la suscripción. Inténtalo de nuevo.';
        }
      }).render(`#paypal-button-${plan.id}`);
    }
  }

  private loadPaypalSdk(): Promise<void> {
    if (window.paypal) {
      return Promise.resolve();
    }

    const existingScript = document.querySelector<HTMLScriptElement>('script[data-paypal-sdk]');
    if (existingScript) {
      return new Promise((resolve, reject) => {
        existingScript.addEventListener('load', () => resolve(), { once: true });
        existingScript.addEventListener('error', () => reject(new Error('PayPal SDK failed to load.')), { once: true });
      });
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const query = new URLSearchParams({
        'client-id': environment.paypal.clientId,
        currency: this.currency,
        intent: 'subscription',
        vault: 'true'
      });
      script.src = `https://www.paypal.com/sdk/js?${query.toString()}`;
      script.async = true;
      script.dataset['paypalSdk'] = 'true';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('PayPal SDK failed to load.'));
      document.head.appendChild(script);
    });
  }
}
