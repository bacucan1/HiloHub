import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, take } from 'rxjs';
import { RoleService } from './role.service';

export const adminGuard: CanActivateFn = () => {
  const roleService = inject(RoleService);
  const router = inject(Router);

  return roleService.role$.pipe(
    take(1),
    map((role) => {
      if (role === 'admin') {
        return true;
      }

      void router.navigate(['/home']);
      return false;
    })
  );
};