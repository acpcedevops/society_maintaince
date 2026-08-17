import { createWorker } from "tesseract.js";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TESS_DATA = path.join(__dirname, "..", "..", "node_modules", "tesseract.js-core");

export async function preprocessImage(inputPath, outputPath) {
  await sharp(inputPath)
    .grayscale()
    .normalize()
    .sharpen()
    .linear(1.5, -60)
    .toFile(outputPath);
  return outputPath;
}

export async function ocrReceipt(imagePath) {
  let preprocessed = null;
  try {
    preprocessed = await preprocessImage(imagePath, imagePath + ".pp.png");
    const worker = await createWorker("eng", 1, { cachePath: TESS_DATA });
    try {
      const { data } = await worker.recognize(preprocessed);
      return {
        text: data.text.trim(),
        confidence: data.confidence,
      };
    } finally {
      await worker.terminate();
    }
  } finally {
    if (preprocessed && fs.existsSync(preprocessed)) fs.unlinkSync(preprocessed);
  }
}

function firstNumberIn(line) {
  const match = line.replace(/,/g, "").match(/(\d+(?:\.\d{1,2})?)/);
  return match ? parseFloat(match[1]) : null;
}

export function parseReceipt(text) {
  const dates = text.match(/\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b/g);
  const lines = text
    .split("\n")
    .map((l) => l.trim().replace(/\s+/g, " "))
    .filter(Boolean);

  let amount = null;
  const totalLines = lines.filter((l) => /(total|amount|grand\s*total|payable)/i.test(l) && /[0-9]/.test(l));
  const currencyLines = lines.filter((l) => /(rs\.?|₹|inr)/i.test(l) && /[0-9]/.test(l));
  if (totalLines.length) {
    for (const line of totalLines) {
      const n = firstNumberIn(line);
      if (n && n > 0) { amount = n; break; }
    }
  }
  if (!amount) {
    for (const line of currencyLines) {
      const n = firstNumberIn(line);
      if (n && n > 0) { amount = n; break; }
    }
  }
  if (!amount) {
    const numeric = lines.filter((l) => /^\d[\d,.]*$/.test(l)).map(firstNumberIn).filter((n) => n > 0);
    if (numeric.length) amount = Math.max(...numeric);
  }

  const vendorLine = lines.find(
    (l) => !/^\d/.test(l) && !/(date|invoice|gst|bill|receipt|total|sub|amount|tax|phone|www|\.com)/i.test(l) && l.length > 2
  );
  return {
    amount,
    date: dates ? dates[0] : null,
    vendor: vendorLine || "Unknown Vendor",
    text,
  };
}
