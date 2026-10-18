const express = require('express');
const payments = require('../services/payments');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    appName: 'Society Maintenance Portal',
    cashfreeConfigured: payments.isConfigured(),
  });
});

module.exports = router;
