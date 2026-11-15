// Online payment providers as the customer sees them (doc 10.9). The server says which one is
// in use (quote.onlineProvider, order.payment.method); the page never picks one itself.
export const PAY_PROVIDERS = {
  RAZORPAY: {
    name: 'Razorpay',
    // Razorpay's own window opens on top of our page
    method: 'UPI (Google Pay, PhonePe, Paytm, BHIM), cards, net banking or wallets, in Razorpay’s secure window',
    where: 'in Razorpay’s secure window',
  },
  PHONEPE: {
    name: 'PhonePe',
    // PhonePe's own page, then back to ours
    method: 'Google Pay, PhonePe, Paytm, BHIM or any UPI app, a UPI QR, or a card, on PhonePe’s secure page',
    where: 'on PhonePe’s secure page',
  },
};

export const providerName = (code) => PAY_PROVIDERS[code]?.name ?? 'the payment provider';

// how an online payment was made, as each provider reports it
export const PAY_MODE = {
  // PhonePe
  UPI_INTENT: 'UPI app',
  UPI_COLLECT: 'UPI',
  UPI_QR: 'UPI QR',
  CARD: 'card',
  NET_BANKING: 'net banking',
  // Razorpay
  upi: 'UPI',
  card: 'card',
  netbanking: 'net banking',
  wallet: 'wallet',
  emi: 'EMI',
  paylater: 'pay later',
};
