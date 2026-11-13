import { useEffect, useRef, useState } from 'react';
import { durum, t, iste, ortakAdi, ortakKisa, yerAdi, etkinlikBaslik, tarihAraligi } from '../ortak.js';
import { useBaslik } from '../bilesenler/Kabuk.jsx';
import { onayla, bildir } from '../bilesenler/Kutu.jsx';

/** Formdaki metin alanları: kayıt açılınca bunlar ayardan doldurulur. */
const METIN_ALANLARI = ['imzaAd', 'imzaUnvan', 'baslik', 'giris', 'metin'];

/** Formu `/api/belge` sorgusuna çevirir; hazırlama ve kaydetme paylaşır. */
function parametreler(f, secim) {
  const p = new URLSearchParams({ tur: f.tur.value });
  if (f.etkinlik.value) p.set('etkinlik', f.etkinlik.value);
  if (secim.size) p.set('alicilar', [...secim].join(','));
  if (f.ad.value.trim()) p.set('ad', f.ad.value);
  if (Number(f.bos.value) > 0) p.set('bos', f.bos.value);
  for (const alan of METIN_ALANLARI) if (f[alan].value.trim()) p.set(alan, f[alan].value);
  return p;
}

const zamanYaz = iso => new Intl.DateTimeFormat(durum.dil, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

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
  const [bosSayi, setBosSayi] = useState(0);
  const [cikti, setCikti] = useState(null);
  const [hazirlaniyor, setHazirlaniyor] = useState(false);
  /* Kayıtlı belgeler (13 Kasım 2026): ayarlar ad verilerek saklanır; açılan
     kayıt forma doldurulur, "Değişiklikleri kaydet" onu günceller. */
  const [kayitlar, setKayitlar] = useState(null);
  const [acikKayit, setAcikKayit] = useState(null);
  const [kayitAdi, setKayitAdi] = useState('');
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [kaydetIsaret, setKaydetIsaret] = useState(false);
  const [yeniKayit, setYeniKayit] = useState(false);
  const formRef = useRef(null);
  const ciktiRef = useRef(null);

  const kayitlariYukle = () => iste('api/belge/kayitlar').then(v => setKayitlar(v.kayitlar));

  useEffect(() => {
    if (!k) return;
    Promise.all([iste('api/ekip'), iste('api/etkinlikler'), kayitlariYukle()])
      .then(([ekip, et]) => setVeri({ uyeler: ekip.uyeler, etkinlikler: et.etkinlikler }))
      .catch(err => setHata(err.message));
  }, [k]);

  useEffect(() => { if (cikti) ciktiRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [cikti]);

  /* Tarayıcının yazdırmada eklediği adres, sayfa numarası ve tarih satırları
     sayfa kenar boşluğuna basılır. Adlı sayfa (@page belge, belge.css) boşluğu
     sıfırlasa da Chrome bu satırları VARSAYILAN sayfanın boşluğuna göre
     koyuyor; PDF'te çerçevenin üstünde ve altında kalıyorlardı (kullanıcı
     bildirimi, 13 Kasım 2026). Varsayılan sayfa da yalnızca bu sayfa açıkken
     sıfırlanır: belge.css'e genel bir @page yazmak, sayfa değişince başka
     sayfaların (rapor, bülten) yazdırmasını da bozardı. */
  useEffect(() => {
    const stil = document.createElement('style');
    stil.textContent = '@media print { @page { size: A4 landscape; margin: 0 } }';
    document.head.appendChild(stil);
    return () => stil.remove();
  }, []);

  const degistir = (degerler, isaretle) => setSecili(s => {
    const yeni = new Set(s);
    for (const d of degerler) { if (isaretle) yeni.add(d); else yeni.delete(d); }
    return yeni;
  });

  const kisiDegerleri = veri ? gorunurOrtaklar().flatMap(o => veri.uyeler.filter(u => u.partner === o.id && u.aktif).map(u => `uye:${u.id}`)) : [];

  const uret = async p => {
    setHata('');
    setHazirlaniyor(true);
    try { setCikti(await iste('api/belge?' + p)); } catch (err) { setHata(err.message); } finally { setHazirlaniyor(false); }
  };

  /* Hazırlanan her deste KAYDEDİLMEZ (kullanıcı isteği, 13 Kasım 2026):
     deneme baskıları listeyi doldurmasın. Yalnızca "Bu belgeleri kaydet"
     işaretliyse önce kaydedilir, sonra hazırlanır; işaret her kayıttan
     sonra kalkar ki sonraki denemeler kendiliğinden kaydedilmesin. */
  const hazirla = async olay => {
    olay.preventDefault();
    const p = parametreler(olay.currentTarget, secili);
    if (kaydetIsaret && !(await kaydet(p))) return;
    uret(p);
  };

  /** Açık kayıt varsa ve "yeni kayıt" seçilmediyse onu günceller. Başarıda true. */
  const kaydet = async p => {
    setHata('');
    setKaydediliyor(true);
    try {
      const guncelle = acikKayit && !yeniKayit;
      const { kayit } = await iste(guncelle ? `api/belge/kayitlar/${acikKayit.id}` : 'api/belge/kayitlar', {
        method: guncelle ? 'PUT' : 'POST',
        body: JSON.stringify({ ad: kayitAdi, ayar: p.toString() }),
      });
      setAcikKayit(kayit);
      setKayitAdi(kayit.ad);
      setKaydetIsaret(false);
      setYeniKayit(false);
      await kayitlariYukle();
      bildir(t('belge.kayit.kaydedildi'));
      return true;
    } catch (err) { setHata(err.message); return false; } finally { setKaydediliyor(false); }
  };

  /** Kaydı forma doldurur ve belgeleri hemen hazırlar: açılınca yazdırmaya hazır. */
  const kayitAc = async ozet => {
    setHata('');
    try {
      const { kayit } = await iste(`api/belge/kayitlar/${ozet.id}`);
      const ayar = new URLSearchParams(kayit.ayar);
      const f = formRef.current;
      f.tur.value = ayar.get('tur') || 'katilim';
      f.etkinlik.value = ayar.get('etkinlik') || '';
      /* Kayıttan sonra ekipten çıkarılan kişi seçime alınmaz; söylenir. */
      const gecerli = new Set([...kisiDegerleri, ...gorunurOrtaklar().map(o => `kurum:${o.id}`)]);
      const istenen = (ayar.get('alicilar') || '').split(',').filter(Boolean);
      const secim = new Set(istenen.filter(a => gecerli.has(a)));
      const serbest = ayar.getAll('ad').join('\n');
      f.ad.value = serbest;
      f.bos.value = ayar.get('bos') || '0';
      for (const alan of METIN_ALANLARI) f[alan].value = ayar.get(alan) || '';
      setSecili(secim);
      setSerbestSayi(serbest.split('\n').filter(s => s.trim()).length);
      setBosSayi(Number(ayar.get('bos')) || 0);
      setAcikKayit(kayit);
      setKayitAdi(kayit.ad);
      /* Açmak kaydetmek değildir: değişiklik ancak işaretlenince yazılır. */
      setKaydetIsaret(false);
      setYeniKayit(false);
      const eksik = istenen.length - secim.size;
      if (eksik) bildir(t('belge.kayit.eksik', { n: eksik }), 'hata');
      f.scrollIntoView({ behavior: 'smooth', block: 'start' });
      await uret(parametreler(f, secim));
    } catch (err) { setHata(err.message); }
  };

  const kayitSil = async ozet => {
    if (!(await onayla(t('belge.kayit.silSor', { ad: ozet.ad }), { evet: t('belge.kayit.sil'), tehlike: true }))) return;
    try {
      await iste(`api/belge/kayitlar/${ozet.id}`, { method: 'DELETE' });
      if (acikKayit?.id === ozet.id) { setAcikKayit(null); setKayitAdi(''); }
      await kayitlariYukle();
      bildir(t('belge.kayit.silindi'));
    } catch (err) { bildir(err.message, 'hata'); }
  };

  const kayittanCik = () => { setAcikKayit(null); setKayitAdi(''); setKaydetIsaret(false); setYeniKayit(false); };

  const etkinlikAdi = id => {
    const e = veri?.etkinlikler.find(x => x.id === id);
    return e ? etkinlikBaslik(e) : t('belge.kayit.proje');
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

        {veri && kayitlar && (
          <section className="pano belge-kayitlar" id="belge-kayitlar">
            <div className="pano-bas"><h2>{t('belge.kayitlar.baslik')}</h2></div>
            <div className="belge-bant">
              <p className="ipucu">{kayitlar.length ? t('belge.kayitlar.ipucu') : t('belge.kayitlar.bos')}</p>
              {!!kayitlar.length && (
                <ul className="belge-kayit-listesi">
                  {kayitlar.map(r => (
                    <li key={r.id} className={`belge-kayit${acikKayit?.id === r.id ? ' belge-kayit--acik' : ''}`}>
                      <div className="belge-kayit-bilgi">
                        <strong>{r.ad}</strong>
                        <small>
                          {[t(`belge.tur.${r.tur}`), etkinlikAdi(r.etkinlik), t('belge.kayit.sayi', { n: r.sayi }),
                            k.koordinator && ortakKisa(r.partner)].filter(Boolean).join(' · ')}
                        </small>
                        <small>{[zamanYaz(r.updated), r.guncelleyen || r.olusturan].filter(Boolean).join(' · ')}</small>
                      </div>
                      <div className="belge-kayit-eylem">
                        <button type="button" className="dugme dugme-ikincil" onClick={() => kayitAc(r)}>{t('belge.kayit.ac')}</button>
                        <button type="button" className="metin-bag belge-kayit-sil" onClick={() => kayitSil(r)}>{t('belge.kayit.sil')}</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {/* Panel ŞERİTLERDEN kurulur. Üç şerit = üç soru: ne tür belge, kime,
            kimin imzasıyla. */}
        {veri && (
          <form ref={formRef} className="pano belge-form" id="belge-form" onSubmit={hazirla}>
            <div className="pano-bas">
              <h2>{t('belge.form.baslik')}</h2>
              <div className="pano-bas-sag">
                <span className="belge-rozet" id="belge-secim-sayisi">{t('belge.secim.sayi', { n: secili.size + serbestSayi + bosSayi })}</span>
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
              {/* İsimsiz yedek: adı elle yazılacak boş belge (13 Kasım 2026).
                  Tek başına da üretilebilir; kişi seçmek gerekmez. */}
              <label className="alan belge-bos-alan"><span>{t('belge.bos')}</span>
                <input type="number" name="bos" id="belge-bos" min={0} max={200} step={1} defaultValue={0} inputMode="numeric"
                  onChange={o => setBosSayi(Math.max(0, Math.min(200, Math.floor(Number(o.target.value) || 0))))} />
                <small className="ipucu">{t('belge.bos.ipucu')}</small>
              </label>
            </fieldset>

            <section className="belge-bant">
              <h3 className="belge-adim">{t('belge.adim.imza')}</h3>
              <div className="form-izgara belge-ikili">
                {/* Varsayılan imza proje koordinatörününkidir (kullanıcı isteği,
                    13 Kasım 2026); oturumdaki kişinin adı gelmez. Alanlar
                    değiştirilebilir. Unvan silinirse sunucu öneriyi kullanır,
                    yer tutucu onu gösterir. */}
                <label className="alan"><span>{t('belge.imza.ad')}</span><input name="imzaAd" maxLength={120} required defaultValue={IMZA.ad} /></label>
                <label className="alan"><span>{t('belge.imza.unvan')}</span>
                  <input name="imzaUnvan" id="belge-imza-unvan" maxLength={120} defaultValue={IMZA.unvan}
                    placeholder={t(k.koordinator ? 'belge.imza.unvan.koordinator' : 'belge.imza.unvan.ortak', { kurum: ortakAdi(k.partner) })} /></label>
              </div>
              {/* Başlık ve giriş satırı boşsa sözlükteki kalıp basılır. */}
              <div className="form-izgara belge-ikili">
                <label className="alan"><span>{t('belge.baslik.alan')}</span>
                  <input name="baslik" id="belge-baslik" maxLength={120} placeholder={t('belge.tur.katilim')} /></label>
                <label className="alan"><span>{t('belge.giris.alan')}</span>
                  <input name="giris" id="belge-giris" maxLength={200} placeholder={t('belge.sunulur')} /></label>
              </div>
              <label className="alan"><span>{t('belge.metin')}</span>
                <textarea name="metin" id="belge-metin" rows={3} maxLength={1200} placeholder={t('belge.metin.ipucu')} />
              </label>
            </section>

            {/* Kaydetme isteğe bağlıdır: işaretlenmezse deste yalnızca
                hazırlanır (deneme). İşaretliyken ad zorunlu; açık kayıt varsa
                onu güncellemek ya da yeni kayıt açmak seçilir. */}
            <div className="belge-kaydet">
              {acikKayit && (
                <p className="belge-kaydet-acik">
                  <span>{t('belge.kayit.acik', { ad: acikKayit.ad })}</span>
                  <button type="button" className="metin-bag" onClick={kayittanCik}>{t('belge.kayit.kapat')}</button>
                </p>
              )}
              <label className="onay belge-kaydet-isaret">
                <input type="checkbox" id="belge-kaydet-isaret" checked={kaydetIsaret} onChange={o => setKaydetIsaret(o.target.checked)} />
                <span>{t('belge.kayit.kaydet')}</span>
              </label>
              {!kaydetIsaret && <small className="ipucu belge-kaydet-ipucu">{t('belge.kayit.kaydetIpucu')}</small>}
              {kaydetIsaret && (
                <div className="belge-kaydet-ayrinti">
                  <label className="alan"><span>{t('belge.kayit.ad')}</span>
                    <input id="belge-kayit-ad" maxLength={120} required value={kayitAdi} placeholder={t('belge.kayit.adIpucu')}
                      onChange={o => setKayitAdi(o.target.value)} /></label>
                  {acikKayit && (
                    <div className="belge-kaydet-secenek" role="radiogroup">
                      <label className="onay"><input type="radio" name="kayitBicimi" checked={!yeniKayit} onChange={() => setYeniKayit(false)} />
                        <span>{t('belge.kayit.guncelle')}</span></label>
                      <label className="onay"><input type="radio" name="kayitBicimi" checked={yeniKayit} onChange={() => setYeniKayit(true)} />
                        <span>{t('belge.kayit.farkli')}</span></label>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="belge-eylem">
              <button type="submit" className="dugme dugme-birincil" disabled={hazirlaniyor || kaydediliyor}>
                {t(kaydetIsaret ? 'belge.kayit.hazirlaKaydet' : 'belge.hazirla')}</button>
              <button type="button" id="belge-temizle" className="metin-bag" onClick={() => {
                /* reset() alanları varsayılana döndürür: imza yine koordinatörünki. */
                formRef.current.reset();
                setCikti(null); setHata(''); setSecili(new Set()); setSerbestSayi(0); setBosSayi(0); kayittanCik();
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
            {cikti.belgeler.map((b, i) => <Kagit key={`${cikti.etkinlik?.id ?? "proje"}-${i}`} belge={b} imza={cikti.imza} kunye={cikti.kunye} />)}
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
 */

/** Belgelerin varsayılan imzası: proje koordinatörü (HBV). */
const IMZA = { ad: 'Prof. Dr. Ahmet Kibar ÇETİN', unvan: 'Project Coordinator' };

function Kagit({ belge, imza, kunye }) {
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

      {/* Yerleşim dosyalar/Certificates_E-YOUTHPRENEUR (1).pdf örneğine göre
          (13 Kasım 2026): proje logosu üstte ortada, resmî logolar en altta. */}
      <header className="belge-ust">
        <img className="belge-logo" src="belge-logo-tam.png" alt={kunye.proje} />
      </header>

      <div className="belge-govde">
        {/* Başlığın üstündeki "Erasmus+ Programme · … (KA220-YOU)" satırı
            kaldırıldı (kullanıcı isteği, 13 Kasım 2026): program ve proje
            numarası belge metninde zaten geçiyor. */}
        <h2 className="belge-baslik">{belge.baslik}</h2>
        <p className="belge-sunulur">{belge.giris || t('belge.sunulur')}</p>
        {/* İsimsiz yedekte ad yerine elle yazılacak boş çizgi. */}
        {belge.bos
          ? <p className="belge-ad belge-ad--bos" aria-label={t('belge.bos')} />
          : <p className="belge-ad">{belge.ad}</p>}
        {belge.altAd && <p className="belge-altad">{belge.altAd}</p>}
        <p className="belge-metin">{belge.govde}</p>
        <div className="belge-imza">
          <div className="belge-imza-alan" />
          <div className="belge-imza-cizgi">{imza.adSoyad}</div>
          <div className="belge-birim">{imza.unvan}</div>
        </div>
      </div>

      {/* Üçlü resmî logo: AB Başkanlığı, Ulusal Ajans, AB eş finansmanı
          (kullanıcının istediği sıra, 24 Ekim 2026). Görünürlük kuralı gereği
          belgede de var. Yüksek çözünürlüklü PNG'ler örnek PDF'ten alındı:
          eski webp'ler 149 px genişlikteydi, baskıda bulanıklaşıyordu. Örnekte
          feragat metni yok, o yüzden kaldırıldı. */}
      <footer className="belge-ab">
        <img src="ab-baskanligi.png" alt={t('ab.logo.baskanlik')} />
        <img src="ulusal-ajans.png" alt={t('ab.logo.ajans')} />
        <img src="ab-ortak-finanse.png" alt={t('ab.logo.ortak')} />
      </footer>
    </article>
  );
}
