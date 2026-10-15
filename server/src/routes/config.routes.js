const express = require('express');
const payments = require('../services/payments');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    appName: 'Society Maintenance Portal',
    razorpayConfigured: payments.isConfigured(),
  });
});

module.exports = router;
