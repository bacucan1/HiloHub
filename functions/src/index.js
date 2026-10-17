import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { getMessaging } from 'firebase-admin/messaging';
import { initializeApp } from 'firebase-admin/app';
import { onValueCreated, onValueDeleted } from 'firebase-functions/v2/database';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

initializeApp();

const allowedRoles = new Set(['user', 'moderator', 'admin']);
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
