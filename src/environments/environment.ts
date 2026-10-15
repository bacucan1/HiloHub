// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  paypal: {
    clientId: '',
    currency: 'USD',
    plans: [
      { id: 'essential', name: 'Hilo Esencial', price: '4.99', paypalPlanId: '' },
      { id: 'plus', name: 'Hilo Plus', price: '9.99', paypalPlanId: '' },
      { id: 'community', name: 'Hilo Comunidad', price: '19.99', paypalPlanId: '' }
    ]
  },
  notifications: {
    vapidKey: ''
  }
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
