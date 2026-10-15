import { Injectable } from '@angular/core';
import { getIdTokenResult } from 'firebase/auth';
import { catchError, distinctUntilChanged, map, of, shareReplay, switchMap } from 'rxjs';
import { AuthService } from './auth.service';

export type AppRole = 'user' | 'moderator' | 'admin';

@Injectable({ providedIn: 'root' })
export class RoleService {
  private currentRole: AppRole = 'user';
  readonly role$ = this.authService.user$.pipe(
    switchMap((user) => user
      ? getIdTokenResult(user, true).catch((error: unknown) => {
        console.error('No se pudieron cargar los permisos del usuario.', error);
        return null;
      })
      : of(null)),
    map((token) => {
      const role = token?.claims['role'];
      return role === 'admin' || role === 'moderator' ? role : 'user';
    }),
    distinctUntilChanged(),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  constructor(private readonly authService: AuthService) {
    this.role$.subscribe((role) => this.currentRole = role);
  }

  get role(): AppRole {
    return this.currentRole;
  }

  canModerate(): boolean {
    return this.role === 'admin' || this.role === 'moderator';
  }

  canAdmin(): boolean {
    return this.role === 'admin';
  }
}
