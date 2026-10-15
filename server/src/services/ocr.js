let workerPromise = null;

async function getWorker() {
  if (!workerPromise) {
    const { createWorker } = require('tesseract.js');
    workerPromise = createWorker('eng');
  }
  return workerPromise;
}

async function extractText(filePath) {
  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(filePath);
    return data.text || '';
  } catch (err) {
    console.error('OCR failed:', err.message);
    return '';
  }
}

// Best-effort parse of common fields from receipt text.
function parseReceipt(text) {
  const result = {};
  const amountMatch = text.match(/(?:total|amount|grand total|net)\D{0,12}([0-9][0-9,]*\.?[0-9]{0,2})/i);
  if (amountMatch) result.amount = Number(amountMatch[1].replace(/,/g, ''));
  if (result.amount == null) {
    const numbers = text.match(/\b\d[\d,]*\.?\d{0,2}\b/g) || [];
    const candidates = numbers
      .map((n) => Number(n.replace(/,/g, '')))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (candidates.length) result.amount = Math.max(...candidates);
  }

  const dateMatch = text.match(/(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/);
  if (dateMatch) {
    const [d, m, y] = dateMatch[1].split(/[/-]/);
    const year = y.length === 2 ? `20${y}` : y;
    const iso = `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    if (!Number.isNaN(Date.parse(iso))) result.date = iso;
  }

  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const vendorLine = lines.find((l) => /[A-Za-z]{3,}/.test(l) && !/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(l) && !/\d{3,}/.test(l));
  if (vendorLine) result.vendor = vendorLine.replace(/[^A-Za-z0-9 &.'-]/g, '').trim().slice(0, 80);

  return result;
}

module.exports = { extractText, parseReceipt };
