import { Component, OnDestroy } from '@angular/core';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { Router } from '@angular/router';
import './firebase';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnDestroy {
  private notificationActionListener?: PluginListenerHandle;

  constructor(private readonly router: Router) {
    if (Capacitor.isNativePlatform()) {
      void FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
        const data = event.notification.data;
        const postId = typeof data === 'object' && data !== null && 'postId' in data && typeof data.postId === 'string'
          ? data.postId
          : null;
        void this.router.navigate(postId ? ['/detail', postId] : ['/notifications']);
      }).then((listener) => this.notificationActionListener = listener).catch((error: unknown) => {
        console.error('No se pudo activar la navegación desde notificaciones push.', error);
      });
    }
  }

  ngOnDestroy(): void {
    void this.notificationActionListener?.remove().catch((error: unknown) => {
      console.error('No se pudo liberar el listener de notificaciones push.', error);
    });
  }
}
