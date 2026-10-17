// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  paypal: {
    demoMode: true,
    clientId: 'AQE7XCUbsJpiYZKkPxao45TzNV7YkJzNibNhYLMa0RPPIzNLVNCl1O2whxUcy3bJlOVz5gy4dey7fEek',
    currency: 'USD',
    plans: [
      { id: 'essential', name: 'Hilo Esencial', price: '4.99', paypalPlanId: 'P-95Y18293LX6619059NLJ6XJA' },
      { id: 'plus', name: 'Hilo Plus', price: '9.99', paypalPlanId: 'P-30A02929SL0390045NLJ6XJI' },
      { id: 'community', name: 'Hilo Comunidad', price: '19.99', paypalPlanId: 'P-5LF14786GT960231TNLJ6XJY' }
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
