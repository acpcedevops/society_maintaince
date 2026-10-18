import api from './api.js';

let sdkPromise = null;

export function loadCashfree(mode = 'production') {
  if (!sdkPromise) {
    sdkPromise = new Promise((resolve, reject) => {
      if (window.Cashfree) return resolve(window.Cashfree);
      const script = document.createElement('script');
      script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
      script.async = true;
      script.onload = () => {
        if (window.Cashfree) resolve(window.Cashfree);
        else reject(new Error('Cashfree SDK failed to initialize.'));
      };
      script.onerror = () => {
        sdkPromise = null;
        reject(new Error('Could not load the Cashfree SDK.'));
      };
      document.body.appendChild(script);
    });
  }
  return sdkPromise.then((Cashfree) =>
    typeof Cashfree === 'function' ? Cashfree({ mode }) : Cashfree
  );
}

export async function createOrder(billId) {
  const { data } = await api.post('/payments/create-order', { billId });
  return data; // { mock, mode, order, amount }
}

export async function createBulkOrder(billIds) {
  const { data } = await api.post('/payments/create-bulk-order', { billIds });
  return data;
}

// Opens the hosted Cashfree checkout for a payment session. Resolves once the
// modal closes; the payment is confirmed server-side via /payments/verify.
export async function openCashfreeCheckout({ paymentSessionId, mode }) {
  const cashfree = await loadCashfree(mode || 'production');
  await cashfree.checkout({ paymentSessionId, redirectTarget: '_modal' });
}

export async function verifyPayment({ orderId }) {
  await api.post('/payments/verify', { order_id: orderId });
}

export async function verifyBulkPayment({ orderId }) {
  await api.post('/payments/verify-bulk', { order_id: orderId });
}

export async function mockPay(billId) {
  await api.post('/payments/mock', { billId });
}

export async function mockPayBulk(billIds) {
  await api.post('/payments/mock-bulk', { billIds });
}
