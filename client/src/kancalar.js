import { useCallback, useEffect, useState } from 'react';
import { iste } from './ortak.js';

/**
 * Sunucudan veri çeker. `{ veri, hata, yukleniyor, yenile }` döner;
 * `yenile()` aynı isteği yeniden yapar (kaydetmeden sonra).
 */
export function useVeri(yol) {
  const [durumu, setDurumu] = useState({ veri: null, hata: null, yukleniyor: true });
  const [surum, setSurum] = useState(0);
  useEffect(() => {
    if (!yol) return;
    let iptal = false;
    setDurumu(d => ({ ...d, yukleniyor: true }));
    iste(yol)
      .then(veri => { if (!iptal) setDurumu({ veri, hata: null, yukleniyor: false }); })
      .catch(hata => { if (!iptal) setDurumu(d => ({ ...d, hata, yukleniyor: false })); });
    return () => { iptal = true; };
  }, [yol, surum]);
  const yenile = useCallback(() => setSurum(s => s + 1), []);
  return { ...durumu, yenile };
}

/**
 * Veri geldikten sonra adresteki çapaya (`#ispaketleri`) kaydırır: sayfa
 * başka sayfadan çapalı adresle açıldığında hedef öğe ilk çizimde yoktu.
 */
export function useCapayaKaydir(hazir) {
  useEffect(() => {
    if (!hazir || !location.hash) return;
    const hedef = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    hedef?.scrollIntoView();
  }, [hazir]);
}
