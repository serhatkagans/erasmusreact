import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../ortak.js';

/**
 * Tarayıcının <dialog> öğesi üstünde modal kutu. `acik` doğruysa
 * `showModal()` ile açılır; Esc ya da `[data-kapat]` düğmesi `onKapat`'ı
 * çağırır, kutuyu kapatmak sahibin işidir (`acik` yanlış yapılır).
 *
 * `koru`: KAYDEDİLMEMİŞ DEĞİŞİKLİK KORUMASI. Kutu açıkken bir alan
 * değiştiyse Vazgeç, × ya da Esc önce sorar. Kaydedip kapatmak sormaz —
 * sahip `acik`'i doğrudan yanlış yapar.
 */
export default function Kutu({ acik, onKapat, koru = false, id, className, children }) {
  const ref = useRef(null);
  const kirli = useRef(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (acik && !d.open) { kirli.current = false; d.showModal(); }
    if (!acik && d.open) d.close();
  }, [acik]);

  const kapatIste = async () => {
    if (koru && kirli.current) {
      if (!(await onayla(t('genel.kaydedilmemis'), { evet: t('genel.vazgecKapat'), tehlike: true }))) return;
    }
    kirli.current = false;
    onKapat?.();
  };

  return (
    <dialog
      ref={ref}
      id={id}
      className={className}
      onInputCapture={() => { kirli.current = true; }}
      onChangeCapture={() => { kirli.current = true; }}
      onCancel={olay => { olay.preventDefault(); kapatIste(); }}
      onClickCapture={olay => {
        if (olay.target.closest('[data-kapat]')) { olay.preventDefault(); olay.stopPropagation(); kapatIste(); }
      }}
    >
      {acik && children}
    </dialog>
  );
}

/* --- Ortak onay kutusu ------------------------------------------------------
   Tarayıcının confirm() kutusunun yerine: sitenin görünümünde, çevrilmiş
   düğmelerle ve silme gibi geri alınamaz işlemlerde kırmızı onay düğmesiyle.
   Söz (Promise) döner: `if (!(await onayla(metin))) return;` */
let onayAc = null;
export function onayla(metin, { baslik = '', evet = t('genel.tamam'), tehlike = false } = {}) {
  if (!onayAc) return Promise.resolve(false);
  return new Promise(coz => onayAc({ metin, baslik, evet, tehlike, coz }));
}

export function OnayKutusu() {
  const [istek, setIstek] = useState(null);
  const ref = useRef(null);
  const evetRef = useRef(null);
  const hayirRef = useRef(null);
  useEffect(() => { onayAc = setIstek; return () => { onayAc = null; }; }, []);

  useEffect(() => {
    if (!istek) return;
    ref.current.showModal();
    /* Tehlikeli işlemde odak "Vazgeç"te başlar: Enter'a yanlışlıkla basmak silmesin. */
    (istek.tehlike ? hayirRef : evetRef).current.focus();
  }, [istek]);

  const bitir = sonuc => {
    const i = istek;
    ref.current.close();
    setIstek(null);
    i?.coz(sonuc);
  };

  return createPortal(
    <dialog ref={ref} className="onay-kutusu" onCancel={o => { o.preventDefault(); bitir(false); }}>
      {istek && (
        <form method="dialog" className="kutu-ic" onSubmit={o => o.preventDefault()}>
          {istek.baslik && <h2 className="onay-baslik">{istek.baslik}</h2>}
          <p className="onay-metin">{istek.metin}</p>
          <div className="kutu-eylem">
            <button ref={evetRef} type="button" className={`dugme onay-evet ${istek.tehlike ? 'dugme-tehlike-dolu' : 'dugme-birincil'}`} onClick={() => bitir(true)}>{istek.evet}</button>
            <button ref={hayirRef} type="button" className="dugme dugme-ikincil onay-hayir" onClick={() => bitir(false)}>{t('genel.vazgec')}</button>
          </div>
        </form>
      )}
    </dialog>,
    document.body,
  );
}

/* --- Kısa bildirim ---------------------------------------------------------
   "Kaydedildi" gibi geri bildirimler ve hatalar için. Ekranın altında
   belirir, kendiliğinden kaybolur; hata daha uzun kalır ve ekran okuyucuya
   hemen okunur (role=alert). */
let bildirimEkle = null;
let sayac = 0;
export function bildir(metin, tur = 'basari') {
  bildirimEkle?.({ id: ++sayac, metin, tur });
}

export function Bildirimler() {
  const [liste, setListe] = useState([]);
  useEffect(() => {
    bildirimEkle = b => {
      setListe(l => [...l, b]);
      setTimeout(() => setListe(l => l.filter(x => x.id !== b.id)), b.tur === 'hata' ? 8000 : 3500);
    };
    return () => { bildirimEkle = null; };
  }, []);
  if (!liste.length) return null;
  return createPortal(
    <div id="bildirimler" className="bildirimler">
      {liste.map(b => (
        <div key={b.id} className={`bildirim bildirim-${b.tur}`} role={b.tur === 'hata' ? 'alert' : 'status'}>
          <span>{b.metin}</span>
          <button type="button" className="bildirim-kapat" aria-label={t('genel.kapat')}
            onClick={() => setListe(l => l.filter(x => x.id !== b.id))}>×</button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
