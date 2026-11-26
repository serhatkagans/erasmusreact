import { useEffect, useMemo, useState } from 'react';
import { durum, t, iste, hataMetni } from '../ortak.js';
import { useVeri } from '../kancalar.js';
import { useKonum, capaAyarla } from '../yonlendirme.js';
import { useBaslik, MENU, ZIYARETCI_MENU } from '../bilesenler/Kabuk.jsx';
import { onayla, bildir } from '../bilesenler/Kutu.jsx';
import '../styles/yonetim.css';

/**
 * Yönetim (admin) sayfası: koddaki künye, kurum bilgileri, sitedeki bütün
 * metinler ve logolar buradan değiştirilir (26 Kasım 2026, kullanıcı: "her
 * şey kodla yapılıyor"). Yalnızca yönetici hesabı; sunucu da yalnızca ona
 * izin verir. Kod varsayılandır: her değişiklik varsayılana döndürülebilir.
 *
 * Değişiklik kaydedilince sunucuda hemen geçerli olur. Bu sayfadaki üst
 * bant ve menü sayfa açılışında yüklendiği için künye ve metin değişikliği
 * orada sayfa yenilenince görünür.
 */
const SEKMELER = ['kunye', 'kurumlar', 'metinler', 'gorseller', 'gorunum', 'menu', 'kurallar'];

export default function Yonetim() {
  useBaslik('yonetim.baslik');
  const { hash } = useKonum();
  const sekme = SEKMELER.includes(hash.slice(1)) ? hash.slice(1) : 'kunye';
  const yetkili = !!durum.kullanici?.yonetici;

  return (
    <main id="icerik">
      <section className="kapsayici sayfa-bas">
        <span className="ustbaslik">{t('yonetim.ustbaslik')}</span>
        <h1>{t('yonetim.baslik')}</h1>
        <p>{t('yonetim.giris')}</p>
      </section>
      <div className="kapsayici yonetim">
        {!yetkili && <p className="kullanicilar-uyari" role="alert">{t('yonetim.hata.yetki')}</p>}
        {yetkili && (
          <>
            <nav className="yonetim-sekmeler" aria-label={t('yonetim.baslik')}>
              {SEKMELER.map(s => (
                <button key={s} type="button" aria-current={s === sekme ? 'page' : undefined}
                  onClick={() => capaAyarla(s, { degistir: true })}>{t(`yonetim.sekme.${s}`)}</button>
              ))}
            </nav>
            {sekme === 'kunye' && <Kunye />}
            {sekme === 'kurumlar' && <Kurumlar />}
            {sekme === 'metinler' && <Metinler />}
            {sekme === 'gorseller' && <Gorseller />}
            {sekme === 'gorunum' && <Gorunum />}
            {sekme === 'menu' && <MenuSekmesi />}
            {sekme === 'kurallar' && <Kurallar />}
          </>
        )}
      </div>
    </main>
  );
}

/** Varsayılandan farklıysa alanın altında koddaki değer. */
const Varsayilan = ({ deger, simdi }) => (String(deger ?? '') !== String(simdi ?? '')
  ? <small className="yonetim-varsayilan">{t('yonetim.varsayilan', { deger: String(deger ?? '') || '—' })}</small>
  : null);

/* --- Künye ----------------------------------------------------------------- */
const KUNYE_ALANLARI = [
  ['projectNo', 'text'], ['formId', 'text'], ['acronym', 'text'], ['action', 'text'],
  ['call', 'number'], ['round', 'number'], ['agency', 'text'], ['months', 'number'],
  ['start', 'date'], ['end', 'date'], ['eposta', 'email'],
];

function Kunye() {
  const { veri, yenile } = useVeri('api/yonetim');
  if (!veri) return <p className="bos-durum">{t('genel.yukleniyor')}</p>;
  return <KunyeForm key={JSON.stringify(veri.proje)} veri={veri} yenile={yenile} />;
}

function KunyeForm({ veri, yenile }) {
  const { proje, projeVarsayilan: vars } = veri;
  const [hata, setHata] = useState('');
  const [bekliyor, setBekliyor] = useState(false);

  const kaydet = async govde => {
    setHata('');
    setBekliyor(true);
    try {
      await iste('api/yonetim/proje', { method: 'PUT', body: JSON.stringify(govde) });
      yenile();
      bildir(t('genel.kaydedildi'));
    } catch (err) { setHata(err.message); } finally { setBekliyor(false); }
  };

  return (
    <form className="yonetim-kart" onSubmit={o => {
      o.preventDefault();
      const f = o.currentTarget;
      const govde = Object.fromEntries(KUNYE_ALANLARI.map(([a]) => [a, f[a].value]));
      govde.sosyal = vars.sosyal.map(h => ({ id: h.id, url: f[`sosyal-${h.id}`].value }));
      kaydet(govde);
    }}>
      <h2>{t('yonetim.sekme.kunye')}</h2>
      <div className="form-izgara">
        {KUNYE_ALANLARI.map(([a, tur]) => (
          <label key={a} className="alan"><span>{t(`yonetim.proje.${a}`)}</span>
            <input name={a} type={tur} defaultValue={proje[a] ?? ''} required={!['formId', 'eposta'].includes(a)} />
            <Varsayilan deger={vars[a]} simdi={proje[a]} />
          </label>
        ))}
      </div>
      <h3>{t('yonetim.proje.sosyal')}</h3>
      <p className="alan-ipucu">{t('yonetim.proje.sosyalIpucu')}</p>
      <div className="form-izgara">
        {vars.sosyal.map(h => (
          <label key={h.id} className="alan"><span>{h.ad}</span>
            <input name={`sosyal-${h.id}`} type="url" defaultValue={proje.sosyal.find(s => s.id === h.id)?.url || ''} />
            <Varsayilan deger={h.url} simdi={proje.sosyal.find(s => s.id === h.id)?.url} />
          </label>
        ))}
      </div>
      <p className="alan-uyari">{t('yonetim.proje.uyari')}</p>
      <p className="hata" role="alert">{hata}</p>
      <div className="yonetim-eylem">
        <button type="submit" className="dugme dugme-birincil" disabled={bekliyor}>{t('genel.kaydet')}</button>
        {veri.projeDegisen.length > 0 && (
          <button type="button" className="dugme dugme-ikincil" disabled={bekliyor} onClick={async () => {
            if (await onayla(t('yonetim.sifirlaOnay'), { evet: t('yonetim.sifirla'), tehlike: true })) kaydet({ ...vars });
          }}>{t('yonetim.sifirla')}</button>
        )}
      </div>
    </form>
  );
}

/* --- Kurumlar ---------------------------------------------------------------- */
const KURUM_ALANLARI = [['name', 'text'], ['short', 'text'], ['oid', 'text'], ['city', 'text'], ['web', 'url']];

function Kurumlar() {
  const { veri, yenile } = useVeri('api/yonetim');
  if (!veri) return <p className="bos-durum">{t('genel.yukleniyor')}</p>;
  return (
    <>
      <p className="alan-ipucu yonetim-not">{t('yonetim.kurum.ipucu')}</p>
      {veri.ortaklar.map(o => <KurumForm key={o.id + JSON.stringify(o)} o={o} yenile={yenile} />)}
    </>
  );
}

function KurumForm({ o, yenile }) {
  const [hata, setHata] = useState('');
  const [bekliyor, setBekliyor] = useState(false);
  const ulkeler = durum.yerler.filter(y => y !== 'VIRTUAL');

  const kaydet = async govde => {
    setHata('');
    setBekliyor(true);
    try {
      await iste(`api/yonetim/ortak/${o.id}`, { method: 'PUT', body: JSON.stringify(govde) });
      yenile();
      bildir(t('genel.kaydedildi'));
    } catch (err) { setHata(err.message); } finally { setBekliyor(false); }
  };

  return (
    <form className="yonetim-kart" onSubmit={e => {
      e.preventDefault();
      const f = e.currentTarget;
      kaydet({ ...Object.fromEntries(KURUM_ALANLARI.map(([a]) => [a, f[a].value])), country: f.country.value });
    }}>
      <h2>{o.short} <small className="yonetim-kod">{o.id}</small></h2>
      <div className="form-izgara">
        {KURUM_ALANLARI.map(([a, tur]) => (
          <label key={a} className={`alan${a === 'name' ? ' form-tam' : ''}`}><span>{t(`yonetim.kurum.${a}`)}</span>
            <input name={a} type={tur} defaultValue={o[a] || ''} required={a === 'name' || a === 'short'} />
            <Varsayilan deger={o.varsayilan[a]} simdi={o[a]} />
          </label>
        ))}
        <label className="alan"><span>{t('yonetim.kurum.country')}</span>
          <select name="country" defaultValue={o.country}>
            {ulkeler.map(u => <option key={u} value={u}>{`${u} — ${t(`ulke.${u}`)}`}</option>)}
          </select>
          <Varsayilan deger={o.varsayilan.country} simdi={o.country} />
        </label>
      </div>
      <p className="hata" role="alert">{hata}</p>
      <div className="yonetim-eylem">
        <button type="submit" className="dugme dugme-birincil" disabled={bekliyor}>{t('genel.kaydet')}</button>
        {o.degisen.length > 0 && (
          <button type="button" className="dugme dugme-ikincil" disabled={bekliyor} onClick={async () => {
            if (await onayla(t('yonetim.sifirlaOnay'), { evet: t('yonetim.sifirla'), tehlike: true })) kaydet({ ...o.varsayilan });
          }}>{t('yonetim.sifirla')}</button>
        )}
      </div>
    </form>
  );
}

/* --- Metinler -----------------------------------------------------------------
   Sitedeki her metin bir anahtardır (ör. altbilgi.kunye). Arama hem anahtarda
   hem metinde yapılır; çok sonuç olunca ilk 60'ı çizilir. */
const SINIR = 60;

function Metinler() {
  const [dil, setDil] = useState(durum.dil);
  const [arama, setArama] = useState('');
  const [yalnizDegisen, setYalnizDegisen] = useState(false);
  const { veri, yenile } = useVeri(`api/yonetim/metinler?dil=${dil}`);

  const sonuc = useMemo(() => {
    if (!veri) return [];
    const q = arama.trim().toLocaleLowerCase(durum.dil);
    return veri.metinler.filter(m => (!yalnizDegisen || m.ozel != null) && (!q
      || m.anahtar.toLowerCase().includes(q)
      || String(m.ozel ?? m.dosya ?? '').toLocaleLowerCase(durum.dil).includes(q)
      || m.tr.toLocaleLowerCase(durum.dil).includes(q)));
  }, [veri, arama, yalnizDegisen]);

  return (
    <>
      <div className="yonetim-arac">
        <label className="alan"><span>{t('yonetim.metin.dil')}</span>
          <select value={dil} onChange={o => setDil(o.target.value)}>
            {durum.diller.map(d => <option key={d.code} value={d.code}>{d.name}</option>)}
          </select></label>
        <label className="alan alan-genis"><span>{t('yonetim.metin.ara')}</span>
          <input type="search" value={arama} placeholder={t('yonetim.metin.araIpucu')} onChange={o => setArama(o.target.value)} /></label>
        <label className="onay"><input type="checkbox" checked={yalnizDegisen} onChange={o => setYalnizDegisen(o.target.checked)} />
          {' '}<span>{t('yonetim.metin.degisen')}</span></label>
      </div>
      {veri && (
        <p className="alan-ipucu yonetim-not">
          {t('yonetim.metin.sayi', { n: sonuc.length, toplam: veri.metinler.length })}
          {sonuc.length > SINIR && ` ${t('yonetim.metin.sinir', { n: SINIR })}`}
        </p>
      )}
      <div className="yonetim-metinler">
        {sonuc.slice(0, SINIR).map(m => <MetinSatiri key={`${dil}:${m.anahtar}:${m.ozel}`} dil={dil} m={m} yenile={yenile} />)}
      </div>
    </>
  );
}

function MetinSatiri({ dil, m, yenile }) {
  const ilk = m.ozel ?? m.dosya ?? '';
  const [deger, setDeger] = useState(ilk);
  const [bekliyor, setBekliyor] = useState(false);
  const kirli = deger !== ilk;
  const uzun = ilk.length > 80 || ilk.includes('\n');

  const yap = async istek => {
    setBekliyor(true);
    try { await istek(); yenile(); bildir(t('genel.kaydedildi')); }
    catch (err) { bildir(err.message || hataMetni(), 'hata'); }
    finally { setBekliyor(false); }
  };

  return (
    <div className={`yonetim-metin${m.ozel != null ? ' yonetim-metin-ozel' : ''}`}>
      <div className="yonetim-metin-bas">
        <code>{m.anahtar}</code>
        {m.ozel != null && <span className="yetki-rozet yetki-tam">{t('yonetim.metin.degistirildi')}</span>}
        {m.dosya == null && <span className="yetki-rozet">{t('yonetim.metin.ceviriYok')}</span>}
      </div>
      {dil !== 'tr' && <p className="yonetim-metin-tr" lang="tr">{m.tr}</p>}
      {uzun
        ? <textarea value={deger} rows={Math.min(8, Math.max(3, Math.ceil(deger.length / 90)))} onChange={o => setDeger(o.target.value)} aria-label={m.anahtar} />
        : <input type="text" value={deger} onChange={o => setDeger(o.target.value)} aria-label={m.anahtar} />}
      {m.ozel != null && <Varsayilan deger={m.dosya ?? m.tr} simdi={m.ozel} />}
      <div className="yonetim-eylem">
        <button type="button" className="dugme dugme-birincil dugme-kucuk" disabled={!kirli || bekliyor}
          onClick={() => yap(() => iste('api/yonetim/metinler', { method: 'PUT', body: JSON.stringify({ dil, anahtar: m.anahtar, deger }) }))}>{t('genel.kaydet')}</button>
        {kirli && <button type="button" className="dugme dugme-hayalet dugme-kucuk" onClick={() => setDeger(ilk)}>{t('genel.vazgec')}</button>}
        {m.ozel != null && !kirli && (
          <button type="button" className="dugme dugme-hayalet dugme-kucuk" disabled={bekliyor}
            onClick={() => yap(() => iste(`api/yonetim/metinler?dil=${dil}&anahtar=${encodeURIComponent(m.anahtar)}`, { method: 'DELETE' }))}>{t('yonetim.sifirla')}</button>
        )}
      </div>
    </div>
  );
}

/* --- Görseller ----------------------------------------------------------------- */
function Gorseller() {
  const { veri, yenile } = useVeri('api/yonetim/gorseller');
  if (!veri) return <p className="bos-durum">{t('genel.yukleniyor')}</p>;
  return (
    <>
      <p className="alan-ipucu yonetim-not">{t('yonetim.gorsel.ipucu')}</p>
      <div className="yonetim-gorseller">
        {veri.gorseller.map(g => <GorselKart key={g.ad + g.updated} g={g} azami={veri.azami} yenile={yenile} />)}
      </div>
    </>
  );
}

function GorselKart({ g, azami, yenile }) {
  const [yok, setYok] = useState(false);
  const [bekliyor, setBekliyor] = useState(false);

  const yap = async istek => {
    setBekliyor(true);
    try {
      const yanit = await istek();
      if (!yanit.ok) throw new Error(hataMetni(await yanit.json().catch(() => ({}))));
      yenile();
      bildir(t('genel.kaydedildi'));
    } catch (err) { bildir(err.message, 'hata'); } finally { setBekliyor(false); }
  };

  return (
    <div className="yonetim-gorsel">
      <div className="yonetim-gorsel-on">
        {yok ? <span className="alan-ipucu">{t('yonetim.gorsel.yok')}</span>
          : <img src={`${g.ad}?v=${encodeURIComponent(g.updated || 'v')}`} alt="" onError={() => setYok(true)} />}
      </div>
      <div className="yonetim-metin-bas">
        <code>{g.ad}</code>
        {g.ozel && <span className="yetki-rozet yetki-tam">{t('yonetim.metin.degistirildi')}</span>}
      </div>
      <div className="yonetim-eylem">
        <label className={`dugme dugme-ikincil dugme-kucuk${bekliyor ? ' devre-disi' : ''}`}>
          {t('yonetim.gorsel.yukle')}
          <input type="file" hidden accept=".png,.jpg,.jpeg,.webp,.gif,.svg,image/*" disabled={bekliyor} onChange={o => {
            const dosya = o.target.files[0];
            o.target.value = '';
            if (!dosya) return;
            if (dosya.size > azami) { bildir(t('yonetim.gorsel.buyuk', { mb: Math.round(azami / 1048576) }), 'hata'); return; }
            yap(() => fetch(`api/yonetim/gorsel/${g.ad}`, { method: 'PUT', body: dosya }));
          }} />
        </label>
        {g.ozel && (
          <button type="button" className="dugme dugme-hayalet dugme-kucuk" disabled={bekliyor} onClick={async () => {
            if (await onayla(t('yonetim.sifirlaOnay'), { evet: t('yonetim.sifirla'), tehlike: true })) {
              yap(() => fetch(`api/yonetim/gorsel/${g.ad}`, { method: 'DELETE' }));
            }
          }}>{t('yonetim.sifirla')}</button>
        )}
      </div>
    </div>
  );
}

/* --- Görünüm ----------------------------------------------------------------
   Renkler ve yazı tipi (lib/site.mjs · TEMA_RENKLERI). Değiştirildikçe bu
   sayfada canlı önizlenir (kök öğeye satır içi değişken); kaydedince sunucu
   tema.css'i yeniden üretir ve herkese yansır. Yalnızca yönetici görür. */
const TEMA_GRUPLARI = [
  ['ana', ['yesil', 'yesil-koyu', 'yesil-acik', 'mavi', 'mavi-acik', 'filiz']],
  ['yuzey', ['zemin', 'kart', 'murekkep', 'metin', 'soluk']],
  ['wp', ['wp1', 'wp2', 'wp3', 'wp4']],
];
/* Okunurluk denetimi: renk → üzerinde durduğu zemin (WCAG AA metin 4,5:1). */
const KONTRAST = { yesil: 'kart', 'yesil-koyu': 'kart', murekkep: 'zemin', metin: 'kart', soluk: 'kart' };

const parlaklik = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const oran = (a, b) => {
  const [x, y] = [parlaklik(a), parlaklik(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

/** Kaydedilen temayı sayfaya yeniden bağlar (sunucunun eklediği bağlantı ya da yenisi). */
function temaYenile() {
  let bag = document.querySelector('link[href^="tema.css"]');
  if (!bag) { bag = document.createElement('link'); bag.rel = 'stylesheet'; document.head.append(bag); }
  bag.href = `tema.css?v=${Date.now()}`;
}

function Gorunum() {
  const { veri, yenile } = useVeri('api/yonetim/tema');
  if (!veri) return <p className="bos-durum">{t('genel.yukleniyor')}</p>;
  return <GorunumForm key={JSON.stringify(veri.tema)} veri={veri} yenile={yenile} />;
}

function GorunumForm({ veri, yenile }) {
  const [tema, setTema] = useState(veri.tema);
  const [hata, setHata] = useState('');
  const [bekliyor, setBekliyor] = useState(false);
  const vars = veri.varsayilan;

  /* Canlı önizleme: kaydedilmemiş renkler kök öğede; sekmeden çıkınca silinir. */
  useEffect(() => {
    const kok = document.documentElement.style;
    for (const ad of Object.keys(vars)) if (ad !== 'yazi') kok.setProperty(`--${ad}`, tema[ad]);
    kok.setProperty('--yazi', veri.yaziYigini[tema.yazi]);
    return () => { for (const ad of Object.keys(vars)) kok.removeProperty(`--${ad}`); };
  }, [tema, vars, veri.yaziYigini]);

  const kaydet = async govde => {
    setHata('');
    setBekliyor(true);
    try {
      await iste('api/yonetim/tema', { method: 'PUT', body: JSON.stringify(govde) });
      temaYenile();
      yenile();
      bildir(t('genel.kaydedildi'));
    } catch (err) { setHata(err.message); } finally { setBekliyor(false); }
  };
  const degisti = Object.keys(tema).some(a => tema[a] !== veri.tema[a]);

  return (
    <form className="yonetim-kart" onSubmit={o => { o.preventDefault(); kaydet(tema); }}>
      <h2>{t('yonetim.sekme.gorunum')}</h2>
      <p className="alan-ipucu yonetim-not">{t('yonetim.tema.ipucu')}</p>

      <div className="yonetim-tema-onizleme" aria-hidden="true">
        <div className="yonetim-tema-bant"><strong>{durum.proje?.acronym}</strong><span /></div>
        <div className="yonetim-tema-govde">
          <h3>{t('yonetim.tema.ornekBaslik')}</h3>
          <p>{t('yonetim.tema.ornekMetin')} <a href="#gorunum" onClick={o => o.preventDefault()}>{t('yonetim.tema.ornekBag')}</a></p>
          <div className="yonetim-eylem">
            <span className="dugme dugme-birincil dugme-kucuk">{t('genel.kaydet')}</span>
            {['wp1', 'wp2', 'wp3', 'wp4'].map(w => <span key={w} className={`yonetim-tema-wp yonetim-tema-${w}`}>{w.toUpperCase()}</span>)}
          </div>
        </div>
      </div>

      {TEMA_GRUPLARI.map(([grup, adlar]) => (
        <fieldset key={grup} className="yonetim-tema-grup">
          <legend>{t(`yonetim.tema.grup.${grup}`)}</legend>
          <div className="yonetim-tema-renkler">
            {adlar.map(ad => {
              const zemin = KONTRAST[ad] && tema[KONTRAST[ad]];
              const o = zemin ? oran(tema[ad], zemin) : 99;
              return (
                <label key={ad} className="yonetim-tema-renk">
                  <span>{t(`yonetim.tema.renk.${ad}`)}</span>
                  <span className="yonetim-tema-secici">
                    <input type="color" value={tema[ad]} onChange={e => setTema({ ...tema, [ad]: e.target.value })} />
                    <code>{tema[ad]}</code>
                    {tema[ad] !== vars[ad] && (
                      <button type="button" className="bulten-duzen-dugme" title={t('yonetim.sifirla')} aria-label={t('yonetim.sifirla')}
                        onClick={() => setTema({ ...tema, [ad]: vars[ad] })}>↺</button>
                    )}
                  </span>
                  {o < 4.5 && <small className="yonetim-varsayilan">{t('yonetim.tema.kontrast', { oran: o.toFixed(1).replace('.', ',') })}</small>}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}

      <label className="alan yonetim-tema-yazi"><span>{t('yonetim.tema.yazi')}</span>
        <select value={tema.yazi} onChange={e => setTema({ ...tema, yazi: e.target.value })}>
          {veri.yazilar.map(y => <option key={y} value={y}>{t(`yonetim.tema.yazi.${y}`)}</option>)}
        </select>
      </label>

      <p className="hata" role="alert">{hata}</p>
      <div className="yonetim-eylem">
        <button type="submit" className="dugme dugme-birincil" disabled={bekliyor || !degisti}>{t('genel.kaydet')}</button>
        {degisti && <button type="button" className="dugme dugme-ikincil" disabled={bekliyor} onClick={() => setTema(veri.tema)}>{t('genel.vazgec')}</button>}
        {veri.degisen.length > 0 && (
          <button type="button" className="dugme dugme-hayalet" disabled={bekliyor} onClick={async () => {
            if (await onayla(t('yonetim.sifirlaOnay'), { evet: t('yonetim.sifirla'), tehlike: true })) kaydet({});
          }}>{t('yonetim.tema.hepsiSifirla')}</button>
        )}
      </div>
    </form>
  );
}

/* --- Menü --------------------------------------------------------------------
   Üst menünün sırası ve gizlenen maddeler (lib/site.mjs · menuDogrula).
   Madde adları Metinler sekmesinden değişir. Gizlemek sayfayı kapatmaz,
   yalnızca menüden kaldırır. Yönetim maddesi gizlenemez. */
const MENU_LISTELERI = [['uye', MENU], ['ziyaretci', ZIYARETCI_MENU]];

function MenuSekmesi() {
  const { veri, yenile } = useVeri('api/yonetim/menu');
  if (!veri) return <p className="bos-durum">{t('genel.yukleniyor')}</p>;
  return <MenuForm key={JSON.stringify(veri.menu)} veri={veri} yenile={yenile} />;
}

function MenuForm({ veri, yenile }) {
  const [menu, setMenu] = useState(veri.menu);
  const [hata, setHata] = useState('');
  const [bekliyor, setBekliyor] = useState(false);
  const degisti = JSON.stringify(menu) !== JSON.stringify(veri.menu);
  const varsayilanda = JSON.stringify(veri.menu) === JSON.stringify(veri.varsayilan);

  const kaydet = async govde => {
    setHata('');
    setBekliyor(true);
    try {
      await iste('api/yonetim/menu', { method: 'PUT', body: JSON.stringify(govde) });
      bildir(t('yonetim.menu.kaydedildi'));
      yenile();
    } catch (err) { setHata(err.message); } finally { setBekliyor(false); }
  };
  const tasi = (liste, i, yon) => {
    const sira = [...menu[liste].sira];
    [sira[i], sira[i + yon]] = [sira[i + yon], sira[i]];
    setMenu({ ...menu, [liste]: { ...menu[liste], sira } });
  };
  const gizle = (liste, anahtar, gizli) => {
    const g = menu[liste].gizli.filter(a => a !== anahtar);
    setMenu({ ...menu, [liste]: { ...menu[liste], gizli: gizli ? [...g, anahtar] : g } });
  };

  return (
    <form onSubmit={o => { o.preventDefault(); kaydet(menu); }}>
      <p className="alan-ipucu yonetim-not">{t('yonetim.menu.ipucu')}</p>
      <div className="yonetim-menuler">
        {MENU_LISTELERI.map(([liste, ogeler]) => (
          <div key={liste} className="yonetim-kart">
            <h2>{t(`yonetim.menu.${liste}`)}</h2>
            <ol className="yonetim-menu-liste">
              {menu[liste].sira.map((anahtar, i) => {
                const oge = ogeler.find(o => o.anahtar === anahtar);
                if (!oge) return null;
                const gizli = menu[liste].gizli.includes(anahtar);
                const kilitli = anahtar === 'menu.yonetim';
                return (
                  <li key={anahtar} className={gizli ? 'gizli' : undefined}>
                    <span className="yonetim-menu-ad">
                      <strong>{t(anahtar)}</strong>
                      {oge.koordinator && <small>{t('yonetim.menu.koordinator')}</small>}
                      {oge.yonetici && <small>{t('yonetim.menu.yonetici')}</small>}
                    </span>
                    <label className="onay">
                      <input type="checkbox" checked={!gizli} disabled={kilitli} onChange={e => gizle(liste, anahtar, !e.target.checked)} />
                      <span>{t('yonetim.menu.goster')}</span>
                    </label>
                    <span className="yonetim-eylem">
                      <button type="button" className="bulten-duzen-dugme" disabled={i === 0} aria-label={t('bulten.duzen.yukari')} title={t('bulten.duzen.yukari')}
                        onClick={() => tasi(liste, i, -1)}>↑</button>
                      <button type="button" className="bulten-duzen-dugme" disabled={i === menu[liste].sira.length - 1} aria-label={t('bulten.duzen.asagi')} title={t('bulten.duzen.asagi')}
                        onClick={() => tasi(liste, i, 1)}>↓</button>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
      <p className="hata" role="alert">{hata}</p>
      <div className="yonetim-eylem">
        <button type="submit" className="dugme dugme-birincil" disabled={bekliyor || !degisti}>{t('genel.kaydet')}</button>
        {degisti && <button type="button" className="dugme dugme-ikincil" disabled={bekliyor} onClick={() => setMenu(veri.menu)}>{t('genel.vazgec')}</button>}
        {!varsayilanda && (
          <button type="button" className="dugme dugme-hayalet" disabled={bekliyor} onClick={async () => {
            if (await onayla(t('yonetim.sifirlaOnay'), { evet: t('yonetim.sifirla'), tehlike: true })) kaydet({});
          }}>{t('yonetim.sifirla')}</button>
        )}
      </div>
    </form>
  );
}

/* --- Kurallar ----------------------------------------------------------------
   Sınırlar ve bülten yetkisi (lib/site.mjs · kurallarDogrula). Kaydedilince
   sunucuda hemen geçerli olur; formlardaki ön denetimler sayfa yenilenince. */
const KURAL_GRUPLARI = [
  ['guvenlik', ['minParola']],
  ['dosya', ['fotoMb', 'formDosyaMb', 'klasorMb', 'driveMb', 'bultenVideoMb']],
  ['sayi', ['etkinlikFoto', 'bultenAylikFoto']],
];

function Kurallar() {
  const { veri, yenile } = useVeri('api/yonetim/kurallar');
  if (!veri) return <p className="bos-durum">{t('genel.yukleniyor')}</p>;
  return <KurallarForm key={JSON.stringify(veri.kurallar)} veri={veri} yenile={yenile} />;
}

function KurallarForm({ veri, yenile }) {
  const [kurumlar, setKurumlar] = useState(veri.kurallar.bultenKurumlari);
  const [hata, setHata] = useState('');
  const [bekliyor, setBekliyor] = useState(false);
  const vars = veri.varsayilan;

  const kaydet = async govde => {
    setHata('');
    setBekliyor(true);
    try {
      await iste('api/yonetim/kurallar', { method: 'PUT', body: JSON.stringify(govde) });
      yenile();
      bildir(t('genel.kaydedildi'));
    } catch (err) { setHata(err.message); } finally { setBekliyor(false); }
  };

  return (
    <form className="yonetim-kart" onSubmit={o => {
      o.preventDefault();
      const f = o.currentTarget;
      const govde = { bultenIlkAy: f.bultenIlkAy.value, bultenKurumlari: kurumlar };
      for (const [, adlar] of KURAL_GRUPLARI) for (const ad of adlar) govde[ad] = Number(f[ad].value);
      kaydet(govde);
    }}>
      <h2>{t('yonetim.sekme.kurallar')}</h2>
      <p className="alan-ipucu yonetim-not">{t('yonetim.kural.ipucu')}</p>

      {KURAL_GRUPLARI.map(([grup, adlar]) => (
        <fieldset key={grup} className="yonetim-tema-grup">
          <legend>{t(`yonetim.kural.grup.${grup}`)}</legend>
          <div className="form-izgara">
            {adlar.map(ad => {
              const [min, max] = veri.sinirlar[ad];
              return (
                <label key={ad} className="alan"><span>{t(`yonetim.kural.${ad}`)}</span>
                  <input name={ad} type="number" required min={min} max={max} step={1} defaultValue={veri.kurallar[ad]} />
                  <small className="alan-ipucu">{t('yonetim.kural.aralik', { min, max })}</small>
                  <Varsayilan deger={vars[ad]} simdi={veri.kurallar[ad]} />
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}

      <fieldset className="yonetim-tema-grup">
        <legend>{t('yonetim.kural.grup.bulten')}</legend>
        <div className="form-izgara">
          <label className="alan"><span>{t('yonetim.kural.bultenIlkAy')}</span>
            <input name="bultenIlkAy" type="month" required pattern="\d{4}-\d{2}" defaultValue={veri.kurallar.bultenIlkAy} />
            <Varsayilan deger={vars.bultenIlkAy} simdi={veri.kurallar.bultenIlkAy} />
          </label>
        </div>
        <p className="alan-etiket yonetim-kural-baslik">{t('yonetim.kural.bultenKurumlari')}</p>
        <p className="alan-ipucu">{t('yonetim.kural.bultenKurumlariIpucu')}</p>
        <div className="yonetim-kural-kurumlar">
          {veri.kurumlar.map(k => (
            <label key={k.id} className="onay">
              <input type="checkbox" checked={kurumlar.includes(k.id)}
                onChange={e => setKurumlar(e.target.checked ? [...kurumlar, k.id] : kurumlar.filter(x => x !== k.id))} />
              <span><strong>{k.short}</strong> · {k.name}</span>
            </label>
          ))}
        </div>
        <Varsayilan deger={vars.bultenKurumlari.join(', ')} simdi={veri.kurumlar.map(k => k.id).filter(id => kurumlar.includes(id)).join(', ')} />
      </fieldset>

      <p className="hata" role="alert">{hata}</p>
      <div className="yonetim-eylem">
        <button type="submit" className="dugme dugme-birincil" disabled={bekliyor}>{t('genel.kaydet')}</button>
        {veri.degisen.length > 0 && (
          <button type="button" className="dugme dugme-hayalet" disabled={bekliyor} onClick={async () => {
            if (await onayla(t('yonetim.sifirlaOnay'), { evet: t('yonetim.sifirla'), tehlike: true })) kaydet({ ...vars });
          }}>{t('yonetim.sifirla')}</button>
        )}
      </div>
    </form>
  );
}
