import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { durum, t, iste, ortakKisa, etkinlikBaslik, tamTarih, tarihAraligi, ayYil, bugun, boyutYaz } from '../ortak.js';
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
/** İki ay arasındaki fark ("2026-10", "2027-01" → 3). */
const ayFark = (a, b) => {
  const [y1, m1] = a.split('-').map(Number);
  const [y2, m2] = b.split('-').map(Number);
  return (y2 - y1) * 12 + m2 - m1;
};

/** Gazete bölümü: küçük üst etiket, serif başlık, altında çift çizgi. */
function Bolum({ id, ust, baslik, sinif = '', sag, children }) {
  return (
    <section className={`bulten-bolum ${sinif}`} aria-labelledby={id} id={`${id}-bolum`}>
      <header className="bulten-bolum-bas">
        <div>
          {ust && <span className="bulten-ust">{ust}</span>}
          <h2 id={id}>{baslik}</h2>
        </div>
        {sag}
      </header>
      {children}
    </section>
  );
}

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

/* Düzenleme modunda her otomatik maddenin yanında gizle/göster düğmesi
   durur; gizlenen madde soluk çizilir. Okuyan gizlenen maddeyi görmez. */
const DuzenBaglam = createContext(null);

function Satir({ href, baslik, alt, rozet, rozetSinif = '', madde }) {
  const duzen = useContext(DuzenBaglam);
  const gizli = !!madde && duzen?.gizliMadde.has(madde);
  if (gizli && !duzen.acik) return null;
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
  const satir = href ? <a className="pano-satir" href={href}>{ic}</a> : <div className="pano-satir">{ic}</div>;
  if (!duzen?.acik || !madde) return <li>{satir}</li>;
  return (
    <li className={`bulten-duzen-madde${gizli ? ' gizli' : ''}`}>
      {satir}
      <button type="button" className="bulten-duzen-dugme" onClick={() => duzen.maddeDegistir(madde)}
        title={t(gizli ? 'bulten.duzen.goster' : 'bulten.duzen.gizle')}>{t(gizli ? 'bulten.duzen.goster' : 'bulten.duzen.gizle')}</button>
    </li>
  );
}

/** Başlıklı küme; boşsa (ya da hepsi gizliyse) hiç çizilmez. */
function Kume({ baslik, satirlar }) {
  const duzen = useContext(DuzenBaglam);
  if (!duzen?.acik) satirlar = satirlar.filter(s => !s.madde || !duzen?.gizliMadde.has(s.madde));
  if (!satirlar.length) return null;
  return (
    <div className="bulten-kume">
      <h3><span>{t(baslik)}</span> <span className="bulten-kume-sayi">{satirlar.length}</span></h3>
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
  madde: `faaliyet:${e.id}`, href: `takvim.html#etkinlik-${e.id}`, baslik: etkinlikBaslik(e),
  alt: `${e.wp}${e.kod ? ' ' + e.kod : ''} · ${tarihAraligi(e.baslangic, e.bitis)} · ${ortakKisa(e.lider)}`,
  rozet, rozetSinif,
});

const gorevSatiri = (g, rozet, rozetSinif) => ({
  madde: `gorev:${g.id}`, href: 'ekip.html', baslik: g.baslik,
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
  /* Düzenleme modu (koordinatör ve yönetici): bölümleri gizler, sıralar,
     otomatik maddeleri gizler, haber ekler, manşeti değiştirir. */
  const [duzenModu, setDuzenModu] = useState(false);
  const [ayar, setAyar] = useState(null);
  const [mansetAcik, setMansetAcik] = useState(false);
  useEffect(() => { setAyar(b?.ayar || null); }, [b]);

  const ayarKaydet = async yeni => {
    const onceki = ayar;
    setAyar(yeni);
    try { setAyar(await iste(`api/bulten/${b.ay}/ayar`, { method: 'PUT', body: JSON.stringify(yeni) })); }
    catch (err) { setAyar(onceki); bildir(err.message, 'hata'); }
  };

  let govde = null;
  if (b && ayar) {
    const acik = duzenModu && b.duzenleyebilir;
    const gizliMadde = new Set(ayar.gizliMadde);
    const gizliBolum = new Set(ayar.gizli);
    const gorunur = bolum => acik || !gizliBolum.has(bolum);
    const baglam = {
      acik, gizliMadde,
      maddeDegistir: m => ayarKaydet({ ...ayar, gizliMadde: gizliMadde.has(m) ? ayar.gizliMadde.filter(x => x !== m) : [...ayar.gizliMadde, m] }),
    };
    /* Okuyan için gizlenen maddeler sayılmaz. */
    const say = satirlar => (acik ? satirlar : satirlar.filter(s => !s.madde || !gizliMadde.has(s.madde))).length;

    const y = b.yapilanlar;
    const z = b.yapilacaklar;

    const yapFaaliyet = y.faaliyet.map(e => faaliyetSatiri(e, t('durum.tamamlandi'), 'bulten-rozet-yesil'));
    const yapGorev = y.gorev.map(g => gorevSatiri(g, t('bulten.tamam'), 'bulten-rozet-yesil'));
    const yapCikti = y.cikti.map(c => ({ madde: `cikti:${c.slug}`, href: `ciktilar.html#${c.slug}`, baslik: t(`${c.anahtar}.baslik`),
      alt: c.sorumlu ? ortakKisa(c.sorumlu) : '', rozet: t('cikti.durum.teslim'), rozetSinif: 'bulten-rozet-yesil' }));
    const yapForm = [
      ...y.formYayin.map(f => ({ madde: `form:${f.id}`, href: `formlar.html#form-${f.id}`, baslik: f.baslik,
        alt: t('bulten.formYayinlandi', { tarih: tamTarih(f.tarih) }) })),
      ...y.formYanit.map(f => ({ madde: `yanit:${f.id}`, href: `formlar.html#form-${f.id}`, baslik: f.baslik,
        alt: t('bulten.yanitGeldi'), rozet: t('bulten.yanitSayi', { n: f.n }) })),
    ];
    const yapDosya = [
      ...y.faaliyetDosya.map(f => ({ madde: `fdosya:${f.id}`, href: `takvim.html#etkinlik-${f.id}`, baslik: etkinlikBaslik(f),
        alt: f.turler.map(x => t(`faaliyet.parca.${x}`)).join(', '), rozet: t('bulten.faaliyetDosyasi') })),
      ...y.dosya.slice(0, 10).map(d => ({ madde: `dosya:${d.id}`, href: `klasorler.html#${d.klasor}`, baslik: d.ad,
        alt: [d.klasor, ortakKisa(d.partner), d.yukleyen, tamTarih(d.tarih)].filter(Boolean).join(' · ') })),
    ];
    if (!b.uye && b.klasorDosyaSayi) yapDosya.push({ madde: 'ozet:klasor', baslik: t('bulten.klasorDosya', { n: b.klasorDosyaSayi }) });
    if (y.dosya.length > 10) yapDosya.push({ madde: 'ozet:fazla', href: 'klasorler.html', baslik: t('bulten.dahaFazla', { n: y.dosya.length - 10 }) });
    if (y.fotograf) yapDosya.push({ madde: 'ozet:fotograf', href: 'takvim.html', baslik: t('bulten.fotograf', { n: y.fotograf }) });
    if (y.ciktiDosya) yapDosya.push({ madde: 'ozet:ciktidosya', href: 'ciktilar.html', baslik: t('bulten.ciktiDosya', { n: y.ciktiDosya }) });

    const zFaaliyet = z.faaliyet.map(e => faaliyetSatiri(e, ...acikRozet(e, e.baslangic <= bugun() && e.durum !== 'ertelendi'
      ? t('durum.devam') : t(`durum.${e.durum}`))));
    const zGorev = z.gorev.map(g => gorevSatiri(g, ...acikRozet(g, `%${g.ilerleme}`)));
    const zCikti = z.cikti.map(c => {
      const [rozet, rozetSinif] = acikRozet(c, t(`cikti.durum.${c.durum}`));
      return { madde: `cikti:${c.slug}`, href: `ciktilar.html#${c.slug}`, baslik: t(`${c.anahtar}.baslik`),
        alt: [c.sorumlu && ortakKisa(c.sorumlu), tamTarih(c.teslim)].filter(Boolean).join(' · '), rozet, rozetSinif };
    });
    const zForm = z.form.map(f => ({ madde: `form:${f.id}`, href: `formlar.html#form-${f.id}`, baslik: f.baslik,
      alt: t('bulten.formSonGun', { tarih: tamTarih(f.sonTarih) }), rozet: t('bulten.yanitSayi', { n: f.yanit }) }));

    const sFaaliyet = b.sonraki.faaliyet.map(e => faaliyetSatiri(e, t(`durum.${e.durum}`)));
    const sGorev = b.sonraki.gorev.map(g => gorevSatiri(g, `%${g.ilerleme}`));

    const yapilanSayi = say(yapFaaliyet) + say(yapGorev) + say(yapCikti) + say(yapForm) + say(yapDosya);
    const yapilacakSayi = say(zFaaliyet) + say(zGorev) + say(zCikti) + say(zForm);
    const dosyaSayi = b.klasorDosyaSayi + y.faaliyetDosya.length + y.fotograf + y.ciktiDosya;
    const yanitSayi = y.formYanit.reduce((n, f) => n + f.n, 0);

    /* Sayı numarası ilk aydan sayılır; proje ayı başlangıçtan (hazırlık ayı 0). */
    const sayiNo = b.aylar.length - b.aylar.indexOf(b.ay);
    const bas = durum.proje?.start?.slice(0, 7);
    const son = durum.proje?.end?.slice(0, 7);
    const projeAy = bas ? ayFark(bas, b.ay) + 1 : 1;
    const toplamAy = bas && son ? ayFark(bas, son) + 1 : 0;
    const medyaVar = (b.fotolar.length > 0 || b.duzenleyebilir) && gorunur('medya');
    const yazilarVar = (b.yazilar.length > 0 || acik) && gorunur('yazilar');
    const izgaraVar = gorunur('yapilan') || gorunur('yapilacak');

    /* Sırası değişebilen bölümler: haberler, medya, yapılanlar/yapılacaklar, gelecek ay. */
    const BOLUM = {
      yazilar: yazilarVar && { icerik: ['bulten-yazilar', 'bulten.yazilar'], ciz: () => <Haberler b={b} acik={acik} yenile={yenile} /> },
      medya: medyaVar && { icerik: ['bulten-foto-bas', 'bulten.fotolar'], ciz: () => <Fotolar b={b} yenile={yenile} /> },
      izgara: izgaraVar && {
        icerik: [gorunur('yapilan') && ['bulten-yapilan', 'bulten.yapilanlar'],
          gorunur('yapilacak') && ['bulten-yapilacak', b.gecmis ? 'bulten.kalanlar' : 'bulten.yapilacaklar']],
        ciz: () => (
          <div className="bulten-izgara">
            {gorunur('yapilan') && (
              <Bolum id="bulten-yapilan" sinif="bulten-yapilan" ust={t('bulten.buAy')} baslik={t('bulten.yapilanlar')}
                sag={acik && <BolumGizle ad="yapilan" ayar={ayar} kaydet={ayarKaydet} />}>
                <Kume baslik="bulten.k.faaliyet" satirlar={yapFaaliyet} />
                <Kume baslik="bulten.k.gorev" satirlar={yapGorev} />
                <Kume baslik="bulten.k.cikti" satirlar={yapCikti} />
                <Kume baslik="bulten.k.form" satirlar={yapForm} />
                <Kume baslik="bulten.k.dosya" satirlar={yapDosya} />
                {!yapilanSayi && <p className="pano-bos">{t('bulten.yapilanlar.bos')}</p>}
              </Bolum>
            )}
            {gorunur('yapilacak') && (
              <Bolum id="bulten-yapilacak" sinif="bulten-yapilacak" ust={t('bulten.gundem')}
                baslik={t(b.gecmis ? 'bulten.kalanlar' : 'bulten.yapilacaklar')}
                sag={acik && <BolumGizle ad="yapilacak" ayar={ayar} kaydet={ayarKaydet} />}>
                {b.not.yapilacaklar && (
                  <div className="bulten-not"><span className="bulten-not-bas">{t('bulten.hedefler')}</span><NotMetni metin={b.not.yapilacaklar} /></div>
                )}
                <Kume baslik="bulten.k.faaliyet" satirlar={zFaaliyet} />
                <Kume baslik="bulten.k.gorev" satirlar={zGorev} />
                <Kume baslik="bulten.k.cikti" satirlar={zCikti} />
                <Kume baslik="bulten.k.form" satirlar={zForm} />
                {!yapilacakSayi && !b.not.yapilacaklar && <p className="pano-bos">{t(b.gecmis ? 'bulten.kalanlar.bos' : 'bulten.yapilacaklar.bos')}</p>}
              </Bolum>
            )}
          </div>
        ),
      },
      sonraki: gorunur('sonraki') && {
        icerik: [['bulten-sonraki', 'bulten.sonraki', { ay: ayAdi(b.sonrakiAy) }]],
        ciz: () => (
          <Bolum id="bulten-sonraki" sinif="bulten-sonraki" ust={t('bulten.gelecekSayi')} baslik={t('bulten.sonraki', { ay: ayAdi(b.sonrakiAy) })}
            sag={acik && <BolumGizle ad="sonraki" ayar={ayar} kaydet={ayarKaydet} />}>
            <div className="bulten-sonraki-izgara">
              <Kume baslik="bulten.k.faaliyet" satirlar={sFaaliyet} />
              <Kume baslik="bulten.k.gorev" satirlar={sGorev} />
            </div>
            {!say(sFaaliyet) && !say(sGorev) && <p className="pano-bos">{t('bulten.sonraki.bos')}</p>}
          </Bolum>
        ),
      },
    };
    const sirali = ayar.sira.filter(ad => BOLUM[ad]);
    const icerik = [
      b.not.yapilanlar && ['bulten-manset', 'bulten.oneCikanlar'],
      ...sirali.flatMap(ad => (ad === 'izgara' ? BOLUM.izgara.icerik.filter(Boolean) : [BOLUM[ad].icerik])),
    ].filter(Boolean);
    const tasi = (ad, yon) => {
      const s = [...ayar.sira];
      const i = s.indexOf(ad);
      /* Görünmeyen (boş) bölümlerin üstünden atlanır. */
      let j = i + yon;
      while (j >= 0 && j < s.length && !BOLUM[s[j]]) j += yon;
      if (j < 0 || j >= s.length) return;
      [s[i], s[j]] = [s[j], s[i]];
      ayarKaydet({ ...ayar, sira: s });
    };

    govde = (
      <DuzenBaglam.Provider value={baglam}>
        <article className={`bulten-kagit${acik ? ' bulten-duzende' : ''}`}>
          <header className="bulten-kunye">
            <div className="bulten-kunye-ust">
              <span>{t('bulten.kunyeUst')}</span>
              <span>{t('bulten.ust')}</span>
            </div>
            <h1 className="bulten-ad">
              <img src="logo.png" alt="" />
              <span>{durum.proje?.acronym || t('site.ad')}</span>
            </h1>
            <p className="bulten-alt-ad">{t('bulten.altAd')}</p>
            <div className="bulten-tarih-serit">
              <span>{t('bulten.sayi', { n: sayiNo })}</span>
              <strong>{ayAdi(b.ay)}</strong>
              <span>{projeAy >= 1 && toplamAy ? t('bulten.projeAyi', { n: projeAy, toplam: toplamAy }) : t('bulten.hazirlikSayisi')}</span>
            </div>
          </header>

          <div className={`bulten-giris-satir${!gorunur('rakamlar') && !gorunur('icindekiler') ? ' bulten-yan-yok' : ''}`}>
            <div className="bulten-manset" id="bulten-manset-bolum">
              <span className="bulten-ust">{t(b.not.yapilanlar ? 'bulten.oneCikanlar' : 'bulten.editorden')}</span>
              <h2 id="bulten-manset">{ayar.manset || t('bulten.mansetBaslik', { ay: ayAdi(b.ay) })}</h2>
              {acik && (
                <span className="bulten-duzen-satir">
                  <button type="button" className="dugme dugme-ikincil dugme-kucuk" onClick={() => setMansetAcik(true)}>{t('bulten.duzen.manset')}</button>
                  <button type="button" className="dugme dugme-ikincil dugme-kucuk" onClick={() => setDuzenle(true)}>{t('bulten.notDuzenle')}</button>
                </span>
              )}
              {b.not.yapilanlar && <div className="bulten-yazi"><NotMetni metin={b.not.yapilanlar} /></div>}
            </div>

            {(gorunur('rakamlar') || gorunur('icindekiler')) && (
              <aside className="bulten-yan" aria-labelledby="bulten-rakam-bas">
                {gorunur('rakamlar') && (
                  <div className={acik && gizliBolum.has('rakamlar') ? 'bulten-duzen-gizli' : undefined}>
                    <span className="bulten-ust" id="bulten-rakam-bas">{t('bulten.rakamlarla')}
                      {acik && <BolumGizle ad="rakamlar" ayar={ayar} kaydet={ayarKaydet} />}</span>
                    <div className="bulten-rakamlar">
                      <Rakam n={y.faaliyet.length + y.gorev.length + y.cikti.length} metin="bulten.r.tamamlanan" />
                      <Rakam n={dosyaSayi} metin="bulten.r.dosya" />
                      <Rakam n={yanitSayi} metin="bulten.r.yanit" />
                      <Rakam n={yapilacakSayi} metin={b.gecmis ? 'bulten.r.kalan' : 'bulten.r.yapilacak'} />
                    </div>
                  </div>
                )}
                {gorunur('icindekiler') && (
                  <nav className={`bulten-icindekiler${acik && gizliBolum.has('icindekiler') ? ' bulten-duzen-gizli' : ''}`} aria-labelledby="bulten-icindekiler-bas">
                    <span className="bulten-ust" id="bulten-icindekiler-bas">{t('bulten.icindekiler')}
                      {acik && <BolumGizle ad="icindekiler" ayar={ayar} kaydet={ayarKaydet} />}</span>
                    <ol>
                      {icerik.map(([id, anahtar, d]) => <li key={id}><a href={`#${id}-bolum`}>{t(anahtar, d)}</a></li>)}
                    </ol>
                  </nav>
                )}
              </aside>
            )}
          </div>

          {sirali.map((ad, i) => (
            <div key={ad} className={acik ? `bulten-duzen-bolum${['yazilar', 'medya'].includes(ad) && gizliBolum.has(ad) ? ' bulten-duzen-gizli' : ''}` : undefined}>
              {acik && (
                <div className="bulten-duzen-arac">
                  <span>{t(`bulten.duzen.bolum.${ad}`)}</span>
                  <button type="button" className="bulten-duzen-dugme" disabled={i === 0} onClick={() => tasi(ad, -1)}
                    aria-label={t('bulten.duzen.yukari')} title={t('bulten.duzen.yukari')}>↑</button>
                  <button type="button" className="bulten-duzen-dugme" disabled={i === sirali.length - 1} onClick={() => tasi(ad, 1)}
                    aria-label={t('bulten.duzen.asagi')} title={t('bulten.duzen.asagi')}>↓</button>
                  {['yazilar', 'medya'].includes(ad) && <BolumGizle ad={ad} ayar={ayar} kaydet={ayarKaydet} />}
                </div>
              )}
              {BOLUM[ad].ciz()}
            </div>
          ))}

          <footer className="bulten-kolofon">
            {b.not.updated && b.not.yazan && (
              <p className="bulten-imza">{t('bulten.notYazan', { ad: b.not.yazan, tarih: tamTarih(b.not.updated.slice(0, 10)) })}</p>
            )}
            <div className="bulten-kolofon-ab">
              <img src="ab-ortak-finanse.svg" alt={t('ab.logo.ortak')} width="163" height="31" />
              <p>{t('altbilgi.feragat')}</p>
            </div>
            <p className="bulten-kolofon-son">
              {[durum.proje?.acronym || t('site.ad'), t('bulten.sayi', { n: sayiNo }), ayAdi(b.ay)].join(' · ')}
            </p>
          </footer>
        </article>
      </DuzenBaglam.Provider>
    );
  }

  return (
    <main id="icerik" className="bulten-sayfa">
      <section className="kapsayici bulten-arac-bas">
        {b ? (
          <div className="bulten-arac">
            <nav className="gorunum bulten-aylar" aria-label={t('bulten.aylar')}>
              {[...b.aylar].reverse().map(ay => (
                <a key={ay} href={`bulten.html?ay=${ay}`} aria-current={ay === b.ay ? 'page' : undefined}>{ayAdi(ay)}</a>
              ))}
            </nav>
            <div className="bulten-eylem">
              {b.duzenleyebilir && (
                <button type="button" className={`dugme ${duzenModu ? 'dugme-birincil' : 'dugme-ikincil'}`} aria-pressed={duzenModu}
                  onClick={() => setDuzenModu(d => !d)}>{t(duzenModu ? 'bulten.duzen.bitir' : 'bulten.duzen.ac')}</button>
              )}
              {b.duzenleyebilir && !duzenModu && (
                <button type="button" className="dugme dugme-ikincil" onClick={() => setDuzenle(true)}>{t('bulten.notDuzenle')}</button>
              )}
              <button type="button" className="dugme dugme-ikincil" onClick={() => print()}>{t('bulten.yazdir')}</button>
            </div>
          </div>
        ) : <h1 className="bulten-yukleniyor">{t('bulten.baslik')}</h1>}
        {b?.duzenleyebilir && duzenModu && <p className="alan-ipucu bulten-duzen-ipucu">{t('bulten.duzen.ipucu')}</p>}
      </section>
      <div className="kapsayici bulten">{govde}</div>
      {b?.duzenleyebilir && <NotKutusu acik={duzenle} b={b} kapat={() => setDuzenle(false)} yenile={yenile} />}
      {b?.duzenleyebilir && ayar && (
        <MansetKutusu acik={mansetAcik} ay={b.ay} deger={ayar.manset} kapat={() => setMansetAcik(false)}
          kaydet={async manset => { await ayarKaydet({ ...ayar, manset }); setMansetAcik(false); }} />
      )}
    </main>
  );
}

/** Bölümü gizle / göster düğmesi (düzenleme modunda). */
function BolumGizle({ ad, ayar, kaydet }) {
  const gizli = ayar.gizli.includes(ad);
  return (
    <button type="button" className="bulten-duzen-dugme"
      onClick={() => kaydet({ ...ayar, gizli: gizli ? ayar.gizli.filter(x => x !== ad) : [...ayar.gizli, ad] })}>
      {t(gizli ? 'bulten.duzen.goster' : 'bulten.duzen.gizle')}
    </button>
  );
}

function MansetKutusu({ acik, ay, deger, kapat, kaydet }) {
  return (
    <Kutu acik={acik} onKapat={kapat} koru id="bulten-manset-kutu">
      {acik && (
        <form className="kutu-ic" onSubmit={o => { o.preventDefault(); kaydet(o.currentTarget.manset.value); }}>
          <div className="kutu-ust">
            <h2>{t('bulten.duzen.manset')}</h2>
            <button type="button" className="kapat" data-kapat aria-label={t('genel.kapat')}>×</button>
          </div>
          <label className="alan"><span>{t('bulten.duzen.mansetAlan')}</span>
            <input name="manset" maxLength={200} defaultValue={deger} placeholder={t('bulten.mansetBaslik', { ay: ayAdi(ay) })} /></label>
          <p className="alan-ipucu">{t('bulten.duzen.mansetIpucu')}</p>
          <div className="kutu-eylem">
            <button type="submit" className="dugme dugme-birincil">{t('genel.kaydet')}</button>
            <button type="button" className="dugme dugme-ikincil" data-kapat>{t('genel.vazgec')}</button>
          </div>
        </form>
      )}
    </Kutu>
  );
}

/**
 * Haberler: koordinatörün yazdığı serbest yazılar (başlık, metin, isteğe
 * bağlı görsel). Görsel ayın medyasından seçilir. Metin ay notuyla aynı
 * kurallarla çizilir: "-" maddeler, bağlantılar, sosyal hesap kartları.
 */
function Haberler({ b, acik, yenile }) {
  const [duzenlenen, setDuzenlenen] = useState(null);
  const gorseller = b.fotolar.filter(f => f.tur.startsWith('image/'));
  const yap = async (istek, mesaj = 'genel.kaydedildi') => {
    try { await istek(); bildir(t(mesaj)); yenile(); } catch (err) { bildir(err.message, 'hata'); }
  };
  return (
    <section className="bulten-bolum bulten-yazilar" aria-labelledby="bulten-yazilar" id="bulten-yazilar-bolum">
      <header className="bulten-bolum-bas">
        <div>
          <span className="bulten-ust">{t('bulten.yazilarUst')}</span>
          <h2 id="bulten-yazilar">{t('bulten.yazilar')}</h2>
        </div>
        {acik && <button type="button" className="dugme dugme-ikincil dugme-kucuk" onClick={() => setDuzenlenen({})}>{t('bulten.yazi.ekle')}</button>}
      </header>
      {!b.yazilar.length && <p className="pano-bos">{t('bulten.yazilar.bos')}</p>}
      <div className="bulten-haberler">
        {b.yazilar.map((h, i) => {
          const foto = h.fotoId && b.fotolar.find(f => f.id === h.fotoId);
          return (
            <article key={h.id} className={`bulten-haber${foto ? ' gorselli' : ''}`}>
              {foto && <img src={`api/bulten/foto/${foto.id}?v=${foto.boyut}`} alt="" loading="lazy" />}
              <div className="bulten-haber-govde">
                <h3>{h.baslik}</h3>
                {h.metin && <div className="bulten-yazi"><NotMetni metin={h.metin} /></div>}
                {acik && (
                  <span className="bulten-duzen-satir">
                    <button type="button" className="bulten-duzen-dugme" onClick={() => setDuzenlenen(h)}>{t('bulten.yazi.duzenle')}</button>
                    <button type="button" className="bulten-duzen-dugme" disabled={i === 0} aria-label={t('bulten.duzen.yukari')}
                      onClick={() => yap(() => iste(`api/bulten/yazi/${h.id}`, { method: 'PUT', body: JSON.stringify({ tasi: -1 }) }))}>↑</button>
                    <button type="button" className="bulten-duzen-dugme" disabled={i === b.yazilar.length - 1} aria-label={t('bulten.duzen.asagi')}
                      onClick={() => yap(() => iste(`api/bulten/yazi/${h.id}`, { method: 'PUT', body: JSON.stringify({ tasi: 1 }) }))}>↓</button>
                    <button type="button" className="bulten-duzen-dugme bulten-duzen-sil" onClick={async () => {
                      if (await onayla(t('bulten.yazi.silSor'), { evet: t('genel.sil'), tehlike: true })) {
                        yap(() => iste(`api/bulten/yazi/${h.id}`, { method: 'DELETE' }), 'genel.silindi');
                      }
                    }}>{t('genel.sil')}</button>
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <Kutu acik={!!duzenlenen} onKapat={() => setDuzenlenen(null)} koru id="bulten-yazi-kutu">
        {duzenlenen && (
          <form className="kutu-ic" onSubmit={async o => {
            o.preventDefault();
            const f = o.currentTarget;
            const govde = JSON.stringify({ baslik: f.baslik.value, metin: f.metin.value, fotoId: f.fotoId.value || null });
            try {
              if (duzenlenen.id) await iste(`api/bulten/yazi/${duzenlenen.id}`, { method: 'PUT', body: govde });
              else await iste(`api/bulten/${b.ay}/yazi`, { method: 'POST', body: govde });
              setDuzenlenen(null);
              bildir(t('genel.kaydedildi'));
              yenile();
            } catch (err) { bildir(err.message, 'hata'); }
          }}>
            <div className="kutu-ust">
              <h2>{t(duzenlenen.id ? 'bulten.yazi.duzenle' : 'bulten.yazi.ekle')}</h2>
              <button type="button" className="kapat" data-kapat aria-label={t('genel.kapat')}>×</button>
            </div>
            <div className="form-izgara">
              <label className="alan form-tam"><span>{t('bulten.yazi.baslik')}</span>
                <input name="baslik" required maxLength={200} defaultValue={duzenlenen.baslik || ''} /></label>
              <label className="alan form-tam"><span>{t('bulten.yazi.metin')}</span>
                <textarea name="metin" rows={8} maxLength={8000} defaultValue={duzenlenen.metin || ''} /></label>
              <p className="form-tam alan-ipucu">{t('bulten.notIpucu')}</p>
              <label className="alan form-tam"><span>{t('bulten.yazi.gorsel')}</span>
                <select name="fotoId" defaultValue={duzenlenen.fotoId || ''}>
                  <option value="">{t('bulten.yazi.gorselYok')}</option>
                  {gorseller.map(g => <option key={g.id} value={g.id}>{(g.aciklama || '').split('\n')[0] || g.ad}</option>)}
                </select></label>
              {!gorseller.length && <p className="form-tam alan-ipucu">{t('bulten.yazi.gorselIpucu')}</p>}
            </div>
            <div className="kutu-eylem">
              <button type="submit" className="dugme dugme-birincil">{t('genel.kaydet')}</button>
              <button type="button" className="dugme dugme-ikincil" data-kapat>{t('genel.vazgec')}</button>
            </div>
          </form>
        )}
      </Kutu>
    </section>
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
    <section className="bulten-bolum bulten-fotolar" aria-labelledby="bulten-foto-bas" id="bulten-foto-bas-bolum">
      <header className="bulten-bolum-bas">
        <div>
          <span className="bulten-ust">{t('bulten.ayinKareleri')}</span>
          <h2 id="bulten-foto-bas">{t('bulten.fotolar')}</h2>
        </div>
        {b.duzenleyebilir && b.fotolar.length < b.maxFoto && (
          <label className="dugme dugme-ikincil dugme-kucuk bulten-eylem-dugme">
            {t(yukleniyor ? 'bulten.fotoYukleniyor' : 'bulten.fotoEkle')}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,application/pdf" multiple hidden disabled={yukleniyor}
              onChange={o => { const d = [...o.target.files]; o.target.value = ''; if (d.length) yukle(d); }} />
          </label>
        )}
      </header>
      {!b.fotolar.length
        ? <p className="pano-bos">{t('bulten.fotolar.bos')}</p>
        : (
          <ul className={`bulten-foto-izgara${b.fotolar.length === 1 ? ' tek' : ''}`}>
            {/* Fotoğraflar başta, satırda üç; ardından afişler; videolar iki
                tane yan yana (tek video tam satır); PDF belgeler en sonda, tam satır. */}
            {[...b.fotolar].sort((x, y) => SIRA[medyaTuru(x)] - SIRA[medyaTuru(y)]).map(f => (
              <li key={f.id} className={medyaSinifi(f, b.fotolar)}>
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

/** Medyanın türü: PDF belge, video, afiş (açıklamada ya da adda "afiş" geçer) ya da fotoğraf. */
const medyaTuru = f => (f.tur === 'application/pdf' ? 'belge'
  : f.tur.startsWith('video/') ? 'video' : /afi[şs]/i.test(`${f.aciklama} ${f.ad}`) ? 'afis' : 'foto');
const SIRA = { foto: 0, afis: 1, video: 2, belge: 3 };
/** Izgara hücresinin sınıfı: belge ve tek başına kalan video tam satır kaplar. */
const medyaSinifi = (f, hepsi) => {
  const tur = medyaTuru(f);
  if (tur === 'belge') return 'bulten-foto-genis';
  if (tur !== 'video') return undefined;
  return hepsi.filter(x => medyaTuru(x) === 'video').length === 1 ? 'bulten-foto-video bulten-foto-genis' : 'bulten-foto-video';
};

function MedyaKart({ f }) {
  const tur = medyaTuru(f);
  if (tur === 'belge') return <BelgeKart f={f} />;
  const video = tur === 'video';
  const { baslik, etiketler, tanitim } = aciklamaParcala(f.aciklama || '');
  /* Yanıt bir yıl önbellekte kalır: görsel değişince adres de değişsin diye boyut eklenir. */
  const adres = `api/bulten/foto/${f.id}?v=${f.boyut}`;
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

/**
 * PDF belge: kapakta ilk sayfa (tarayıcıda pdf.js ile çizilir; çizilemezse
 * belge simgesi kalır), yanında açma ve indirme bağlantısı.
 */
function BelgeKart({ f }) {
  const { baslik, etiketler, tanitim } = aciklamaParcala(f.aciklama || '');
  const adres = `api/bulten/foto/${f.id}?v=${f.boyut}`;
  const tuval = useRef(null);
  const [kapak, setKapak] = useState(false);
  useEffect(() => {
    let iptal = false;
    setKapak(false);
    import('../pdfKapak.js')
      .then(({ kapakCiz }) => kapakCiz(adres, tuval.current, 240))
      .then(() => { if (!iptal) setKapak(true); })
      .catch(() => {});
    return () => { iptal = true; };
  }, [adres]);
  return (
    <figure className="bulten-medya bulten-medya-belge">
      <a className={`bulten-belge-kapak${kapak ? ' cizildi' : ''}`} href={adres} target="_blank" rel="noopener" aria-label={baslik || f.ad}>
        <canvas ref={tuval} aria-hidden="true" />
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>
        <span>PDF</span>
      </a>
      <figcaption>
        <span className="bulten-ust">{t('bulten.medya.belge')}</span>
        <strong>{baslik || f.ad}</strong>
        {etiketler.length > 0 && (
          <span className="bulten-medya-etiketler">
            {etiketler.map((e, i) => <span key={i} className="bulten-etiket">{e}</span>)}
          </span>
        )}
        {tanitim && <span className="bulten-medya-tanitim">{tanitim}</span>}
        <span className="bulten-belge-eylem">
          <a className="dugme dugme-birincil dugme-kucuk" href={adres} target="_blank" rel="noopener">{t('bulten.belgeAc')}</a>
          <a className="dugme dugme-ikincil dugme-kucuk" href={adres} download={f.ad}>{t('bulten.belgeIndir', { boyut: boyutYaz(f.boyut) })}</a>
        </span>
      </figcaption>
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
