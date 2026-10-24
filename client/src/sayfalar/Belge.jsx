import { useEffect, useRef, useState } from 'react';
import { durum, t, iste, ortakAdi, ortakKisa, yerAdi, etkinlikBaslik, tarihAraligi, tamTarih } from '../ortak.js';
import { useBaslik } from '../bilesenler/Kabuk.jsx';

/**
 * Katılım ve teşekkür belgeleri.
 *
 * ALICI LİSTEDEN SEÇİLİR: ülkeler ve kişiler zaten kayıtlı (ortak kurumlar +
 * ekip tablosu). Listede olmayan konuşmacı/destekçi için serbest ad alanı.
 * ETKİNLİK SEÇİMİ İSTEĞE BAĞLIDIR: proje geneline de belge üretilebilir.
 *
 * Belge METNİ SUNUCUDA kurulur (routes/belge.mjs): ad veritabanından çözülür
 * ve kalıp cümleler isteğin dilinde gelir. Bu sayfa seçimi toplar, gelen
 * belgeleri kâğıda dizer ve yazdırır (belge.css · @media print).
 */

/** Koordinatör tüm kurumları görür; ortak yalnızca kendi kurumunu. */
const gorunurOrtaklar = () => (durum.kullanici.koordinator
  ? durum.ortaklar
  : durum.ortaklar.filter(o => o.id === durum.kullanici.partner));

export default function Belge() {
  useBaslik('belge.sayfa.baslik');
  const k = durum.kullanici;
  const [veri, setVeri] = useState(null);
  const [hata, setHata] = useState('');
  const [secili, setSecili] = useState(() => new Set());
  const [serbestSayi, setSerbestSayi] = useState(0);
  const [cikti, setCikti] = useState(null);
  const [hazirlaniyor, setHazirlaniyor] = useState(false);
  const formRef = useRef(null);
  const ciktiRef = useRef(null);

  useEffect(() => {
    if (!k) return;
    Promise.all([iste('api/ekip'), iste('api/etkinlikler')])
      .then(([ekip, et]) => setVeri({ uyeler: ekip.uyeler, etkinlikler: et.etkinlikler }))
      .catch(err => setHata(err.message));
  }, [k]);

  useEffect(() => { if (cikti) ciktiRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [cikti]);

  const degistir = (degerler, isaretle) => setSecili(s => {
    const yeni = new Set(s);
    for (const d of degerler) { if (isaretle) yeni.add(d); else yeni.delete(d); }
    return yeni;
  });

  const kisiDegerleri = veri ? gorunurOrtaklar().flatMap(o => veri.uyeler.filter(u => u.partner === o.id && u.aktif).map(u => `uye:${u.id}`)) : [];

  const hazirla = async olay => {
    olay.preventDefault();
    const f = olay.currentTarget;
    setHata('');
    const p = new URLSearchParams({ tur: f.tur.value });
    if (f.etkinlik.value) p.set('etkinlik', f.etkinlik.value);
    if (secili.size) p.set('alicilar', [...secili].join(','));
    if (f.ad.value.trim()) p.set('ad', f.ad.value);
    if (f.imzaAd.value.trim()) p.set('imzaAd', f.imzaAd.value);
    if (f.imzaUnvan.value.trim()) p.set('imzaUnvan', f.imzaUnvan.value);
    if (f.metin.value.trim()) p.set('metin', f.metin.value);
    setHazirlaniyor(true);
    try { setCikti(await iste('api/belge?' + p)); } catch (err) { setHata(err.message); } finally { setHazirlaniyor(false); }
  };

  return (
    <main id="icerik">
      <section className="kapsayici sayfa-bas">
        <span className="ustbaslik">{t('belge.ustbaslik')}</span>
        <h1>{t('belge.sayfa.baslik')}</h1>
        <p className="belge-giris">{t('belge.giris')}</p>
      </section>

      <div className="kapsayici">
        {!k && (
          <section className="pano belge-kapali" id="giris-uyarisi">
            <p>{t('belge.hata.giris')}</p>
            <a className="dugme dugme-birincil" href="giris.html">{t('menu.giris')}</a>
          </section>
        )}
        {!veri && hata && <p className="hata" role="alert">{hata}</p>}

        {/* Panel ŞERİTLERDEN kurulur. Üç şerit = üç soru: ne tür belge, kime,
            kimin imzasıyla. */}
        {veri && (
          <form ref={formRef} className="pano belge-form" id="belge-form" onSubmit={hazirla}>
            <div className="pano-bas">
              <h2>{t('belge.form.baslik')}</h2>
              <div className="pano-bas-sag">
                <span className="belge-rozet" id="belge-secim-sayisi">{t('belge.secim.sayi', { n: secili.size + serbestSayi })}</span>
              </div>
            </div>

            <section className="belge-bant">
              <h3 className="belge-adim">{t('belge.adim.ayar')}</h3>
              <div className="form-izgara belge-ikili">
                <label className="alan"><span>{t('belge.tur.alan')}</span>
                  <select name="tur" id="belge-tur" defaultValue="katilim">
                    {['katilim', 'tesekkur'].map(x => <option key={x} value={x}>{t(`belge.tur.${x}`)}</option>)}
                  </select></label>
                {/* Etkinlik seçimi isteğe bağlı: ilk seçenek projenin kendisidir. */}
                <label className="alan"><span>{t('belge.etkinlik.alan')}</span>
                  <select name="etkinlik" id="belge-etkinlik" defaultValue="">
                    <option value="">{t('belge.etkinlik.proje')}</option>
                    {[...veri.etkinlikler].sort((a, b) => a.baslangic.localeCompare(b.baslangic)).map(e => (
                      <option key={e.id} value={String(e.id)}>{`${etkinlikBaslik(e)} · ${tarihAraligi(e.baslangic, e.bitis)}`}</option>
                    ))}
                  </select></label>
              </div>
            </section>

            <fieldset className="belge-bant">
              <legend className="belge-adim">{t('belge.alicilar')}</legend>
              <p className="ipucu">{t('belge.alicilar.ipucu')}</p>
              {/* Her kişi kendi belgesini alır; bu düğme kurum ayrımı yapmadan
                  kayıtlı herkesi işaretler (kurum kutuları hariç). */}
              <div className="belge-toplu">
                <button type="button" id="belge-herkes" className="dugme dugme-ikincil" disabled={!kisiDegerleri.length}
                  onClick={() => degistir(kisiDegerleri, !(kisiDegerleri.length && kisiDegerleri.every(d => secili.has(d))))}>{t('belge.herkes')}</button>
                <span className="ipucu" id="belge-kisi-toplam">{t('belge.kisi.toplam', { n: kisiDegerleri.length })}</span>
              </div>
              <div id="belge-alicilar" className="belge-alicilar">
                {gorunurOrtaklar().map(o => <KurumKarti key={o.id} o={o} uyeler={veri.uyeler} secili={secili} degistir={degistir} />)}
              </div>
              <label className="alan belge-serbest-alan"><span>{t('belge.serbest')}</span>
                <textarea name="ad" id="belge-serbest" rows={2} placeholder={t('belge.serbest.ipucu')}
                  onChange={o => setSerbestSayi(o.target.value.split('\n').filter(s => s.trim()).length)} />
              </label>
            </fieldset>

            <section className="belge-bant">
              <h3 className="belge-adim">{t('belge.adim.imza')}</h3>
              <div className="form-izgara belge-ikili">
                <label className="alan"><span>{t('belge.imza.ad')}</span><input name="imzaAd" maxLength={120} required defaultValue={k.ad || ''} /></label>
                {/* Unvan boş bırakılabilir: sunucu aynı öneriyi kullanır, yer tutucu onu gösterir. */}
                <label className="alan"><span>{t('belge.imza.unvan')}</span>
                  <input name="imzaUnvan" id="belge-imza-unvan" maxLength={120}
                    placeholder={t(k.koordinator ? 'belge.imza.unvan.koordinator' : 'belge.imza.unvan.ortak', { kurum: ortakAdi(k.partner) })} /></label>
              </div>
              <label className="alan"><span>{t('belge.metin')}</span>
                <textarea name="metin" id="belge-metin" rows={3} maxLength={1200} placeholder={t('belge.metin.ipucu')} />
              </label>
            </section>

            <div className="belge-eylem">
              <button type="submit" className="dugme dugme-birincil" disabled={hazirlaniyor}>{t('belge.hazirla')}</button>
              <button type="button" id="belge-temizle" className="metin-bag" onClick={() => {
                formRef.current.reset();
                formRef.current.imzaAd.value = '';
                setCikti(null); setHata(''); setSecili(new Set()); setSerbestSayi(0);
              }}>{t('belge.temizle')}</button>
              <p className="hata" id="belge-hata" role="alert">{hata}</p>
            </div>
          </form>
        )}
      </div>

      {/* Önizleme ve yazdırma. Yazdırmada sayfadaki her şey gizlenir, yalnızca
          bu liste basılır (bkz. belge.css · @media print). */}
      {cikti && (
        <div className="kapsayici belge-cikti" id="belge-cikti" ref={ciktiRef}>
          <div className="belge-arac" id="belge-arac">
            <span id="belge-sayi">{t('belge.hazir', { n: cikti.belgeler.length })}</span>
            <button type="button" id="belge-yazdir" className="dugme dugme-birincil" onClick={() => print()}>{t('belge.yazdir')}</button>
            <button type="button" id="belge-kapat" className="dugme dugme-ikincil" onClick={() => setCikti(null)}>{t('belge.kapat')}</button>
          </div>
          <p className="ipucu" id="belge-yazdir-ipucu">{t('belge.yazdir.ipucu')}</p>
          <div id="belge-listesi" className="belge-listesi">
            {cikti.belgeler.map((b, i) => <Kagit key={i} belge={b} imza={cikti.imza} kunye={cikti.kunye} evSahibi={cikti.etkinlik?.evSahibi} />)}
          </div>
        </div>
      )}
    </main>
  );
}

function KurumKarti({ o, uyeler, secili, degistir }) {
  const kadro = uyeler.filter(u => u.partner === o.id && u.aktif);
  const hepsi = [...kadro.map(u => `uye:${u.id}`), `kurum:${o.id}`];
  const kutu = deger => (
    <input type="checkbox" value={deger} checked={secili.has(deger)} onChange={e => degistir([deger], e.target.checked)} />
  );
  return (
    <div className="belge-kurum">
      <div className="belge-kurum-bas">
        <strong>{o.name}</strong>
        <small>{`${ortakKisa(o.id)} · ${yerAdi(o.country)}`}</small>
        {/* "Tümünü seç" kurumun kendisini de kapsar. */}
        <button type="button" className="metin-bag" onClick={() => degistir(hepsi, !hepsi.every(d => secili.has(d)))}>{t('belge.tumunu')}</button>
      </div>
      <div className="belge-kisiler">
        {kadro.map(u => (
          <label key={u.id} className="onay">
            {kutu(`uye:${u.id}`)}
            <span>{u.ad}{u.rol && <small>{` · ${u.rol}`}</small>}</span>
          </label>
        ))}
        {/* Ekibi boş kurum sessizce geçilmez: yapılacak iş ekip sayfasında. */}
        {!kadro.length && <p className="belge-kisi-yok">{t('belge.kisi.yok') + ' '}<a className="metin-bag" href="ekip.html">{t('belge.kisi.ekle')}</a></p>}
      </div>
      {/* Kurumun kendisi de bir alıcıdır: teşekkür belgesi çoğu zaman kuruma yazılır. */}
      <label className="onay belge-kurum-onay">{kutu(`kurum:${o.id}`)}<span>{t('belge.kuruma')}</span></label>
    </div>
  );
}

/**
 * Tek belge kâğıdı. Görsel dil logodan gelir: yeşil→mavi geçiş çerçevede ve
 * adın altındaki çizgide, logodaki nokta bulutu köşelerde, logo işaretinin
 * kendisi filigranda ve mühürde. Süsler `aria-hidden`: ekran okuyucu yalnızca
 * belgenin metnini okur.
 *
 * Düzenleme tarihi belgeyi ÜRETEN gündür (bugün): belge saklanmadığı için
 * (bkz. lib/belge.mjs) her yazdırma kendi gününü taşır.
 */
const bugun = () => new Date().toISOString().slice(0, 10);

function Kagit({ belge, imza, kunye, evSahibi }) {
  /* Ev sahibinin logo dosyası yoksa (henüz eklenmemiş kurum) mühür kalır. */
  const [logoYok, setLogoYok] = useState(false);
  const evSahibiLogo = evSahibi && !logoYok;
  return (
    <article className={`belge belge--${belge.tur}`}>
      <div className="belge-susler" aria-hidden="true">
        <span className="belge-cerceve" />
        <img className="belge-nokta belge-nokta--us" src="belge-nokta.svg" alt="" />
        <img className="belge-nokta belge-nokta--as" src="belge-nokta.svg" alt="" />
        <span className="belge-yay belge-yay--sol" />
        <span className="belge-yay belge-yay--sag" />
        <img className="belge-filigran" src="belge-logo.png" alt="" />
      </div>

      <header className="belge-ust">
        <img className="belge-logo" src="belge-logo-tam.png" alt={kunye.proje} />
        {/* Üçlü resmî logo: AB Başkanlığı, Ulusal Ajans, AB eş finansmanı
            (kullanıcının istediği sıra, 24 Ekim 2026). Görünürlük kuralı
            gereği belgede de var. */}
        <div className="belge-ab">
          <img src="ab-baskanligi.webp" alt={t('ab.logo.baskanlik')} />
          <img src="ulusal-ajans.webp" alt={t('ab.logo.ajans')} />
          <img src="ab-ortak-finanse.webp" alt={t('ab.logo.ortak')} />
        </div>
      </header>

      <div className="belge-govde">
        <p className="belge-program">{kunye.program}</p>
        <h2 className="belge-baslik">{belge.baslik}</h2>
        <p className="belge-sunulur">{t('belge.sunulur')}</p>
        <p className="belge-ad">{belge.ad}</p>
        <span className="belge-ad-cizgi" aria-hidden="true" />
        {belge.altAd && <p className="belge-altad">{belge.altAd}</p>}
        <p className="belge-metin">{belge.govde}</p>
      </div>

      <footer className="belge-alt">
        <dl className="belge-bilgi">
          <div><dt>{t('belge.tarih')}</dt><dd>{tamTarih(bugun())}</dd></div>
          <div><dt>{t('altbilgi.projeno').split(':')[0]}</dt><dd>{kunye.projeNo}</dd></div>
        </dl>
        {/* Etkinliğe yazılan belgede alt ortada ev sahibi kurumun logosu
            (public/kurum-logo/<kurum>.png), projeye yazılanda proje mührü. */}
        {evSahibiLogo
          ? (
            <div className="belge-evsahibi">
              <span>{t('belge.evsahibi')}</span>
              <img src={`kurum-logo/${evSahibi.id}.png`} alt={evSahibi.ad} onError={() => setLogoYok(true)} />
            </div>
          )
          : (
            <div className="belge-muhur" aria-hidden="true">
              <img src="belge-logo.png" alt="" />
              <span>Erasmus+</span>
            </div>
          )}
        <div className="belge-imza">
          <div className="belge-imza-alan" />
          <div className="belge-imza-cizgi">{imza.adSoyad}</div>
          <div className="belge-birim">{imza.unvan}</div>
        </div>
      </footer>
      <p className="belge-feragat">{kunye.feragat}</p>
    </article>
  );
}
