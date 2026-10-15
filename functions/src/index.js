import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { getMessaging } from 'firebase-admin/messaging';
import { initializeApp } from 'firebase-admin/app';
import { defineSecret, defineString } from 'firebase-functions/params';
import { onValueCreated, onValueDeleted } from 'firebase-functions/v2/database';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';

initializeApp();

const allowedRoles = new Set(['user', 'moderator', 'admin']);
const paypalClientId = defineSecret('PAYPAL_CLIENT_ID');
const paypalClientSecret = defineSecret('PAYPAL_CLIENT_SECRET');
const paypalWebhookId = defineString('PAYPAL_WEBHOOK_ID', { default: 'configure-after-deploy' });
const paypalEnvironment = defineString('PAYPAL_ENVIRONMENT', { default: 'sandbox' });
const paypalPlanEssential = defineString('PAYPAL_PLAN_ESSENTIAL');
const paypalPlanPlus = defineString('PAYPAL_PLAN_PLUS');
const paypalPlanCommunity = defineString('PAYPAL_PLAN_COMMUNITY');

function paypalApiBaseUrl() {
  return paypalEnvironment.value() === 'production'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

async function getPaypalAccessToken() {
  const credentials = Buffer.from(`${paypalClientId.value()}:${paypalClientSecret.value()}`).toString('base64');
  const response = await fetch(`${paypalApiBaseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  if (!response.ok) {
    throw new Error(`PayPal OAuth request failed with status ${response.status}.`);
  }

  const result = await response.json();
  if (typeof result.access_token !== 'string') {
    throw new Error('PayPal OAuth response did not include an access token.');
  }
  return result.access_token;
}

async function paypalRequest(path, options = {}) {
  const accessToken = await getPaypalAccessToken();
  const response = await fetch(`${paypalApiBaseUrl()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers ?? {})
    }
  });

  if (!response.ok) {
    throw new Error(`PayPal API request failed with status ${response.status}.`);
  }
  return response.json();
}

function configuredPaypalPlans() {
  const plans = {
    essential: paypalPlanEssential.value(),
    plus: paypalPlanPlus.value(),
    community: paypalPlanCommunity.value()
  };
  return Object.fromEntries(Object.entries(plans).filter(([, id]) => typeof id === 'string' && id.length > 0));
}

export const verifyPaypalSubscription = onCall(
  { secrets: [paypalClientId, paypalClientSecret] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }

    const subscriptionId = request.data?.subscriptionId;
    if (typeof subscriptionId !== 'string' || !/^[A-Z0-9-]{8,64}$/i.test(subscriptionId)) {
      throw new HttpsError('invalid-argument', 'El identificador de suscripción no es válido.');
    }

    const plans = configuredPaypalPlans();
    if (Object.keys(plans).length === 0) {
      throw new HttpsError('failed-precondition', 'Los planes de PayPal aún no están configurados.');
    }

    try {
      const subscription = await paypalRequest(
        `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`
      );
      const matchedPlan = Object.entries(plans).find(([, planId]) => planId === subscription.plan_id);

      if (
        subscription.status !== 'ACTIVE' ||
        subscription.custom_id !== request.auth.uid ||
        !matchedPlan
      ) {
        throw new HttpsError(
          'permission-denied',
          'PayPal no confirmó una suscripción activa asociada a tu cuenta y a uno de los planes disponibles.'
        );
      }

      const database = getDatabase();
      const subscriptionRef = database.ref(`subscriptions/${request.auth.uid}`);
      const currentSubscription = await subscriptionRef.get();
      if (
        currentSubscription.child('status').val() === 'ACTIVE' &&
        currentSubscription.child('subscriptionId').val() !== subscriptionId
      ) {
        throw new HttpsError(
          'failed-precondition',
          'Ya tienes una suscripción activa. Cancélala desde PayPal antes de elegir otro plan.'
        );
      }

      const ownerRef = database.ref(`paypalSubscriptionOwners/${subscriptionId}`);
      const ownerResult = await ownerRef.transaction((owner) => owner ?? request.auth.uid);
      if (!ownerResult.committed || ownerResult.snapshot.val() !== request.auth.uid) {
        throw new HttpsError('already-exists', 'Esta suscripción ya está asociada a otra cuenta.');
      }

      await subscriptionRef.set({
        subscriptionId,
        plan: matchedPlan[0],
        planId: subscription.plan_id,
        status: 'ACTIVE',
        updatedAt: Date.now()
      });
      return { plan: matchedPlan[0], status: 'ACTIVE' };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      console.error('No se pudo verificar la suscripción de PayPal.', error);
      throw new HttpsError('internal', 'No se pudo verificar el pago con PayPal.');
    }
  }
);

export const paypalSubscriptionWebhook = onRequest(
  { secrets: [paypalClientId, paypalClientSecret] },
  async (request, response) => {
    if (request.method !== 'POST') {
      response.status(405).send('Method not allowed.');
      return;
    }

    const transmissionId = request.header('paypal-transmission-id');
    const transmissionTime = request.header('paypal-transmission-time');
    const certUrl = request.header('paypal-cert-url');
    const authAlgorithm = request.header('paypal-auth-algo');
    const transmissionSignature = request.header('paypal-transmission-sig');
    if (!transmissionId || !transmissionTime || !certUrl || !authAlgorithm || !transmissionSignature) {
      response.status(400).send('Missing PayPal signature headers.');
      return;
    }

    try {
      const verification = await paypalRequest('/v1/notifications/verify-webhook-signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auth_algo: authAlgorithm,
          cert_url: certUrl,
          transmission_id: transmissionId,
          transmission_sig: transmissionSignature,
          transmission_time: transmissionTime,
          webhook_id: paypalWebhookId.value(),
          webhook_event: request.body
        })
      });

      if (verification.verification_status !== 'SUCCESS') {
        response.status(400).send('Invalid PayPal webhook signature.');
        return;
      }

      const event = request.body;
      const eventId = event?.id;
      const eventType = event?.event_type;
      const subscriptionId = event?.resource?.id;
      if (
        typeof eventId !== 'string' ||
        !/^[A-Z0-9-]{8,64}$/i.test(eventId) ||
        typeof eventType !== 'string' ||
        typeof subscriptionId !== 'string' ||
        !/^[A-Z0-9-]{8,64}$/i.test(subscriptionId)
      ) {
        response.status(400).send('Invalid PayPal webhook event.');
        return;
      }

      const handledTypes = new Set([
        'BILLING.SUBSCRIPTION.ACTIVATED',
        'BILLING.SUBSCRIPTION.UPDATED',
        'BILLING.SUBSCRIPTION.CANCELLED',
        'BILLING.SUBSCRIPTION.EXPIRED',
        'BILLING.SUBSCRIPTION.SUSPENDED'
      ]);
      if (!handledTypes.has(eventType)) {
        response.status(200).send('Event ignored.');
        return;
      }

      const database = getDatabase();
      const ownerSnapshot = await database.ref(`paypalSubscriptionOwners/${subscriptionId}`).get();
      const uid = ownerSnapshot.val();
      if (typeof uid !== 'string') {
        response.status(200).send('Subscription not yet associated.');
        return;
      }

      const eventRef = database.ref(`paypalWebhookEvents/${eventId}`);
      const existingEvent = await eventRef.get();
      if (existingEvent.exists()) {
        response.status(200).send('Event already processed.');
        return;
      }

      const statusByEvent = {
        'BILLING.SUBSCRIPTION.ACTIVATED': 'ACTIVE',
        'BILLING.SUBSCRIPTION.CANCELLED': 'CANCELLED',
        'BILLING.SUBSCRIPTION.EXPIRED': 'EXPIRED',
        'BILLING.SUBSCRIPTION.SUSPENDED': 'SUSPENDED'
      };
      const status = statusByEvent[eventType] ?? event.resource.status;
      if (!['ACTIVE', 'APPROVAL_PENDING', 'CANCELLED', 'EXPIRED', 'SUSPENDED'].includes(status)) {
        response.status(400).send('Invalid subscription status.');
        return;
      }
      const subscriptionRef = database.ref(`subscriptions/${uid}`);
      const subscriptionSnapshot = await subscriptionRef.get();
      if (subscriptionSnapshot.child('subscriptionId').val() === subscriptionId) {
        await subscriptionRef.update({ status, updatedAt: Date.now() });
      }
      await eventRef.set(true);
      response.status(200).send('Webhook processed.');
    } catch (error) {
      console.error('No se pudo procesar el webhook de PayPal.', error);
      response.status(500).send('Could not process PayPal webhook.');
    }
  }
);

export const setUserRole = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }
  if (request.auth.token.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Solo un administrador puede cambiar roles.');
  }

  const { uid, role } = request.data ?? {};
  if (typeof uid !== 'string' || !uid || !allowedRoles.has(role)) {
    throw new HttpsError('invalid-argument', 'El usuario o el rol no son válidos.');
  }
  if (uid === request.auth.uid) {
    throw new HttpsError('failed-precondition', 'No puedes cambiar tu propio rol.');
  }

  try {
    const user = await getAuth().getUser(uid);
    await getAuth().setCustomUserClaims(uid, { ...user.customClaims, role });
    await getDatabase().ref(`users/${uid}`).update({ role });
    return { success: true };
  } catch (error) {
    console.error('No se pudo aplicar el cambio de rol.', error);
    throw new HttpsError('internal', 'No se pudo actualizar el rol.');
  }
});

export const addCommunitySubscriber = onValueCreated(
  '/communitySubscriptions/{uid}/{communityId}',
  async (event) => {
    const { communityId, uid } = event.params;
    const database = getDatabase();
    const community = await database.ref(`communities/${communityId}`).get();
    if (!community.exists()) {
      console.warn(`Community ${communityId} is missing; its subscription index was not updated.`);
      return;
    }
    const subscriberRef = database.ref(`communitySubscribers/${communityId}/${uid}`);
    let added = false;
    const subscriberResult = await subscriberRef.transaction((current) => {
      if (current === true) {
        return;
      }
      added = true;
      return true;
    });
    if (!subscriberResult.committed || !added) {
      return;
    }
    const communityRef = database.ref(`communities/${communityId}/memberCount`);
    const result = await communityRef.transaction((count) => {
      if (count === null) {
        return null;
      }
      return (Number(count) || 0) + 1;
    });
    if (!result.committed) {
      console.warn(`Community ${communityId} is missing; member count was not updated.`);
    }
  }
);

export const removeCommunitySubscriber = onValueDeleted(
  '/communitySubscriptions/{uid}/{communityId}',
  async (event) => {
    const { communityId, uid } = event.params;
    const database = getDatabase();
    const subscriberRef = database.ref(`communitySubscribers/${communityId}/${uid}`);
    let removed = false;
    const subscriberResult = await subscriberRef.transaction((current) => {
      if (current !== true) {
        return;
      }
      removed = true;
      return null;
    });
    if (!subscriberResult.committed || !removed) {
      return;
    }
    const communityRef = database.ref(`communities/${communityId}/memberCount`);
    await communityRef.transaction((count) => {
      if (count === null) {
        return null;
      }
      return Math.max(0, (Number(count) || 0) - 1);
    });
  }
);

export const notifyCommunitySubscribers = onValueCreated('/posts/{postId}', async (event) => {
  const post = event.data.val();
  const { postId } = event.params;
  if (post?.isDemo === true) {
    return;
  }
  if (!post || typeof post.community !== 'string' || !post.community) {
    console.warn(`Post ${postId} has no community; no subscriber notifications were created.`);
    return;
  }

  const database = getDatabase();
  const subscribersSnapshot = await database.ref(`communitySubscribers/${post.community}`).get();
  if (!subscribersSnapshot.exists()) {
    return;
  }

  const notificationUpdates = {};
  const messages = [];
  const devicePaths = [];
  const subscriberIds = [];
  subscribersSnapshot.forEach((subscriber) => {
    const uid = subscriber.key;
    if (uid && uid !== post.authorId) {
      subscriberIds.push(uid);
      notificationUpdates[`notifications/${uid}/${postId}`] = {
        type: 'new_post',
        postId,
        community: post.community,
        postTitle: typeof post.title === 'string' ? post.title.slice(0, 140) : 'Nueva publicación',
        authorName: typeof post.authorName === 'string' ? post.authorName.slice(0, 80) : 'Un miembro',
        createdAt: Number(post.createdAt) || Date.now(),
        read: false
      };
    }
    return false;
  });

  const notificationEntries = Object.entries(notificationUpdates);
  for (let index = 0; index < notificationEntries.length; index += 500) {
    await database.ref().update(Object.fromEntries(notificationEntries.slice(index, index + 500)));
  }

  for (let index = 0; index < subscriberIds.length; index += 100) {
    const subscriberBatch = subscriberIds.slice(index, index + 100);
    const deviceSnapshots = await Promise.all(
      subscriberBatch.map((uid) => database.ref(`notificationDevices/${uid}`).get())
    );
    deviceSnapshots.forEach((devicesSnapshot, batchIndex) => {
      devicesSnapshot.forEach((deviceSnapshot) => {
        const token = deviceSnapshot.child('token').val();
        if (typeof token === 'string' && token && deviceSnapshot.key) {
          messages.push({
            token,
            notification: {
              title: `Nueva publicación en r/${post.community}`,
              body: typeof post.title === 'string' ? post.title.slice(0, 120) : 'Hay una nueva conversación.'
            },
            data: {
              postId,
              community: post.community,
              url: `/detail/${postId}`
            },
            android: {
              notification: { channelId: 'community_posts' }
            }
          });
          devicePaths.push(`notificationDevices/${subscriberBatch[batchIndex]}/${deviceSnapshot.key}`);
        }
        return false;
      });
      return false;
    });
  }

  for (let index = 0; index < messages.length; index += 500) {
    const batch = messages.slice(index, index + 500);
    try {
      const result = await getMessaging().sendEach(batch);
      const staleDeviceUpdates = {};
      result.responses.forEach((response, responseIndex) => {
        if (
          !response.success &&
          ['messaging/invalid-registration-token', 'messaging/registration-token-not-registered']
            .includes(response.error?.code)
        ) {
          staleDeviceUpdates[devicePaths[index + responseIndex]] = null;
        }
      });
      if (Object.keys(staleDeviceUpdates).length) {
        await database.ref().update(staleDeviceUpdates);
      }
      if (result.failureCount) {
        console.error(`Push delivery failed for ${result.failureCount} of ${batch.length} devices for post ${postId}.`);
      }
    } catch (error) {
      console.error(`Could not send push notifications for post ${postId}.`, error);
    }
  }
});
