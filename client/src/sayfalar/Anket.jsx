import { useCallback, useEffect, useRef, useState } from 'react';
import { durum, t } from '../ortak.js';
import { useKonum } from '../yonlendirme.js';
import { DoldurFormu } from './formlar/Doldur.jsx';

/**
 * Dışarıya açık anket: `anket.html?k=<anahtar>` (kısa adres: `anket/<anahtar>`).
 *
 * Giriş istemez; bağlantıyı (ya da afişteki karekodu) alan herkes doldurur,
 * isimsiz. Doldurma ekranı Formlar'dakinin aynısıdır (DoldurFormu) — yalnızca
 * taslak kaydı yok ve gönderim routes/anket.mjs'e gider. Gönderince teşekkür
 * kartı çıkar; aynı cihazdan yeni bir yanıt da gönderilebilir (ortak bir
 * okul bilgisayarından sırayla doldurulabilsin diye).
 */
export default function Anket() {
  const { params } = useKonum();
  const anahtar = params.get('k') || '';
  const [f, setF] = useState(null);
  const [hata, setHata] = useState('');
  const [gonderildi, setGonderildi] = useState(false);
  const [tur, setTur] = useState(0);
  const tuzak = useRef(null);

  useEffect(() => {
    document.body.classList.add('gf-modu');
    return () => document.body.classList.remove('gf-modu');
  }, []);

  useEffect(() => {
    if (!/^[\w-]{8,40}$/.test(anahtar)) { setHata(t('anket.hata.bulunamadi')); return; }
    fetch(`api/anket/${anahtar}`).then(async yanit => {
      const veri = await yanit.json().catch(() => ({}));
      if (!yanit.ok) throw Error(durum.sozluk[veri.error] || veri.error || t('genel.hata'));
      document.title = `${veri.baslik} · ${t('site.ad')}`;
      setF({
        ...veri,
        id: anahtar,
        doldurur: true,
        hal: 'acik',
        gorselKaynak: veri.gorsel ? `api/anket/${anahtar}/gorsel?v=${encodeURIComponent(veri.gorsel)}` : '',
      });
    }).catch(h => setHata(h.message));
  }, [anahtar]);

  const gonder = useCallback(async yanitlar => {
    const yanit = await fetch(`api/anket/${anahtar}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yanitlar, web: tuzak.current?.value || '' }),
    });
    const veri = await yanit.json().catch(() => ({}));
    if (!yanit.ok) throw Error(durum.sozluk[veri.error] || veri.error || t('genel.hata'));
    setGonderildi(true);
    scrollTo(0, 0);
  }, [anahtar]);

  const basAyarla = useCallback(() => {}, []);

  return (
    <main id="icerik">
      <div className="kapsayici fp-govde anket-govde">
        {hata && <p id="sayfa-hata" className="hata" role="alert">{hata}</p>}
        {!hata && !f && <p className="bos-durum">{t('genel.yukleniyor')}</p>}
        {f && gonderildi && (
          <section className="gf">
            <div className="fp-yigin">
              <header className="fp-kart gf-bas anket-tesekkur">
                <h1 className="gf-form-baslik">{f.baslik}</h1>
                <p>{t('anket.tesekkur')}</p>
                <p><button type="button" className="metin-bag" onClick={() => { setGonderildi(false); setTur(x => x + 1); }}>{t('anket.yeniYanit')}</button></p>
              </header>
            </div>
          </section>
        )}
        {f && !gonderildi && (
          <>
            {/* Tuzak alanı: ekranda ve ekran okuyucuda görünmez; otomatik doldurucular doldurur. */}
            <input ref={tuzak} name="web" tabIndex={-1} autoComplete="off" aria-hidden="true" className="anket-tuzak" defaultValue="" />
            <DoldurFormu key={tur} f={f} basAyarla={basAyarla} koordinator={false} disGonder={gonder} />
            <p className="anket-gizlilik soluk">{t('anket.gizlilik')}</p>
          </>
        )}
      </div>
    </main>
  );
}
