export const environment = {
  production: true,
  paypal: {
    demoMode: false,
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
