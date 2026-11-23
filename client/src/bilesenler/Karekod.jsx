import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/* Karekod bir adresi taşır: NFC'si olmayan telefon kamerasıyla okutur.
   Kareler tek bir SVG yolu olarak çizilir (innerHTML yok). Profil kartı
   ve proje kartı paylaşır. */
export default function Karekod({ metin }) {
  const { n, yol } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(metin);
    qr.make();
    const n = qr.getModuleCount();
    let yol = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) yol += `M${x} ${y}h1v1h-1z`;
    return { n, yol };
  }, [metin]);
  return (
    <svg className="profil-karekod-svg" viewBox={`-4 -4 ${n + 8} ${n + 8}`} role="img" aria-label={metin} shapeRendering="crispEdges">
      <rect x="-4" y="-4" width={n + 8} height={n + 8} fill="#fff" />
      <path d={yol} fill="#000" />
    </svg>
  );
}
