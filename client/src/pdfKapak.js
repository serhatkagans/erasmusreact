import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import isci from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

/**
 * PDF'in ilk sayfasını tuvale çizer (bültendeki belge kartının kapağı).
 * Bu modül yalnızca sayfada PDF varken yüklenir: pdf.js büyüktür.
 */
GlobalWorkerOptions.workerSrc = isci;

export async function kapakCiz(adres, tuval, genislik) {
  /* CSP eval'e izin vermez; pdf.js de eval kullanmasın. */
  const belge = await getDocument({ url: adres, isEvalSupported: false }).promise;
  try {
    const sayfa = await belge.getPage(1);
    const olcek = (genislik * Math.min(window.devicePixelRatio || 1, 2)) / sayfa.getViewport({ scale: 1 }).width;
    const gorunum = sayfa.getViewport({ scale: olcek });
    tuval.width = Math.floor(gorunum.width);
    tuval.height = Math.floor(gorunum.height);
    await sayfa.render({ canvasContext: tuval.getContext('2d'), viewport: gorunum }).promise;
  } finally {
    belge.destroy();
  }
}
