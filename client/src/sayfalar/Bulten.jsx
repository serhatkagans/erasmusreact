import { useState } from 'react';
import { durum, t, iste, ortakKisa, etkinlikBaslik, tamTarih, tarihAraligi, ayYil, bugun } from '../ortak.js';
import { useVeri } from '../kancalar.js';
import { useKonum } from '../yonlendirme.js';
import { useBaslik } from '../bilesenler/Kabuk.jsx';
import Kutu, { bildir, onayla } from '../bilesenler/Kutu.jsx';
import { SIMGE } from '../bilesenler/simgeler.jsx';
import '../styles/bulten.css';

/**
 * Aylık bülten (GET /api/bulten?ay=…): projenin o ay ne yaptığı ve ne
 * yapacağı. Listeler takvimden, görevlerden, formlardan ve klasörlerden
 * türer; koordinatör her ay için "öne çıkanlar" ve "hedefler" notu yazar.
 * Ay adresle seçilir (`bulten.html?ay=2026-09`), bağlantı paylaşılabilir.
 */

const ayAdi = ay => { const [y, a] = ay.split('-').map(Number); return ayYil(y, a - 1); };

/**
 * Koordinatör notu: "-" ya da "•" ile başlayan satırlar madde olur.
 * İçinde sosyal medya hesabı ya da e-posta adresi geçen madde düz bağlantı
 * yerine kart olarak çizilir (simge, platform, hesap adı); art arda gelen
 * kartlar bir ızgarada toplanır.
 */
function NotMetni({ metin }) {
  const bloklar = [];
  const ekle = (tur, oge) => {
    const son = bloklar.at(-1);
    if (son?.tur === tur) son.ogeler.push(oge); else bloklar.push({ tur, ogeler: [oge] });
  };
  for (const satir of metin.split('\n')) {
    const madde = satir.match(/^\s*[-•*]\s+(.*)$/);
    if (madde) {
      const hesap = sosyalHesap(madde[1]);
      if (hesap) ekle('kart', hesap); else ekle('liste', madde[1]);
    } else if (satir.trim()) bloklar.push({ tur: 'p', ogeler: [satir.trim()] });
  }
  return bloklar.map((b, i) => {
    if (b.tur === 'kart') return <div key={i} className="bulten-sosyal">{b.ogeler.map((h, j) => <SosyalKart key={j} {...h} />)}</div>;
    if (b.tur === 'liste') return <ul key={i}>{b.ogeler.map((o, j) => <li key={j}><Baglantili metin={o} /></li>)}</ul>;
    return <p key={i}><Baglantili metin={b.ogeler[0]} /></p>;
  });
}

/* Tanınan platformlar: alan adı → simge ve görünen ad. */
const PLATFORM = [
  [/(^|\.)linkedin\.com$/, 'linkedin', 'LinkedIn'],
  [/(^|\.)instagram\.com$/, 'instagram', 'Instagram'],
  [/(^|\.)(x|twitter)\.com$/, 'x', 'X'],
  [/(^|\.)facebook\.com$/, 'facebook', 'Facebook'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube', 'YouTube'],
];

/** Maddede tek bir sosyal hesap ya da e-posta geçiyorsa kart bilgisi; yoksa null. */
function sosyalHesap(metin) {
  const adresler = metin.match(ADRES) || [];
  if (adresler.length !== 1) return null;
  const adres = adresler[0];
  /* Kartın alt satırı: maddenin adres dışındaki kısmı ("Instagram hesabı açıldı"). */
  const aciklama = metin.replace(adres, '').replace(/[\s:–—-]+$/, '').trim();
  if (!adres.startsWith('http')) {
    return { tur: 'eposta', platform: t('bulten.sosyal.eposta'), hesap: adres, href: `mailto:${adres}`, aciklama };
  }
  let url;
  try { url = new URL(adres); } catch { return null; }
  const host = url.hostname.replace(/^www\./, '');
  const bulunan = PLATFORM.find(([re]) => re.test(host));
  if (!bulunan) return null;
  const [, tur, platform] = bulunan;
  const yol = url.pathname.split('/').filter(Boolean);
  let hesap = yol[0] || host;
  if (tur === 'linkedin') {
    /* /in/<ad>-<kimlik> ya da /company/<ad>: sondaki kimlik kodu atılır. */
    hesap = (yol[1] || yol[0] || host).replace(/-(?=[a-z0-9]*\d)[a-z0-9]{6,}$/i, '');
  } else if (tur !== 'youtube' || !hesap.startsWith('@')) {
    hesap = `@${hesap.replace(/^@/, '')}`;
  }
  return { tur, platform, hesap, href: url.href, aciklama };
}

function SosyalKart({ tur, platform, hesap, href, aciklama }) {
  const eposta = tur === 'eposta';
  return (
    <a className={`bulten-sosyal-kart bulten-sosyal-${tur}`} href={href}
      target={eposta ? undefined : '_blank'} rel="noopener noreferrer">
      <span className="bulten-sosyal-simge" aria-hidden="true"><svg viewBox="0 0 24 24">{SIMGE[tur]}</svg></span>
      <span className="bulten-sosyal-govde">
        <strong>{platform}</strong>
        <span className="bulten-sosyal-hesap" title={hesap}>{hesap}</span>
        {aciklama && <span className="bulten-sosyal-not">{aciklama}</span>}
      </span>
      <span className="bulten-sosyal-ok" aria-hidden="true">↗</span>
    </a>
  );
}

/* Nottaki web ve e-posta adresleri tıklanabilir olur. */
const ADRES = /(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)]|[\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g;
function Baglantili({ metin }) {
  return metin.split(ADRES).map((parca, i) => {
    if (i % 2 === 0) return parca;
    const eposta = !parca.startsWith('http');
    const gorunen = eposta ? parca : parca.replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '').replace(/\/$/, '');
    return <a key={i} href={eposta ? `mailto:${parca}` : parca} target={eposta ? undefined : '_blank'} rel="noopener noreferrer">{gorunen}</a>;
  });
}

function Satir({ href, baslik, alt, rozet, rozetSinif = '' }) {
  const ic = (
    <>
      <span className="pano-satir-govde">
        <strong>{baslik}</strong>
        {alt && <span className="pano-satir-alt">{alt}</span>}
      </span>
      {rozet && <span className={`pano-rozet ${rozetSinif}`}>{rozet}</span>}
    </>
  );
  /* Ziyaretçi kayıtları açamaz (giriş ister): satır bağlantısız çizilir. */
  if (!durum.kullanici) href = null;
  return <li>{href ? <a className="pano-satir" href={href}>{ic}</a> : <div className="pano-satir">{ic}</div>}</li>;
}

/** Başlıklı küme; boşsa hiç çizilmez. */
function Kume({ baslik, satirlar }) {
  if (!satirlar.length) return null;
  return (
    <div className="bulten-kume">
      <h3>{t(baslik)} <span className="bulten-kume-sayi">{satirlar.length}</span></h3>
      <ul className="pano-liste">{satirlar.map((s, i) => <Satir key={i} {...s} />)}</ul>
    </div>
  );
}

function Rakam({ n, metin }) {
  return (
    <div className="bulten-rakam">
      <strong>{n}</strong>
      <span>{t(metin)}</span>
    </div>
  );
}

const faaliyetSatiri = (e, rozet, rozetSinif) => ({
  href: `takvim.html#etkinlik-${e.id}`, baslik: etkinlikBaslik(e),
  alt: `${e.wp}${e.kod ? ' ' + e.kod : ''} · ${tarihAraligi(e.baslangic, e.bitis)} · ${ortakKisa(e.lider)}`,
  rozet, rozetSinif,
});

const gorevSatiri = (g, rozet, rozetSinif) => ({
  href: 'ekip.html', baslik: g.baslik,
  alt: [ortakKisa(g.partner), g.uye, g.son_tarih && tamTarih(g.son_tarih)].filter(Boolean).join(' · '),
  rozet, rozetSinif,
});

/* Bitmemiş işin rozeti: süre geçtiyse kırmızı "gecikti", yoksa durumu. */
const acikRozet = (x, durumMetni) => (x.gecikti
  ? [t('bulten.gecikti'), 'pano-rozet-kirmizi']
  : [durumMetni, x.durum === 'devam' ? 'pano-rozet-amber' : '']);

export default function Bulten() {
  useBaslik('bulten.baslik');
  const { params } = useKonum();
  const istenen = params.get('ay') || '';
  const { veri: b, yenile } = useVeri(`api/bulten${istenen ? `?ay=${istenen}` : ''}`);
  const [duzenle, setDuzenle] = useState(false);

  let govde = null;
  if (b) {
    const y = b.yapilanlar;
    const z = b.yapilacaklar;

    const yapFaaliyet = y.faaliyet.map(e => faaliyetSatiri(e, t('durum.tamamlandi'), 'bulten-rozet-yesil'));
    const yapGorev = y.gorev.map(g => gorevSatiri(g, t('bulten.tamam'), 'bulten-rozet-yesil'));
    const yapCikti = y.cikti.map(c => ({ href: `ciktilar.html#${c.slug}`, baslik: t(`${c.anahtar}.baslik`),
      alt: c.sorumlu ? ortakKisa(c.sorumlu) : '', rozet: t('cikti.durum.teslim'), rozetSinif: 'bulten-rozet-yesil' }));
    const yapForm = [
      ...y.formYayin.map(f => ({ href: `formlar.html#form-${f.id}`, baslik: f.baslik,
        alt: t('bulten.formYayinlandi', { tarih: tamTarih(f.tarih) }) })),
      ...y.formYanit.map(f => ({ href: `formlar.html#form-${f.id}`, baslik: f.baslik,
        alt: t('bulten.yanitGeldi'), rozet: t('bulten.yanitSayi', { n: f.n }) })),
    ];
    const yapDosya = [
      ...y.faaliyetDosya.map(f => ({ href: `takvim.html#etkinlik-${f.id}`, baslik: etkinlikBaslik(f),
        alt: f.turler.map(x => t(`faaliyet.parca.${x}`)).join(', '), rozet: t('bulten.faaliyetDosyasi') })),
      ...y.dosya.slice(0, 10).map(d => ({ href: `klasorler.html#${d.klasor}`, baslik: d.ad,
        alt: [d.klasor, ortakKisa(d.partner), d.yukleyen, tamTarih(d.tarih)].filter(Boolean).join(' · ') })),
    ];
    if (!b.uye && b.klasorDosyaSayi) yapDosya.push({ baslik: t('bulten.klasorDosya', { n: b.klasorDosyaSayi }) });
    if (y.dosya.length > 10) yapDosya.push({ href: 'klasorler.html', baslik: t('bulten.dahaFazla', { n: y.dosya.length - 10 }) });
    if (y.fotograf) yapDosya.push({ href: 'takvim.html', baslik: t('bulten.fotograf', { n: y.fotograf }) });
    if (y.ciktiDosya) yapDosya.push({ href: 'ciktilar.html', baslik: t('bulten.ciktiDosya', { n: y.ciktiDosya }) });

    const zFaaliyet = z.faaliyet.map(e => faaliyetSatiri(e, ...acikRozet(e, e.baslangic <= bugun() && e.durum !== 'ertelendi'
      ? t('durum.devam') : t(`durum.${e.durum}`))));
    const zGorev = z.gorev.map(g => gorevSatiri(g, ...acikRozet(g, `%${g.ilerleme}`)));
    const zCikti = z.cikti.map(c => {
      const [rozet, rozetSinif] = acikRozet(c, t(`cikti.durum.${c.durum}`));
      return { href: `ciktilar.html#${c.slug}`, baslik: t(`${c.anahtar}.baslik`),
        alt: [c.sorumlu && ortakKisa(c.sorumlu), tamTarih(c.teslim)].filter(Boolean).join(' · '), rozet, rozetSinif };
    });
    const zForm = z.form.map(f => ({ href: `formlar.html#form-${f.id}`, baslik: f.baslik,
      alt: t('bulten.formSonGun', { tarih: tamTarih(f.sonTarih) }), rozet: t('bulten.yanitSayi', { n: f.yanit }) }));

    const sFaaliyet = b.sonraki.faaliyet.map(e => faaliyetSatiri(e, t(`durum.${e.durum}`)));
    const sGorev = b.sonraki.gorev.map(g => gorevSatiri(g, `%${g.ilerleme}`));

    const yapilanSayi = yapFaaliyet.length + yapGorev.length + yapCikti.length + yapForm.length + yapDosya.length;
    const yapilacakSayi = zFaaliyet.length + zGorev.length + zCikti.length + zForm.length;
    const dosyaSayi = b.klasorDosyaSayi + y.faaliyetDosya.length + y.fotograf + y.ciktiDosya;
    const yanitSayi = y.formYanit.reduce((n, f) => n + f.n, 0);

    govde = (
      <>
        <div className="bulten-rakamlar">
          <Rakam n={y.faaliyet.length + y.gorev.length + y.cikti.length} metin="bulten.r.tamamlanan" />
          <Rakam n={dosyaSayi} metin="bulten.r.dosya" />
          <Rakam n={yanitSayi} metin="bulten.r.yanit" />
          <Rakam n={yapilacakSayi} metin={b.gecmis ? 'bulten.r.kalan' : 'bulten.r.yapilacak'} />
        </div>

        {(b.fotolar.length > 0 || b.duzenleyebilir) && <Fotolar b={b} yenile={yenile} />}

        <div className="bulten-izgara">
          <section className="pano-kutu bulten-sutun bulten-yapilan" aria-labelledby="bulten-yapilan">
            <div className="pano-kutu-bas"><h2 id="bulten-yapilan">{t('bulten.yapilanlar')}</h2></div>
            {b.not.yapilanlar && (
              <div className="bulten-not"><span className="bulten-not-bas">{t('bulten.oneCikanlar')}</span><NotMetni metin={b.not.yapilanlar} /></div>
            )}
            <Kume baslik="bulten.k.faaliyet" satirlar={yapFaaliyet} />
            <Kume baslik="bulten.k.gorev" satirlar={yapGorev} />
            <Kume baslik="bulten.k.cikti" satirlar={yapCikti} />
            <Kume baslik="bulten.k.form" satirlar={yapForm} />
            <Kume baslik="bulten.k.dosya" satirlar={yapDosya} />
            {!yapilanSayi && !b.not.yapilanlar && <p className="pano-bos">{t('bulten.yapilanlar.bos')}</p>}
          </section>

          <section className="pano-kutu bulten-sutun bulten-yapilacak" aria-labelledby="bulten-yapilacak">
            <div className="pano-kutu-bas">
              <h2 id="bulten-yapilacak">{t(b.gecmis ? 'bulten.kalanlar' : 'bulten.yapilacaklar')}</h2>
            </div>
            {b.not.yapilacaklar && (
              <div className="bulten-not"><span className="bulten-not-bas">{t('bulten.hedefler')}</span><NotMetni metin={b.not.yapilacaklar} /></div>
            )}
            <Kume baslik="bulten.k.faaliyet" satirlar={zFaaliyet} />
            <Kume baslik="bulten.k.gorev" satirlar={zGorev} />
            <Kume baslik="bulten.k.cikti" satirlar={zCikti} />
            <Kume baslik="bulten.k.form" satirlar={zForm} />
            {!yapilacakSayi && !b.not.yapilacaklar && <p className="pano-bos">{t(b.gecmis ? 'bulten.kalanlar.bos' : 'bulten.yapilacaklar.bos')}</p>}
          </section>
        </div>

        <section className="pano-kutu bulten-sonraki" aria-labelledby="bulten-sonraki">
          <div className="pano-kutu-bas">
            <h2 id="bulten-sonraki">{t('bulten.sonraki', { ay: ayAdi(b.sonrakiAy) })}</h2>
            <span className="pano-sayi">{String(sFaaliyet.length + sGorev.length)}</span>
          </div>
          <Kume baslik="bulten.k.faaliyet" satirlar={sFaaliyet} />
          <Kume baslik="bulten.k.gorev" satirlar={sGorev} />
          {!sFaaliyet.length && !sGorev.length && <p className="pano-bos">{t('bulten.sonraki.bos')}</p>}
        </section>

        {b.not.updated && b.not.yazan && (
          <p className="bulten-imza">{t('bulten.notYazan', { ad: b.not.yazan, tarih: tamTarih(b.not.updated.slice(0, 10)) })}</p>
        )}
      </>
    );
  }

  return (
    <main id="icerik">
      <section className="kapsayici sayfa-bas">
        <span className="ustbaslik">{`${t('bulten.ust')} · ${durum.proje?.acronym || ''}`}</span>
        <h1>{b ? ayAdi(b.ay) : t('bulten.baslik')}</h1>
        <p>{t(b?.ay === durum.proje?.start?.slice(0, 7) ? 'bulten.giris.baslangic' : b && b.ay < (durum.proje?.start || '') ? 'bulten.giris.hazirlik' : 'bulten.giris')}</p>
        {b && (
          <div className="bulten-arac">
            <nav className="gorunum bulten-aylar" aria-label={t('bulten.aylar')}>
              {[...b.aylar].reverse().map(ay => (
                <a key={ay} href={`bulten.html?ay=${ay}`} aria-current={ay === b.ay ? 'page' : undefined}>{ayAdi(ay)}</a>
              ))}
            </nav>
            <div className="bulten-eylem">
              {b.duzenleyebilir && (
                <button type="button" className="dugme dugme-ikincil" onClick={() => setDuzenle(true)}>{t('bulten.notDuzenle')}</button>
              )}
              <button type="button" className="dugme dugme-ikincil" onClick={() => print()}>{t('bulten.yazdir')}</button>
            </div>
          </div>
        )}
      </section>
      <div className="kapsayici bulten">{govde}</div>
      {b?.duzenleyebilir && <NotKutusu acik={duzenle} b={b} kapat={() => setDuzenle(false)} yenile={yenile} />}
    </main>
  );
}

/** Ayın fotoğrafları. Koordinatör ekler ve siler; büyük hâli yeni sekmede açılır. */
function Fotolar({ b, yenile }) {
  const [yukleniyor, setYukleniyor] = useState(false);
  const [duzenlenen, setDuzenlenen] = useState(null);
  const yukle = async dosyalar => {
    setYukleniyor(true);
    try {
      for (const dosya of dosyalar) {
        const yanit = await fetch(`api/bulten/${b.ay}/foto`, {
          method: 'POST', body: dosya, headers: { 'x-dosya-adi': encodeURIComponent(dosya.name) },
        });
        if (!yanit.ok) { const g = await yanit.json().catch(() => ({})); bildir(t(g.error || 'genel.hata'), 'hata'); break; }
      }
      yenile();
    } finally { setYukleniyor(false); }
  };
  const sil = async f => {
    if (!(await onayla(t('bulten.fotoSilSor'), { evet: t('genel.sil'), tehlike: true }))) return;
    try { await iste(`api/bulten/foto/${f.id}`, { method: 'DELETE' }); bildir(t('genel.silindi')); yenile(); }
    catch (err) { bildir(err.message, 'hata'); }
  };
  return (
    <section className="pano-kutu bulten-fotolar" aria-labelledby="bulten-foto-bas">
      <div className="pano-kutu-bas">
        <h2 id="bulten-foto-bas">{t('bulten.fotolar')}</h2>
        {b.duzenleyebilir && b.fotolar.length < b.maxFoto && (
          <label className="dugme dugme-ikincil dugme-kucuk bulten-eylem-dugme">
            {t(yukleniyor ? 'bulten.fotoYukleniyor' : 'bulten.fotoEkle')}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" multiple hidden disabled={yukleniyor}
              onChange={o => { const d = [...o.target.files]; o.target.value = ''; if (d.length) yukle(d); }} />
          </label>
        )}
      </div>
      {!b.fotolar.length
        ? <p className="pano-bos">{t('bulten.fotolar.bos')}</p>
        : (
          <ul className={`bulten-foto-izgara${b.fotolar.length === 1 ? ' tek' : ''}`}>
            {b.fotolar.map(f => (
              <li key={f.id}>
                <MedyaKart f={f} />
                {b.duzenleyebilir && (
                  <span className="bulten-foto-eylem">
                    <button type="button" aria-label={t('bulten.aciklamaDuzenle')} title={t('bulten.aciklamaDuzenle')} onClick={() => setDuzenlenen(f)}>✎</button>
                    <button type="button" className="bulten-foto-sil" aria-label={t('bulten.fotoSil')} title={t('bulten.fotoSil')} onClick={() => sil(f)}>×</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      {b.duzenleyebilir && <AciklamaKutusu f={duzenlenen} kapat={() => setDuzenlenen(null)} yenile={yenile} />}
    </section>
  );
}

/**
 * Açıklama iki parçadır: ilk satır başlık, alttaki satırlar kısa tanıtım.
 * Başlığın sonundaki parantez etiket olur: "Tanıtım videosu (30 sn,
 * İngilizce)" → başlık "Tanıtım videosu", etiketler "30 sn", "İngilizce".
 */
function aciklamaParcala(metin) {
  const [ilk = '', ...kalan] = metin.split('\n');
  const parantez = ilk.match(/\(([^)]+)\)\s*$/)?.[1];
  return {
    baslik: ilk.replace(/\s*\([^)]+\)\s*$/, '').trim(),
    etiketler: parantez ? parantez.split(/\s*,\s*/).filter(Boolean) : [],
    tanitim: kalan.join(' ').trim(),
  };
}

const SURE = /^\d+\s*(sn|sa|dk|saniye|dakika)\b/i;

function MedyaKart({ f }) {
  const video = f.tur.startsWith('video/');
  const tur = video ? 'video' : /afi[şs]/i.test(`${f.aciklama} ${f.ad}`) ? 'afis' : 'foto';
  const { baslik, etiketler, tanitim } = aciklamaParcala(f.aciklama || '');
  const adres = `api/bulten/foto/${f.id}`;
  const etiket = baslik || f.ad;
  return (
    <figure className={`bulten-medya bulten-medya-${tur}`}>
      <div className="bulten-medya-cerceve">
        {video
          ? <video src={adres} controls preload="metadata" playsInline aria-label={etiket} />
          : <a href={adres} target="_blank" rel="noopener"><img src={adres} alt={etiket} loading="lazy" /></a>}
        <span className="bulten-medya-tur">
          <svg viewBox="0 0 24 24" aria-hidden="true">{video
            ? <path d="M8 5.5v13l10.5-6.5z" />
            : tur === 'afis'
              ? <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>
              : <><rect x="3" y="6" width="18" height="14" rx="2" /><circle cx="12" cy="13" r="3.5" /><path d="M8 6l1.5-2.5h5L16 6" /></>}</svg>
          {t(`bulten.medya.${tur}`)}
        </span>
      </div>
      {(baslik || tanitim) && (
        <figcaption>
          {baslik && <strong>{baslik}</strong>}
          {etiketler.length > 0 && (
            <span className="bulten-medya-etiketler">
              {etiketler.map((e, i) => (
                <span key={i} className={`bulten-etiket${SURE.test(e) ? ' bulten-etiket-sure' : ''}`}>{e}</span>
              ))}
            </span>
          )}
          {tanitim && <span className="bulten-medya-tanitim">{tanitim}</span>}
        </figcaption>
      )}
    </figure>
  );
}

function AciklamaKutusu({ f, kapat, yenile }) {
  const [hata, setHata] = useState('');
  return (
    <Kutu acik={!!f} onKapat={() => { setHata(''); kapat(); }} koru id="bulten-aciklama-kutu">
      {f && (
        <form className="kutu-ic" onSubmit={async o => {
          o.preventDefault();
          const k = o.currentTarget;
          const aciklama = [k.baslik.value.trim(), k.tanitim.value.trim()].filter(Boolean).join('\n');
          setHata('');
          try {
            await iste(`api/bulten/foto/${f.id}`, { method: 'PUT', body: JSON.stringify({ aciklama }) });
            kapat();
            bildir(t('genel.kaydedildi'));
            yenile();
          } catch (err) { setHata(err.message); }
        }}>
          <div className="kutu-ust">
            <h2>{t('bulten.aciklamaDuzenle')}</h2>
            <button type="button" className="kapat" data-kapat aria-label={t('genel.kapat')}>×</button>
          </div>
          <div className="form-izgara">
            <label className="alan form-tam"><span>{t('bulten.aciklama.baslik')}</span>
              <input name="baslik" maxLength={120} defaultValue={(f.aciklama || '').split('\n')[0]} /></label>
            <p className="form-tam alan-ipucu">{t('bulten.aciklama.baslikIpucu')}</p>
            <label className="alan form-tam"><span>{t('bulten.aciklama.tanitim')}</span>
              <textarea name="tanitim" rows={3} maxLength={270} defaultValue={(f.aciklama || '').split('\n').slice(1).join(' ')} /></label>
          </div>
          <p className="hata" role="alert">{hata}</p>
          <div className="kutu-eylem">
            <button type="submit" className="dugme dugme-birincil">{t('genel.kaydet')}</button>
            <button type="button" className="dugme dugme-ikincil" data-kapat>{t('genel.vazgec')}</button>
          </div>
        </form>
      )}
    </Kutu>
  );
}

function NotKutusu({ acik, b, kapat, yenile }) {
  const [hata, setHata] = useState('');
  return (
    <Kutu acik={acik} onKapat={() => { setHata(''); kapat(); }} koru id="bulten-kutu">
      <form className="kutu-ic" onSubmit={async o => {
        o.preventDefault();
        const f = o.currentTarget;
        setHata('');
        try {
          await iste(`api/bulten/${b.ay}`, {
            method: 'PUT',
            body: JSON.stringify({ yapilanlar: f.yapilanlar.value, yapilacaklar: f.yapilacaklar.value }),
          });
          kapat();
          bildir(t('genel.kaydedildi'));
          yenile();
        } catch (err) { setHata(err.message); }
      }}>
        <div className="kutu-ust">
          <h2>{t('bulten.notBaslik', { ay: ayAdi(b.ay) })}</h2>
          <button type="button" className="kapat" data-kapat aria-label={t('genel.kapat')}>×</button>
        </div>
        <p className="alan-ipucu">{t('bulten.notIpucu')}</p>
        <div className="form-izgara">
          <label className="alan form-tam"><span>{t('bulten.oneCikanlar')}</span>
            <textarea name="yapilanlar" rows={6} maxLength={4000} defaultValue={b.not.yapilanlar} /></label>
          <label className="alan form-tam"><span>{t('bulten.hedefler')}</span>
            <textarea name="yapilacaklar" rows={6} maxLength={4000} defaultValue={b.not.yapilacaklar} /></label>
        </div>
        <p className="hata" role="alert">{hata}</p>
        <div className="kutu-eylem">
          <button type="submit" className="dugme dugme-birincil">{t('genel.kaydet')}</button>
          <button type="button" className="dugme dugme-ikincil" data-kapat>{t('genel.vazgec')}</button>
        </div>
      </form>
    </Kutu>
  );
}
