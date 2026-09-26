import { useEffect, useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import { durum, t, iste, ortakAdi, ortakKisa, yerAdi, basHarfler } from '../ortak.js';
import { useKonum } from '../yonlendirme.js';
import { useBaslik } from '../bilesenler/Kabuk.jsx';
import { onayla } from '../bilesenler/Kutu.jsx';

/**
 * Herkese açık profil kartı: `profil.html?u=<kullanici>`. Oturum istemez;
 * adres NFC etiketine yazılıp dağıtılır. Kişinin adı, unvanı, kurumu,
 * konuştuğu diller, kısa tanıtımı, telefonu (WhatsApp / arama), e-postası,
 * LinkedIn'i, rehber kartı ve karekodu dışında her şey projenin ortak
 * tanıtımıdır.
 */

/* Simgeler sabit SVG'dir (dışarıdan yüklenmez, CSP 'self'). */
const SIMGE = {
  linkedin: <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 10.5v6M8 7.5v.01M11.5 16.5v-6M11.5 13.2a2.7 2.7 0 0 1 5 1.3v2" /></>,
  instagram: <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><path d="M17.3 6.7v.01" /></>,
  x: <><path d="M4 4l11.7 16H20L8.3 4z" /><path d="M19.5 4l-6.2 7M10.7 13L4.5 20" /></>,
  whatsapp: <><path d="M3.5 20.5l1.3-4.2A8.5 8.5 0 1 1 8 19.3z" /><path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.6-2-1-1 .9a5 5 0 0 1-2.8-2.8l.9-1-1-2z" /></>,
  telefon: <path d="M5 4h3.5l1.5 4-2 1.5a11 11 0 0 0 6.5 6.5l1.5-2 4 1.5V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />,
  eposta: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3.5 6l8.5 7 8.5-7" /></>,
  rehber: <><circle cx="10" cy="8" r="4" /><path d="M3 20a7 7 0 0 1 12.5-4.3M19 14v6M16 17h6" /></>,
  karekod: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M21 14v.01M14 21h7v-4" /></>,
};
const MAX_HAKKINDA = 300;
const MAX_UNVAN = 80;

/* Formda sunulan diller: ortak ülkelerin dilleri, Karayipler (Sint
   Maarten: Felemenkçe, Papiamento) ve yaygın Avrupa dilleri. Adlar
   izleyicinin dilinde tarayıcıdan gelir; çeviri anahtarı gerekmez. */
const DIL_SECENEK = ['tr', 'en', 'it', 'ro', 'pt', 'da', 'nl', 'pap', 'es', 'fr', 'de', 'el', 'bg', 'ar', 'ru'];
const dilAdi = kod => {
  try { return new Intl.DisplayNames([durum.dil], { type: 'language' }).of(kod) || kod; } catch { return kod; }
};

/* Karekod kartın kendi adresini taşır: NFC'si olmayan telefon kamerasıyla
   okutur. Kareler tek bir SVG yolu olarak çizilir (innerHTML yok). */
function Karekod({ metin }) {
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

/* Seçilen görsel tarayıcıda kare kırpılıp 600 piksele küçültülür ve JPEG
   olarak gönderilir: telefondan gelen 5 MB'lık fotoğraf ~100 KB'a iner. */
const KENAR = 600;
async function kareKucult(dosya) {
  const resim = await createImageBitmap(dosya);
  const kisa = Math.min(resim.width, resim.height);
  const tuval = document.createElement('canvas');
  tuval.width = tuval.height = Math.min(KENAR, kisa);
  tuval.getContext('2d').drawImage(resim,
    (resim.width - kisa) / 2, (resim.height - kisa) / 2, kisa, kisa, 0, 0, tuval.width, tuval.height);
  resim.close();
  return new Promise((coz, reddet) => tuval.toBlob(b => (b ? coz(b) : reddet(new Error(t('profil.hata.tur')))), 'image/jpeg', 0.86));
}

export default function Profil() {
  const { params } = useKonum();
  const kullanici = params.get('u') || '';
  const [kisi, setKisi] = useState(null);
  const [yok, setYok] = useState('');
  const [fotoHata, setFotoHata] = useState('');
  const [kopyalandi, setKopyalandi] = useState(false);
  const [duzen, setDuzen] = useState(null);
  const [duzenHata, setDuzenHata] = useState('');
  const [karekod, setKarekod] = useState(false);
  const dosya = useRef(null);
  useBaslik(kisi ? kisi.ad : 'profil.baslik', { hazir: !!kisi });

  useEffect(() => {
    let iptal = false;
    setKisi(null); setYok(''); setDuzen(null);
    iste(`api/profil?u=${encodeURIComponent(kullanici)}`)
      .then(k => { if (!iptal) setKisi(k); })
      .catch(err => { if (!iptal) setYok(err.message); });
    return () => { iptal = true; };
  }, [kullanici]);

  if (yok) return <main className="profil-sayfa"><p className="profil-yok" id="profil-yok" role="alert">{yok}</p></main>;

  /* Kişinin kendisi ve proje yöneticisi fotoğrafı değiştirebilir; sunucu
     da aynı kuralı ayrıca uygular. */
  const yetkili = kisi && durum.kullanici && (durum.kullanici.kullanici === kisi.kullanici || durum.kullanici.koordinator);
  const yol = kisi && `api/profil/foto?u=${encodeURIComponent(kisi.kullanici)}`;
  const kurum = kisi && durum.ortaklar.find(o => o.id === kisi.partner);

  const fotoSec = async () => {
    const secilen = dosya.current.files[0];
    dosya.current.value = '';
    if (!secilen) return;
    setFotoHata('');
    try {
      const veri = await kareKucult(secilen).catch(() => { throw new Error(t('profil.hata.tur')); });
      const { foto } = await iste(yol, { method: 'PUT', body: veri, headers: { 'Content-Type': 'image/jpeg' } });
      setKisi(k => ({ ...k, foto }));
    } catch (err) { setFotoHata(err.message); }
  };

  const fotoKaldir = async () => {
    if (!(await onayla(t('profil.foto.kaldirOnay'), { evet: t('profil.foto.kaldir'), tehlike: true }))) return;
    setFotoHata('');
    try {
      const { foto } = await iste(yol, { method: 'DELETE' });
      setKisi(k => ({ ...k, foto }));
    } catch (err) { setFotoHata(err.message); }
  };

  /* Kart bilgileri: fotoğrafla aynı yetki. Telefon ülke koduyla
     yazılır; sunucu biçimi denetleyip boşluksuz hâlde saklar. */
  const bilgiKaydet = async e => {
    e.preventDefault();
    setDuzenHata('');
    try {
      const yeni = await iste(`api/profil?u=${encodeURIComponent(kisi.kullanici)}`, { method: 'PUT', body: JSON.stringify(duzen) });
      setKisi(k => ({ ...k, ...yeni }));
      setDuzen(null);
    } catch (err) { setDuzenHata(err.message); }
  };

  const kartAdresi = kisi && new URL(`profil.html?u=${encodeURIComponent(kisi.kullanici)}`, location.href).toString();

  /* Paylaş: telefonda sistemin paylaşım menüsü, masaüstünde panoya kopyalama. */
  const paylas = async () => {
    const adres = kartAdresi;
    try {
      if (navigator.share) return await navigator.share({ title: `${kisi.ad} · ${t('site.ad')}`, url: adres });
      await navigator.clipboard.writeText(adres);
      setKopyalandi(true);
      setTimeout(() => setKopyalandi(false), 2000);
    } catch { /* Kullanıcı paylaşımı kapattı; yapılacak bir şey yok. */ }
  };

  return (
    <main className="profil-sayfa">
      <article className="profil-kart" id="profil-kart" aria-busy={!kisi || undefined}>
        <div className="profil-bant"><span>{t('profil.ust')}</span></div>
        <div className={`profil-avatar${kisi?.foto ? ' profil-avatar-foto' : ''}`} id="profil-avatar" aria-hidden="true">
          {kisi && (kisi.foto
            ? <img src={`api/profil/foto?u=${encodeURIComponent(kisi.kullanici)}&v=${encodeURIComponent(kisi.foto)}`} alt={kisi.ad} />
            : basHarfler(kisi.ad))}
        </div>
        {yetkili && (
          <div className="profil-foto-eylem" id="profil-foto-eylem">
            <label className="dugme dugme-hayalet dugme-kucuk profil-foto-sec">
              <span>{t('profil.foto.yukle')}</span>
              <input ref={dosya} type="file" accept="image/jpeg,image/png,image/webp" className="gorsel-gizli" onChange={fotoSec} />
            </label>
            {kisi.foto && <button type="button" className="dugme dugme-hayalet dugme-kucuk" onClick={fotoKaldir}>{t('profil.foto.kaldir')}</button>}
            <p className="hata" role="alert">{fotoHata}</p>
          </div>
        )}
        <h1 className="profil-ad" id="profil-ad">{kisi?.ad}</h1>
        {kisi?.unvan && <p className="profil-unvan" id="profil-unvan">{kisi.unvan}</p>}
        <p className="profil-kurum" id="profil-kurum">
          {kisi && ortakAdi(kisi.partner)}
          {kurum && <span>{`${ortakKisa(kisi.partner)} · ${yerAdi(kurum.country)}`}</span>}
        </p>

        {kisi?.diller?.length > 0 && !duzen && (
          <ul className="profil-diller" id="profil-diller" aria-label={t('profil.diller')}>
            {kisi.diller.map(kod => <li key={kod}>{dilAdi(kod)}</li>)}
          </ul>
        )}

        {kisi?.hakkinda && !duzen && <p className="profil-hakkinda" id="profil-hakkinda">{kisi.hakkinda}</p>}

        {/* Rehbere kaydet her kartta var; diğer düğmeler bilgi girilmişse çıkar. */}
        {kisi && !duzen && (
          <div className="profil-iletisim" id="profil-iletisim">
            {kisi.telefon && <>
              <a className="profil-sosyal-bag profil-sosyal-whatsapp" href={`https://wa.me/${kisi.telefon.slice(1)}`} target="_blank" rel="noopener noreferrer">
                <svg viewBox="0 0 24 24" aria-hidden="true">{SIMGE.whatsapp}</svg>
                <span>{t('profil.whatsapp')}</span>
              </a>
              <a className="profil-sosyal-bag profil-sosyal-telefon" href={`tel:${kisi.telefon}`}>
                <svg viewBox="0 0 24 24" aria-hidden="true">{SIMGE.telefon}</svg>
                <span>{t('profil.ara')}</span>
              </a>
            </>}
            {kisi.eposta && (
              <a className="profil-sosyal-bag profil-sosyal-eposta" href={`mailto:${kisi.eposta}`}>
                <svg viewBox="0 0 24 24" aria-hidden="true">{SIMGE.eposta}</svg>
                <span>{t('profil.eposta')}</span>
              </a>
            )}
            {kisi.linkedin && (
              <a className="profil-sosyal-bag profil-sosyal-linkedin" href={kisi.linkedin} target="_blank" rel="noopener noreferrer">
                <svg viewBox="0 0 24 24" aria-hidden="true">{SIMGE.linkedin}</svg>
                <span>{t('profil.linkedin')}</span>
              </a>
            )}
            <a className="profil-sosyal-bag profil-sosyal-rehber" id="profil-rehber" href={`api/profil/vcard?u=${encodeURIComponent(kisi.kullanici)}`} download={`${kisi.kullanici}.vcf`}>
              <svg viewBox="0 0 24 24" aria-hidden="true">{SIMGE.rehber}</svg>
              <span>{t('profil.rehber')}</span>
            </a>
            <button type="button" className="profil-sosyal-bag profil-sosyal-rehber" id="profil-karekod-ac"
              aria-expanded={karekod} onClick={() => setKarekod(a => !a)}>
              <svg viewBox="0 0 24 24" aria-hidden="true">{SIMGE.karekod}</svg>
              <span>{t(karekod ? 'profil.karekodGizle' : 'profil.karekod')}</span>
            </button>
          </div>
        )}

        {kisi && karekod && !duzen && (
          <figure className="profil-karekod" id="profil-karekod">
            <Karekod metin={kartAdresi} />
            <figcaption>{t('profil.karekodIpucu')}</figcaption>
          </figure>
        )}

        {yetkili && !duzen && (
          <button type="button" className="dugme dugme-hayalet dugme-kucuk profil-duzenle" id="profil-duzenle"
            onClick={() => {
              setDuzenHata('');
              setDuzen({
                telefon: kisi.telefon || '', eposta: kisi.eposta || '', hakkinda: kisi.hakkinda || '',
                unvan: kisi.unvan || '', linkedin: kisi.linkedin || '', diller: kisi.diller || [],
              });
            }}>
            {t('profil.bilgi.duzenle')}
          </button>
        )}

        {duzen && (
          <form className="profil-bilgi-form" id="profil-bilgi-form" onSubmit={bilgiKaydet}>
            <label className="alan">
              <span>{t('profil.bilgi.unvan')}</span>
              <input value={duzen.unvan} maxLength={MAX_UNVAN} autoComplete="organization-title"
                placeholder={t('profil.bilgi.unvanIpucu')}
                onChange={e => setDuzen(d => ({ ...d, unvan: e.target.value }))} />
            </label>
            <fieldset className="alan profil-dil-sec">
              <legend className="alan-legend">{t('profil.bilgi.diller')}</legend>
              <div>
                {DIL_SECENEK.map(kod => {
                  const secili = duzen.diller.includes(kod);
                  return (
                    <label key={kod} className={secili ? 'secili' : undefined}>
                      <input type="checkbox" checked={secili}
                        onChange={() => setDuzen(d => ({ ...d, diller: secili ? d.diller.filter(k => k !== kod) : [...d.diller, kod] }))} />
                      {dilAdi(kod)}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <label className="alan">
              <span>{t('profil.bilgi.hakkinda')}</span>
              <textarea value={duzen.hakkinda} maxLength={MAX_HAKKINDA} rows={4}
                placeholder={t('profil.bilgi.hakkindaIpucu')}
                onChange={e => setDuzen(d => ({ ...d, hakkinda: e.target.value }))} />
              <small className="profil-sayac">{`${[...duzen.hakkinda].length} / ${MAX_HAKKINDA}`}</small>
            </label>
            <label className="alan">
              <span>{t('profil.bilgi.telefon')}</span>
              <input type="tel" inputMode="tel" autoComplete="tel" value={duzen.telefon} placeholder="+90 555 123 45 67"
                onChange={e => setDuzen(d => ({ ...d, telefon: e.target.value }))} />
              <small>{t('profil.bilgi.telefonIpucu')}</small>
            </label>
            <label className="alan">
              <span>{t('profil.bilgi.eposta')}</span>
              <input type="email" autoComplete="email" value={duzen.eposta} maxLength={200}
                onChange={e => setDuzen(d => ({ ...d, eposta: e.target.value }))} />
              <small>{t('profil.bilgi.epostaIpucu')}</small>
            </label>
            <label className="alan">
              <span>{t('profil.bilgi.linkedin')}</span>
              <input type="url" inputMode="url" value={duzen.linkedin} maxLength={200} placeholder="linkedin.com/in/…"
                onChange={e => setDuzen(d => ({ ...d, linkedin: e.target.value }))} />
              <small>{t('profil.bilgi.linkedinIpucu')}</small>
            </label>
            <p className="hata" role="alert">{duzenHata}</p>
            <div className="profil-bilgi-eylem">
              <button type="button" className="dugme dugme-hayalet" onClick={() => setDuzen(null)}>{t('profil.bilgi.vazgec')}</button>
              <button type="submit" className="dugme dugme-birincil">{t('profil.bilgi.kaydet')}</button>
            </div>
          </form>
        )}

        <section className="profil-proje">
          <img className="profil-logo" src="logo.png" alt="" />
          <h2>{t('site.ad')}</h2>
          <p className="profil-slogan">{t('profil.slogan')}</p>
          <p className="profil-metin">{t('profil.metin')}</p>
        </section>

        <p className="profil-takip">{t('profil.takip')}</p>
        <nav className="profil-sosyal" id="profil-sosyal" aria-label={t('profil.takip')}>
          {(durum.proje.sosyal || []).map(h => (
            <a key={h.id} className={`profil-sosyal-bag profil-sosyal-${h.id}`} href={h.url} target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 24 24" aria-hidden="true">{SIMGE[h.id]}</svg>
              <span>{h.ad}</span>
            </a>
          ))}
        </nav>

        <div className="profil-eylem">
          <button type="button" className="dugme dugme-hayalet" id="profil-paylas" onClick={paylas} disabled={!kisi}>
            {t(kopyalandi ? 'profil.kopyalandi' : 'profil.paylas')}
          </button>
          <a className="dugme dugme-hayalet" href="./">{t('profil.site')}</a>
        </div>
      </article>
    </main>
  );
}
