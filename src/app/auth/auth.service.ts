import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import {
  Auth,
  GoogleAuthProvider,
  User,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import { Observable, shareReplay } from 'rxjs';
import { firebaseApp } from '../firebase';
import { get, getDatabase, ref, update } from 'firebase/database';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth: Auth = getAuth(firebaseApp);
  private readonly isNativePlatform = Capacitor.isNativePlatform();
  get currentUser(): User | null {
    return this.auth.currentUser;
  }
  readonly user$ = new Observable<User | null>((subscriber) =>
    onAuthStateChanged(this.auth, subscriber)
  ).pipe(shareReplay({ bufferSize: 1, refCount: true }));

  async login(email: string, password: string): Promise<void> {
    const credential = await signInWithEmailAndPassword(this.auth, email, password);

    if (!credential.user.emailVerified) {
      throw new Error('email-not-verified');
    }

    await this.syncProfile(credential.user);
  }

  async loginWithGoogle(): Promise<void> {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    if (this.isNativePlatform) {
      const result = await FirebaseAuthentication.signInWithGoogle({
        skipNativeAuth: true
      });
      const credential = result.credential;

      if (!credential?.idToken) {
        throw new Error('google-token-missing');
      }

      const firebaseCredential = await signInWithCredential(
        this.auth,
        GoogleAuthProvider.credential(credential.idToken, credential.accessToken)
      );
      await this.syncProfile(firebaseCredential.user);
      return;
    }

    const credential = await signInWithPopup(this.auth, provider);
    await this.syncProfile(credential.user);
  }

  async register(email: string, password: string): Promise<void> {
    const credential = await createUserWithEmailAndPassword(this.auth, email, password);
    await this.syncProfile(credential.user);
    await sendEmailVerification(credential.user);
  }

  async resendVerification(user: User): Promise<void> {
    await sendEmailVerification(user);
  }

  async resetPassword(email: string): Promise<void> {
    await sendPasswordResetEmail(this.auth, email);
  }

  async logout(): Promise<void> {
    await signOut(this.auth);
  }

  private async syncProfile(user: User): Promise<void> {
    const userRef = ref(getDatabase(firebaseApp), `users/${user.uid}`);
    const profile = await get(userRef);
    const profileData: { displayName: string; email: string; role?: 'user' } = {
      displayName: user.displayName || user.email?.split('@')[0] || 'Usuario',
      email: user.email || ''
    };
    if (!profile.exists()) {
      profileData.role = 'user';
    }
    await update(userRef, profileData);
  }
}
