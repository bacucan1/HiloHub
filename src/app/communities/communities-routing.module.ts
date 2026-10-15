import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CommunitiesPage } from './communities.page';

const routes: Routes = [{ path: '', component: CommunitiesPage }];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class CommunitiesPageRoutingModule {}
