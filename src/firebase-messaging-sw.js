importScripts('https://www.gstatic.com/firebasejs/12.17.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.17.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBU3-cw0qcH02bMuzK8k5vtJHpSRft_VtQ',
  authDomain: 'crudpmovil.firebaseapp.com',
  databaseURL: 'https://crudpmovil-default-rtdb.firebaseio.com',
  projectId: 'crudpmovil',
  storageBucket: 'crudpmovil.firebasestorage.app',
  messagingSenderId: '902020735158',
  appId: '1:902020735158:web:45400a8e10ca7311c58617'
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notification = payload.notification || {};
  const postId = payload.data?.postId;
  self.registration.showNotification(notification.title || 'HiloHub', {
    body: notification.body || 'Hay una nueva conversación en una comunidad que sigues.',
    icon: '/assets/icon/favicon.png',
    data: { url: postId ? `/detail/${encodeURIComponent(postId)}` : '/notifications' }
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = event.notification.data?.url || '/notifications';
  const target = new URL(path, self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.focus();
      await existing.navigate(target);
      return;
    }
    await clients.openWindow(target);
  })());
});
