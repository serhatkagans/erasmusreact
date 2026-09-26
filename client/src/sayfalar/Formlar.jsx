import { useCallback, useEffect, useRef, useState } from 'react';
import { durum, t } from '../ortak.js';
import { ayrilmaKorumasi } from '../yonlendirme.js';
import { onayla } from '../bilesenler/Kutu.jsx';
import FormListesi from './formlar/Liste.jsx';
import Duzenleyici from './formlar/Duzenleyici.jsx';
import { DoldurGorunumu } from './formlar/Doldur.jsx';
import Yanitlar from './formlar/Yanitlar.jsx';

/**
 * Formlar sayfası: koordinatör form hazırlar ve yanıtları izler, ortak kurum
 * kullanıcısı kendisine gönderilen formları doldurur. Görünüm adres
 * çubuğundaki # ile seçilir:
 *   #              form listesi
 *   #yeni          yeni form (koordinatör)
 *   #duzenle/12    formu düzenle (koordinatör)  · #duzenle/12/ayarlar
 *   #doldur/12     formu doldur / önizle
 *   #yanitlar/12   yanıtlar (koordinatör)
 *
 * GençTek takvimindeki form ekranının bu projeye taşınmış hâli. Değişen iki
 * şey: hedef kitle il değil ORTAK KURUM, ve bütün metinler sözlükten gelir.
 */
export default function Formlar() {
  const koordinator = !!durum.kullanici?.koordinator;
  const [hash, setHash] = useState(location.hash);
  const [tazele, setTazele] = useState(0);
  const [bas, setBas] = useState({ ust: t('form.sayfa.ustbaslik'), baslik: t('form.sayfa.baslik'), giris: '' });
  const [sayfaHata, setSayfaHata] = useState('');
  /* Görünüm yüklenemediyse görünüm yerine yalnızca hata kalır; bir eylem
     (yayımla, sil, hatırlat) başarısız olduysa görünüm yerinde durur. */
  const [yuklenemedi, setYuklenemedi] = useState(false);
  /* Düzenleyicide kaydedilmemiş değişiklik var mı? */
  const kirli = useRef(false);
  const sonHash = useRef(location.hash);

  /* Düzenleyicide kaydedilmemiş değişiklik varsa başka görünüme geçmeden
     sorulur. Önce eski adrese dönülür, sonra sorulur: onay kutusu beklerken
     adres çubuğu yeni görünümü göstermesin. */
  useEffect(() => {
    const degisti = async () => {
      if (location.hash === sonHash.current) return;
      if (kirli.current) {
        const hedef = location.hash;
        history.replaceState(null, '', sonHash.current || location.pathname + location.search);
        if (!(await onayla(t('form.onay.kaydedilmemis'), { evet: t('genel.vazgecKapat'), tehlike: true }))) return;
        kirli.current = false;
        location.hash = hedef;
        return;
      }
      sonHash.current = location.hash;
      setHash(location.hash);
    };
    addEventListener('hashchange', degisti);
    addEventListener('popstate', degisti);
    const onYukleme = o => { if (kirli.current) o.preventDefault(); };
    addEventListener('beforeunload', onYukleme);
    /* Başka sayfaya uygulama içinden geçerken de sorulur. */
    const kaldir = ayrilmaKorumasi(async () => {
      if (!kirli.current) return true;
      if (!(await onayla(t('form.onay.kaydedilmemis'), { evet: t('genel.vazgecKapat'), tehlike: true }))) return false;
      kirli.current = false;
      return true;
    });
    return () => {
      removeEventListener('hashchange', degisti);
      removeEventListener('popstate', degisti);
      removeEventListener('beforeunload', onYukleme);
      kaldir();
    };
  }, []);

  /** Görünüme git. Aynı adrese gitmek hashchange üretmez; o zaman görünüm elle yenilenir. */
  const git = useCallback(h => {
    if (location.hash === h || (h === '#' && !location.hash)) { setTazele(x => x + 1); return; }
    location.hash = h === '#' ? '' : h;
  }, []);

  /** Kayıttan sonra yeni formun adresi: geçmişe yeni kayıt açmadan. */
  const adresiDegistir = useCallback(h => {
    sonHash.current = h;
    history.replaceState(null, '', h);
  }, []);

  const basAyarla = useCallback((ust, baslik, giris = '') => {
    setBas({ ust, baslik, giris });
    document.title = `${baslik} · ${t('site.ad')}`;
  }, []);

  const [gorunum, ham, sekme] = hash.slice(1).split('/');
  const id = Number(ham);
  let secim = 'liste';
  if (durum.kullanici) {
    if (koordinator && gorunum === 'yeni') secim = 'yeni';
    else if (koordinator && gorunum === 'duzenle' && id) secim = 'duzenle';
    else if (koordinator && gorunum === 'yanitlar' && id) secim = 'yanitlar';
    else if (gorunum === 'doldur' && id) secim = 'doldur';
  }
  const gfModu = secim !== 'liste' && !yuklenemedi;

  /* Liste dışındaki görünümler Google Formlar düzeninde: dar sütun. */
  useEffect(() => {
    document.body.classList.toggle('gf-modu', gfModu);
    return () => document.body.classList.remove('gf-modu');
  }, [gfModu]);

  useEffect(() => { setSayfaHata(''); setYuklenemedi(false); scrollTo(0, 0); }, [hash, tazele]);

  const hataGoster = useCallback(hata => {
    basAyarla(t('form.sayfa.ustbaslik'), t('form.sayfa.baslik'));
    setSayfaHata(hata.message);
    setYuklenemedi(true);
  }, [basAyarla]);
  const uyar = useCallback(hata => setSayfaHata(hata.message), []);

  const ortak = { git, basAyarla, hataGoster, uyar, koordinator, kirli, adresiDegistir };
  const anahtar = `${hash}#${tazele}`;

  return (
    <main id="icerik">
      <section className="kapsayici sayfa-bas" id="sayfa-bas">
        <span className="ustbaslik" id="bas-ustbaslik">{bas.ust}</span>
        <h1 id="bas-baslik">{bas.baslik}</h1>
        {bas.giris && <p id="bas-giris">{bas.giris}</p>}
      </section>

      <div className="kapsayici fp-govde">
        <p id="sayfa-hata" className="hata" role="alert">{sayfaHata}</p>
        {!yuklenemedi && (
          <>
            {!durum.kullanici && (
              <section id="liste-gorunum">
                <div id="form-listesi" className="form-listesi">
                  <p className="bos-durum">{t('form.hata.giris')} <a className="metin-bag" href="giris.html">{t('menu.giris')}</a></p>
                </div>
              </section>
            )}
            {durum.kullanici && secim === 'liste' && <FormListesi key={anahtar} {...ortak} />}
            {secim === 'yeni' && <Duzenleyici key={anahtar} {...ortak} />}
            {secim === 'duzenle' && <Duzenleyici key={anahtar} {...ortak} id={id} sekme={sekme} />}
            {secim === 'doldur' && <DoldurGorunumu key={anahtar} {...ortak} id={id} />}
            {secim === 'yanitlar' && <Yanitlar key={anahtar} {...ortak} id={id} />}
          </>
        )}
      </div>
    </main>
  );
}
