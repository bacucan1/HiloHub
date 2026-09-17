import { Injectable } from '@angular/core';
import { getIdTokenResult } from 'firebase/auth';
import { BehaviorSubject, switchMap, of } from 'rxjs';
import { AuthService } from './auth.service';

export type AppRole = 'user' | 'moderator' | 'admin';

@Injectable({ providedIn: 'root' })
export class RoleService {
  private readonly roleSubject = new BehaviorSubject<AppRole>('user');
  readonly role$ = this.roleSubject.asObservable();

  constructor(authService: AuthService) {
    authService.user$.pipe(
      switchMap((user) => user ? getIdTokenResult(user, true) : of(null))
    ).subscribe((token) => {
      const role = token?.claims['role'];
      this.roleSubject.next(role === 'admin' || role === 'moderator' ? role : 'user');
    });
  }

  get role(): AppRole {
    return this.roleSubject.value;
  }

  canModerate(): boolean {
    return this.role === 'admin' || this.role === 'moderator';
  }

  canAdmin(): boolean {
    return this.role === 'admin';
  }
}
