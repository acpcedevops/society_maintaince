import Razorpay from "razorpay";
import crypto from "crypto";
import { env } from "../config/env.js";

export const razorpay = new Razorpay({
  key_id: env.razorpayKeyId,
  key_secret: env.razorpayKeySecret,
});

export function verifyPaymentSignature({ orderId, paymentId, signature }) {
  const body = `${orderId}|${paymentId}`;
  const expected = crypto.createHmac("sha256", env.razorpayKeySecret).update(body).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export function verifyWebhookSignature(payloadBody, signature, secret = env.razorpayKeySecret) {
  const expected = crypto.createHmac("sha256", secret).update(payloadBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export function isRazorpayConfigured() {
  return (
    env.razorpayKeyId.startsWith("rzp_") &&
    env.razorpayKeySecret.length > 5 &&
    !/xx+|replace|changeme/i.test(env.razorpayKeyId + env.razorpayKeySecret)
  );
}
