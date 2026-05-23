'use client';

import Tesseract from 'tesseract.js';

let workerInstance: Tesseract.Worker | null = null;
let workerReady = false;
let initPromise: Promise<Tesseract.Worker> | null = null;

export async function getOCRWorker(): Promise<Tesseract.Worker> {
  if (workerInstance && workerReady) return workerInstance;

  if (initPromise) return initPromise;

  initPromise = (async () => {
    const worker = await Tesseract.createWorker('eng', 1, {
      logger: () => {},
    });
    workerInstance = worker;
    workerReady = true;
    return worker;
  })();

  return initPromise;
}

export async function terminateOCRWorker() {
  if (workerInstance) {
    await workerInstance.terminate();
    workerInstance = null;
    workerReady = false;
    initPromise = null;
  }
}

export async function recognizeImage(imageData: string): Promise<string> {
  const worker = await getOCRWorker();
  const result = await worker.recognize(imageData);
  return result.data.text;
}
