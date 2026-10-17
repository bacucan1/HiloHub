import { AfterViewInit, Component } from '@angular/core';
import { User } from 'firebase/auth';
import { firstValueFrom } from 'rxjs';
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
export class SubscriptionPage implements AfterViewInit {
  readonly plans = environment.paypal.plans;
  readonly currency = environment.paypal.currency;
  readonly demoMode = environment.paypal.demoMode;
  readonly configured = Boolean(
    environment.paypal.demoMode &&
    environment.paypal.clientId &&
    this.plans.length > 0 &&
    this.plans.every((plan) => plan.paypalPlanId)
  );
  currentSubscription: CurrentSubscription | null = null;
  loadingPlan = '';
  errorMessage = '';
  confirmationMessage = '';
  loadingSubscription = true;
  requiresSignIn = false;
  private paypalButtonsPromise?: Promise<void>;

  constructor(
    private authService: AuthService,
    private subscriptionService: SubscriptionService
  ) {}

  async ngAfterViewInit(): Promise<void> {
    try {
      const user = await firstValueFrom(this.authService.user$);
      if (!user) {
        this.requiresSignIn = true;
        return;
      }
      this.currentSubscription = this.subscriptionService.getDemoSubscription(user.uid);
      this.loadingSubscription = false;
      if (this.configured && this.canPurchase) {
        await this.initializePaypalButtons(user);
      }
    } catch (error) {
      console.error('No se pudo consultar la suscripción actual.', error);
      this.errorMessage = 'No se pudo consultar tu suscripción. Inténtalo de nuevo.';
    } finally {
      this.loadingSubscription = false;
    }
  }

  get isActivelySubscribed(): boolean {
    return this.currentSubscription?.status === 'ACTIVE';
  }

  get isSubscriptionPending(): boolean {
    return this.currentSubscription?.status === 'APPROVAL_PENDING';
  }

  get canPurchase(): boolean {
    const status = this.currentSubscription?.status;
    return !status || status === 'CANCELLED' || status === 'EXPIRED';
  }

  get currentPlanName(): string {
    return this.currentSubscription?.planName
      ?? this.plans.find((plan) => plan.id === this.currentSubscription?.plan)?.name
      ?? this.currentSubscription?.plan
      ?? '';
  }

  get currentPlanPrice(): string {
    return this.currentSubscription?.price
      ?? this.plans.find((plan) => plan.id === this.currentSubscription?.plan)?.price
      ?? '';
  }

  get currentSubscriptionStatus(): string {
    const status = this.currentSubscription?.status;
    const labels: Record<string, string> = {
      ACTIVE: 'Activa',
      APPROVAL_PENDING: 'Pendiente de confirmación',
      DEMO_APPROVED: 'Aprobada en Sandbox (demo)',
      CANCELLED: 'Cancelada',
      EXPIRED: 'Vencida',
      SUSPENDED: 'Suspendida'
    };
    return status ? labels[status] ?? 'En revisión' : '';
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
          this.confirmationMessage = 'PayPal Sandbox respondió a la solicitud. Guardando el resultado de esta demostración.';
          try {
            const now = Date.now();
            const demoSubscription: CurrentSubscription = {
              subscriptionId: data.subscriptionID,
              plan: plan.id,
              planName: plan.name,
              planId: plan.paypalPlanId,
              price: plan.price,
              currency: this.currency,
              status: 'DEMO_APPROVED',
              createdAt: now,
              updatedAt: now
            };
            this.subscriptionService.saveDemoSubscription(user.uid, demoSubscription);
            this.currentSubscription = demoSubscription;
            this.confirmationMessage = 'PayPal Sandbox respondió con una referencia. La suscripción se guardó solo en este navegador y no fue verificada ni sincronizada con HiloHub.';
          } catch (error) {
            console.error('No se pudo guardar el resultado local de PayPal Sandbox.', error);
            this.errorMessage = 'PayPal Sandbox respondió, pero no se pudo guardar el resultado en este navegador.';
            this.confirmationMessage = '';
          } finally {
            this.loadingPlan = '';
          }
        },
        onCancel: () => {
          this.confirmationMessage = '';
          this.errorMessage = 'El proceso de suscripción fue cancelado.';
        },
        onError: (error) => {
          console.error('PayPal reportó un error en la suscripción.', error);
          this.confirmationMessage = '';
          this.errorMessage = 'PayPal no pudo iniciar la suscripción. Inténtalo de nuevo.';
        }
      }).render(`#paypal-button-${plan.id}`);
    }
  }

  private initializePaypalButtons(user: User): Promise<void> {
    if (!this.paypalButtonsPromise) {
      this.paypalButtonsPromise = (async () => {
        await this.loadPaypalSdk();
        await this.renderSubscriptionButtons(user);
      })().catch((error: unknown) => {
        this.paypalButtonsPromise = undefined;
        throw error;
      });
    }
    return this.paypalButtonsPromise;
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
