import { useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import { t } from '../../ortak.js';
import { bildir } from '../../bilesenler/Kutu.jsx';

/**
 * Dışarıya açık anketin bağlantısı ve karekodu (koordinatör).
 *
 * Bağlantı kısa adrestir (`…/anket/<anahtar>`): karekod ne kadar kısa
 * metin taşırsa o kadar seyrek ve uzaktan okunur olur. Karekod afişe
 * konabilsin diye SVG (baskı, sınırsız büyür) ve PNG olarak indirilir.
 * Taslak anketin bağlantısı yayımlanana kadar "bulunamadı" der.
 */
export const anketAdresi = anahtar => new URL(`anket/${anahtar}`, location.href.replace(/#.*$/, '')).href;

function karekodYolu(metin) {
  const qr = qrcode(0, 'M');
  qr.addData(metin);
  qr.make();
  const n = qr.getModuleCount();
  let yol = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) yol += `M${x} ${y}h1v1h-1z`;
  return { n, yol };
}

const svgMetni = ({ n, yol }) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 ${n + 8} ${n + 8}" shape-rendering="crispEdges">`
  + `<rect x="-4" y="-4" width="${n + 8}" height="${n + 8}" fill="#fff"/><path d="${yol}" fill="#000"/></svg>`;

function indir(blob, ad) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = ad;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function Baglanti({ form }) {
  const adres = anketAdresi(form.disAnahtar);
  const kod = useMemo(() => karekodYolu(adres), [adres]);
  const [kopyalandi, setKopyalandi] = useState(false);
  const dosyaAdi = `anket-${form.id}-karekod`;

  const kopyala = async () => {
    try {
      await navigator.clipboard.writeText(adres);
      setKopyalandi(true);
      bildir(t('form.dis.kopyalandi'));
    } catch { /* pano izni yok: bağlantı kutuda seçilebilir duruyor */ }
  };

  const pngIndir = () => {
    const kenar = 1200, olcek = kenar / (kod.n + 8);
    const tuval = document.createElement('canvas');
    tuval.width = tuval.height = kenar;
    const ctx = tuval.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, kenar, kenar);
    ctx.fillStyle = '#000';
    const qr = qrcode(0, 'M'); qr.addData(adres); qr.make();
    for (let y = 0; y < kod.n; y++) for (let x = 0; x < kod.n; x++) {
      if (qr.isDark(y, x)) ctx.fillRect(Math.floor((x + 4) * olcek), Math.floor((y + 4) * olcek), Math.ceil(olcek), Math.ceil(olcek));
    }
    tuval.toBlob(b => b && indir(b, `${dosyaAdi}.png`), 'image/png');
  };

  return (
    <div className="anket-baglanti">
      <svg className="anket-karekod" viewBox={`-4 -4 ${kod.n + 8} ${kod.n + 8}`} role="img" aria-label={adres} shapeRendering="crispEdges">
        <rect x="-4" y="-4" width={kod.n + 8} height={kod.n + 8} fill="#fff" />
        <path d={kod.yol} fill="#000" />
      </svg>
      <div className="anket-baglanti-govde">
        <strong>{t('form.dis.baglanti')}</strong>
        {form.hal === 'taslak' && <small className="soluk">{t('form.dis.taslakUyari')}</small>}
        <input className="anket-adres" readOnly value={adres} onFocus={o => o.target.select()} aria-label={t('form.dis.baglanti')} />
        <div className="fp-satir">
          <button type="button" className="dugme dugme-ikincil" onClick={kopyala}>{kopyalandi ? t('form.dis.kopyalandiKisa') : t('form.dis.kopyala')}</button>
          <button type="button" className="metin-bag" onClick={() => indir(new Blob([svgMetni(kod)], { type: 'image/svg+xml' }), `${dosyaAdi}.svg`)}>{t('form.dis.svg')}</button>
          <button type="button" className="metin-bag" onClick={pngIndir}>{t('form.dis.png')}</button>
          {form.hal !== 'taslak' && <a className="metin-bag" href={adres} target="_blank" rel="noopener">{t('form.dis.ac')}</a>}
        </div>
      </div>
    </div>
  );
}
