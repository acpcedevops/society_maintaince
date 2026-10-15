import api from './api.js';

export function loadRazorpay() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error('Could not load Razorpay SDK.'));
    document.body.appendChild(script);
  });
}

export async function createOrder(billId) {
  const { data } = await api.post('/payments/create-order', { billId });
  return data; // { mock, keyId, order, amount }
}

export async function createBulkOrder(billIds) {
  const { data } = await api.post('/payments/create-bulk-order', { billIds });
  return data;
}

export function openRazorpayCheckout({ keyId, order, user, societyName }) {
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: keyId,
      amount: order.amount,
      currency: order.currency || 'INR',
      name: societyName || 'Society Maintenance',
      description: 'Maintenance Payment',
      order_id: order.id,
      prefill: { name: user?.name, email: user?.email, contact: user?.phone },
      theme: { color: '#1f56ec' },
      handler: (response) => resolve(response),
      modal: { ondismiss: () => reject(new Error('Payment cancelled')) },
    });
    if (rzp.on) {
      rzp.on('payment.failed', (resp) =>
        reject(new Error(resp?.error?.description || 'Payment failed'))
      );
    }
    rzp.open();
  });
}

export async function verifyPayment({ billId, response }) {
  await api.post('/payments/verify', {
    billId,
    razorpay_order_id: response.razorpay_order_id,
    razorpay_payment_id: response.razorpay_payment_id,
    razorpay_signature: response.razorpay_signature,
  });
}

export async function verifyBulkPayment({ billIds, response }) {
  await api.post('/payments/verify-bulk', {
    billIds,
    razorpay_order_id: response.razorpay_order_id,
    razorpay_payment_id: response.razorpay_payment_id,
    razorpay_signature: response.razorpay_signature,
  });
}

export async function mockPay(billId) {
  await api.post('/payments/mock', { billId });
}

export async function mockPayBulk(billIds) {
  await api.post('/payments/mock-bulk', { billIds });
}
