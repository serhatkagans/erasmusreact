import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  durum, t, iste, hataMetni, ortakAdi, ortakKisa, yerAdi, etkinlikBaslik, etkinlikOzet, tarihAraligi, tamTarih, ayYil,
  bugun, gunFarki, boyutYaz,
} from '../ortak.js';
import { useKonum, capaAyarla } from '../yonlendirme.js';
import { useBaslik } from '../bilesenler/Kabuk.jsx';
import Kutu, { onayla, bildir } from '../bilesenler/Kutu.jsx';

/**
 * Etkinlik takvimi: üç görünüm (gün ızgarası, 24 aylık zaman çizelgesi,
 * liste), ortak süzgeç, ayrıntı kutusu, ekleme/düzenleme formu, fotoğraflar,
 * faaliyet dosyası ve faaliyet raporu.
 *
 * Varsayılan gün ızgarasıdır: kullanıcılar takvimden önce "bu ay hangi gün
 * ne var" sorusunu soruyor. Zaman çizelgesi 24 ayın bütününü görmek
 * isteyenler için bir tık uzakta.
 */

const GORUNUMLER = ['ay', 'zaman', 'liste'];
const BOS_FILTRE = { arama: '', wp: '', tur: '', ortak: '', durum: '' };

const ayAnahtari = gun => gun.slice(0, 7);
/* İki gün arasındaki tam ay farkı: çizelgede sütun konumunu verir. */
const ayFarki = (a, b) =>
  (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + (Number(b.slice(5, 7)) - Number(a.slice(5, 7)));
const ayGunu = imlec => imlec.toISOString().slice(0, 10);

/** Kullanıcı bu kaydı düzenleyebilir mi? Sunucudaki kuralın aynısı —
 *  arayüz yalnızca yapılabileni gösterir, yetkiyi sunucu doğrular. */
const duzenleyebilir = e =>
  !!durum.kullanici && (durum.kullanici.koordinator || durum.kullanici.partner === e.lider);

function suz(etkinlikler, filtre) {
  const ara = filtre.arama.trim().toLocaleLowerCase(durum.dil);
  return etkinlikler.filter(e => {
    if (filtre.wp && e.wp !== filtre.wp) return false;
    if (filtre.tur && e.tur !== filtre.tur) return false;
    if (filtre.durum && e.durum !== filtre.durum) return false;
    if (filtre.ortak && e.lider !== filtre.ortak && !e.katilimcilar.includes(filtre.ortak)) return false;
    if (!ara) return true;
    const havuz = [etkinlikBaslik(e), etkinlikOzet(e), t(`wp.${e.wp}.ad`), t(`tur.${e.tur}`), yerAdi(e.yer), ortakAdi(e.lider)]
      .join(' ').toLocaleLowerCase(durum.dil);
    return havuz.includes(ara);
  });
}

const Etiket = ({ metin, ek = '', wp, durum: d }) => (
  <span className={`etiket ${ek}`.trim()} data-wp={wp} data-durum={d}>{metin}</span>
);

/** Açılışta proje içindeysek bu ay, değilsek projenin ilk ayı. */
function ilkImlec() {
  const simdi = bugun();
  const gun = simdi >= durum.proje.start && simdi <= durum.proje.end ? simdi : durum.proje.start;
  return new Date(Date.UTC(Number(gun.slice(0, 4)), Number(gun.slice(5, 7)) - 1, 1));
}

export default function Takvim() {
  useBaslik('takvim.baslik');
  const { hash } = useKonum();
  const [veri, setVeri] = useState(null);
  const [hata, setHata] = useState('');
  const [gorunum, setGorunum] = useState('ay');
  const [imlec, setImlec] = useState(ilkImlec);
  const [filtre, setFiltre] = useState(BOS_FILTRE);
  const [aramaGirdi, setAramaGirdi] = useState('');
  const [detayId, setDetayId] = useState(null);
  const [form, setForm] = useState(null);        // { id: null | sayı }
  const [raporAcik, setRaporAcik] = useState(false);

  const etkinlikler = veri?.etkinlikler || [];
  const maxFoto = veri?.maxFoto ?? 10;

  const yenile = useCallback(async () => {
    const v = await iste('api/etkinlikler');
    setVeri(v);
    return v;
  }, []);
  useEffect(() => { yenile().catch(err => setHata(err.message)); }, [yenile]);

  /* Her tuşta yeniden çizmek zaman çizelgesinde gözle görülür takılmaya
     yol açıyordu; kısa bir bekleme yeterli. */
  useEffect(() => {
    const z = setTimeout(() => setFiltre(f => (f.arama === aramaGirdi ? f : { ...f, arama: aramaGirdi })), 160);
    return () => clearTimeout(z);
  }, [aramaGirdi]);

  /** Ana sayfa, pano ve hatırlatıcılar `#etkinlik-<id>` ile gelir: liste
   *  görünümüne geçilip o kayıt açılır. */
  useEffect(() => {
    const eslesme = /^#etkinlik-(\d+)$/.exec(hash);
    if (!eslesme || !veri) return;
    const hedef = veri.etkinlikler.find(e => e.id === Number(eslesme[1]));
    if (!hedef) return;
    setGorunum('liste');
    setDetayId(hedef.id);
    /* Çapa işlendi: kayıt sonrası liste tazelenince kutu yeniden açılmasın. */
    capaAyarla('', { degistir: true });
  }, [hash, veri]);

  const hepsi = useMemo(() => suz(etkinlikler, filtre), [etkinlikler, filtre]);
  /* Ay görünümü yalnızca o ayı gösterir; çizelge ve liste tüm programı. */
  const liste = gorunum === 'ay'
    ? hepsi.filter(e => ayFarki(e.baslangic, ayGunu(imlec)) >= 0 && ayFarki(ayGunu(imlec), e.bitis) >= 0)
    : hepsi;

  const detay = etkinlikler.find(e => e.id === detayId) || null;
  const formKaydi = form?.id ? etkinlikler.find(e => e.id === form.id) : null;

  const kaydir = adim => setImlec(i => new Date(Date.UTC(i.getUTCFullYear(), i.getUTCMonth() + adim, 1)));
  const ayDisi = gorunum !== 'ay';

  let govde;
  if (hata) govde = <p className="bos-durum">{hata}</p>;
  else if (!veri) govde = null;
  else if (!liste.length) govde = <p className="bos-durum">{t('takvim.bos')}</p>;
  else if (gorunum === 'zaman') govde = <ZamanCizelgesi liste={liste} ac={setDetayId} />;
  else if (gorunum === 'ay') govde = <AyIzgarasi liste={liste} imlec={imlec} ac={setDetayId} />;
  else govde = <Liste liste={liste} ac={setDetayId} />;

  return (
    <main id="icerik">
      <section className="kapsayici sayfa-bas">
        <span className="ustbaslik">{t('takvim.ustbaslik')}</span>
        <h1>{t('takvim.baslik')}</h1>
        <p>{t('takvim.giris')}</p>
      </section>

      <div className="kapsayici takvim-duzen">
        <section className="pano" aria-label="Etkinlik programı">
          <div className="pano-bas">
            <h2 id="pano-baslik">{gorunum === 'ay'
              ? ayYil(imlec.getUTCFullYear(), imlec.getUTCMonth())
              : tarihAraligi(durum.proje.start, durum.proje.end)}</h2>
            {/* Program herkese açık, rapor değil: belgenin altbilgisinde kimin
                ürettiği yazdığı için giriş ister (bkz. routes/rapor.mjs). */}
            {durum.kullanici && (
              <div className="pano-bas-sag">
                <button id="rapor-dugme" className="dugme dugme-ikincil" onClick={() => setRaporAcik(true)}>{t('takvim.rapor')}</button>
                <button id="ekle-dugme" className="dugme dugme-birincil" onClick={() => setForm({ id: null })}>{t('takvim.ekle')}</button>
              </div>
            )}
          </div>

          <div className="denetimler">
            {/* Ay dışı gezinti anlamsız: çizelge ve liste zaten tüm projeyi kapsıyor. */}
            <div className="gezinti">
              <button id="onceki" aria-label={t('takvim.onceki')} disabled={ayDisi} onClick={() => kaydir(-1)}>‹</button>
              <button id="bugun-dugme" disabled={ayDisi} onClick={() => {
                const simdi = new Date();
                setImlec(new Date(Date.UTC(simdi.getFullYear(), simdi.getMonth(), 1)));
              }}>{t('takvim.bugun')}</button>
              <button id="sonraki" aria-label={t('takvim.sonraki')} disabled={ayDisi} onClick={() => kaydir(1)}>›</button>
            </div>
            <AyYilSecici imlec={imlec} setImlec={setImlec} kilitli={ayDisi} />
            <div className="gorunum" role="group">
              {GORUNUMLER.map(ad => (
                <button key={ad} id={`gorunum-${ad}`} aria-pressed={gorunum === ad} onClick={() => setGorunum(ad)}>{t(`takvim.gorunum.${ad}`)}</button>
              ))}
            </div>
          </div>

          <div className="filtreler">
            <label className="alan alan-genis">
              <span>{t('takvim.ara')}</span>
              <input id="arama" type="search" maxLength={100} placeholder={t('takvim.ara.ipucu')} value={aramaGirdi} onChange={o => setAramaGirdi(o.target.value)} />
            </label>
            <FiltreSecim ad="ispaketi" deger={filtre.wp} degerler={durum.ispaketleri} etiketle={wp => t(`wp.${wp}.ad`)} degistir={v => setFiltre(f => ({ ...f, wp: v }))} />
            <FiltreSecim ad="tur" deger={filtre.tur} degerler={durum.turler} etiketle={x => t(`tur.${x}`)} degistir={v => setFiltre(f => ({ ...f, tur: v }))} />
            <FiltreSecim ad="ortak" deger={filtre.ortak} degerler={durum.ortaklar.map(o => o.id)} etiketle={ortakAdi} degistir={v => setFiltre(f => ({ ...f, ortak: v }))} />
            <FiltreSecim ad="durum" deger={filtre.durum} degerler={durum.durumlar} etiketle={d => t(`durum.${d}`)} degistir={v => setFiltre(f => ({ ...f, durum: v }))} />
            <button id="filtre-temizle" className="metin-bag" onClick={() => { setFiltre(BOS_FILTRE); setAramaGirdi(''); }}>{t('takvim.filtre.temizle')}</button>
          </div>

          <div id="gorunum-kabi">{govde}</div>

          <div className="pano-alt">
            {/* Renk göstergesi: paketin adı yazılı, tam başlığı ipucunda. */}
            <div className="gosterge" id="gosterge">
              {durum.ispaketleri.map(wp => (
                <span key={wp} title={t(`wp.${wp}.baslik`)}><i data-wp={wp} />{`${wp} · ${t(`wp.${wp}.kisa`)}`}</span>
              ))}
            </div>
            <span id="pano-sayi" className="pano-sayi">{veri ? t('takvim.sayi', { n: liste.length }) : ''}</span>
          </div>
        </section>
      </div>

      <DetayKutusu e={detay} kapat={() => setDetayId(null)} yenile={yenile}
        duzenle={e => { setDetayId(null); setForm({ id: e.id }); }} />
      <EtkinlikFormu acik={!!form} mevcut={formKaydi} maxFoto={maxFoto} kapat={() => setForm(null)} yenile={yenile} />
      <RaporKutusu acik={raporAcik} kapat={() => setRaporAcik(false)} filtre={filtre} etkinlikler={etkinlikler} gorunum={gorunum} imlec={imlec} />
    </main>
  );
}

function FiltreSecim({ ad, deger, degerler, etiketle, degistir }) {
  return (
    <label className="alan"><span>{t(`takvim.filtre.${ad}`)}</span>
      <select id={`filtre-${ad === 'ispaketi' ? 'wp' : ad}`} value={deger} onChange={o => degistir(o.target.value)}>
        <option value="">{t('takvim.filtre.hepsi')}</option>
        {degerler.map(d => <option key={d} value={d}>{etiketle(d)}</option>)}
      </select>
    </label>
  );
}

/* --- Ay ve yıl seçimi -------------------------------------------------
   24 aylık programda uzaktaki bir aya oklarla gitmek yirmi tıklama demek;
   seçiciler tek adımda götürür. Yıl listesi proje dönemini kapsar; oklarla
   dönem dışına çıkıldıysa o yıl da listeye katılır. */
function AyYilSecici({ imlec, setImlec, kilitli }) {
  const adlar = new Intl.DateTimeFormat(durum.dil, { timeZone: 'UTC', month: 'long' });
  const yillar = [];
  for (let y = Number(durum.proje.start.slice(0, 4)); y <= Number(durum.proje.end.slice(0, 4)); y++) yillar.push(y);
  if (!yillar.includes(imlec.getUTCFullYear())) yillar.push(imlec.getUTCFullYear());
  yillar.sort((a, b) => a - b);
  return (
    <div className="ay-secici">
      <select id="ay-secim" aria-label={t('takvim.aysec')} disabled={kilitli} value={imlec.getUTCMonth()}
        onChange={o => setImlec(new Date(Date.UTC(imlec.getUTCFullYear(), Number(o.target.value), 1)))}>
        {Array.from({ length: 12 }, (_, ay) => <option key={ay} value={ay}>{adlar.format(new Date(Date.UTC(2000, ay, 1)))}</option>)}
      </select>
      <select id="yil-secim" aria-label={t('takvim.yilsec')} disabled={kilitli} value={imlec.getUTCFullYear()}
        onChange={o => setImlec(new Date(Date.UTC(Number(o.target.value), imlec.getUTCMonth(), 1)))}>
        {yillar.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  );
}

/* --- Zaman çizelgesi ----------------------------------------------------- */
function ZamanCizelgesi({ liste, ac }) {
  const { start, end } = durum.proje;
  const ayAdet = ayFarki(start, end) + 1;
  const simdi = bugun();
  const ayKisa = new Intl.DateTimeFormat(durum.dil, { timeZone: 'UTC', month: 'short' });

  const ogeler = [<div key="bos" className="zaman-etiket" />];
  /* Başlık satırı: ay kısaltması + yıl değiştiğinde yıl. */
  for (let i = 0; i < ayAdet; i++) {
    const tarih = new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1 + i, 1));
    ogeler.push(
      <div key={`ay${i}`} className="zaman-ay">
        {ayKisa.format(tarih)}
        {(tarih.getUTCMonth() === 0 || i === 0) && <small>{String(tarih.getUTCFullYear())}</small>}
      </div>,
    );
  }

  /* Satırlar iş paketine göre gruplanır; grid satır sayacı elle tutulur
     çünkü çubuk kendi satırındaki hücrelerin üstüne biniyor. */
  let satir = 2;
  const gruplar = durum.ispaketleri
    .map(wp => [wp, liste.filter(e => e.wp === wp).sort((a, b) => a.baslangic.localeCompare(b.baslangic))])
    .filter(([, kayitlar]) => kayitlar.length);

  for (const [wp, kayitlar] of gruplar) {
    ogeler.push(<div key={`wp${wp}`} className="zaman-wp-bas" style={{ gridRow: String(satir) }}>{t(`wp.${wp}.ad`)}</div>);
    satir++;
    for (const e of kayitlar) {
      const s = satir;
      ogeler.push(
        <div key={`et${e.id}`} className="zaman-etiket" style={{ gridRow: String(s) }}>
          <strong>{etkinlikBaslik(e)}</strong>
          <small>{`${t(`tur.${e.tur}.kisa`)} · ${ortakKisa(e.lider)}`}</small>
        </div>,
      );
      for (let i = 0; i < ayAdet; i++) {
        ogeler.push(<div key={`h${e.id}-${i}`} className="zaman-hucre" style={{ gridRow: String(s), gridColumn: String(i + 2) }} />);
      }
      /* Sütun çözünürlüğü aydır. Kısa çubuk (1-2 ay) tür kodunu gösterir;
         tam ad satır etiketinde ve ipucunda durur. */
      const ilk = Math.max(0, ayFarki(start, e.baslangic));
      const son = Math.min(ayAdet - 1, ayFarki(start, e.bitis));
      const genislik = Math.max(son, ilk) - ilk + 1;
      ogeler.push(
        <button key={`c${e.id}`} type="button" className="zaman-cubuk" data-wp={e.wp} data-durum={e.durum}
          title={`${etkinlikBaslik(e)} — ${tarihAraligi(e.baslangic, e.bitis)}`}
          style={{ '--satir': String(s), gridColumn: `${ilk + 2} / ${Math.max(son, ilk) + 3}` }}
          onClick={() => ac(e.id)}>
          {genislik <= 2 ? t(`tur.${e.tur}.kisa`) : etkinlikBaslik(e)}
        </button>,
      );
      satir++;
    }
  }

  /* Bugün çizgisi yalnızca proje aralığındayken çizilir. */
  if (simdi >= start && simdi <= end) {
    ogeler.push(<div key="bugun" className="zaman-bugun" title={t('takvim.bugun')} style={{ gridColumn: String(ayFarki(start, simdi) + 2) }} />);
  }

  return (
    <div className="zaman-sar">
      <div className="zaman" style={{ gridTemplateColumns: `220px repeat(${ayAdet}, minmax(52px, 1fr))` }}>{ogeler}</div>
    </div>
  );
}

/* --- Ay ızgarası --------------------------------------------------------- */
function AyIzgarasi({ liste, imlec, ac }) {
  const yil = imlec.getUTCFullYear(), ay = imlec.getUTCMonth();
  /* Hafta pazartesi başlar (Avrupa alışkanlığı); gün adları Intl'den gelir. */
  const adBicim = new Intl.DateTimeFormat(durum.dil, { timeZone: 'UTC', weekday: 'short' });
  const kaydir = (new Date(Date.UTC(yil, ay, 1)).getUTCDay() + 6) % 7;
  const basla = new Date(Date.UTC(yil, ay, 1 - kaydir));
  const simdi = bugun();

  return (
    <div className="ay-izgara">
      {Array.from({ length: 7 }, (_, i) => <div key={`g${i}`} className="ay-baslik">{adBicim.format(new Date(Date.UTC(2024, 0, 1 + i)))}</div>)}
      {Array.from({ length: 42 }, (_, i) => {
        const gun = new Date(basla.getTime() + i * 86400000);
        const anahtar = gun.toISOString().slice(0, 10);
        return (
          <div key={anahtar} className="ay-gun" data-disarda={gun.getUTCMonth() !== ay ? '1' : undefined} data-bugun={anahtar === simdi ? '1' : undefined}>
            <span className="ay-gun-no">{String(gun.getUTCDate())}</span>
            {liste.filter(x => x.baslangic <= anahtar && anahtar <= x.bitis).map(e => (
              <button key={e.id} type="button" className="ay-etkinlik" data-wp={e.wp} data-durum={e.durum} title={etkinlikBaslik(e)}
                onClick={() => ac(e.id)}>{etkinlikBaslik(e)}</button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/* --- Liste --------------------------------------------------------------- */
function Liste({ liste, ac }) {
  const satirlar = [];
  let sonAy = '';
  for (const e of [...liste].sort((a, b) => a.baslangic.localeCompare(b.baslangic))) {
    const anahtar = ayAnahtari(e.baslangic);
    if (anahtar !== sonAy) {
      sonAy = anahtar;
      satirlar.push(<div key={`ay${anahtar}`} className="liste-ay">{ayYil(Number(anahtar.slice(0, 4)), Number(anahtar.slice(5, 7)) - 1)}</div>);
    }
    const sure = gunFarki(e.baslangic, e.bitis) + 1;
    /* Faaliyet dosyası yalnızca başlamış faaliyette gösterilir: gelecektekinde
       "0/6" bir eksik değil, henüz zamanı gelmemiş iştir. */
    const dosyaRozet = e.dosya && e.baslangic <= bugun();
    satirlar.push(
      <button key={e.id} type="button" className="liste-satir" data-wp={e.wp} id={`etkinlik-${e.id}`} onClick={() => ac(e.id)}>
        <div className="liste-tarih">{tarihAraligi(e.baslangic, e.bitis)}<small>{`${sure} ${t('genel.gun')}`}</small></div>
        <div>
          <div className="liste-ad">{etkinlikBaslik(e)}</div>
          <div className="liste-etiketler">
            <Etiket metin={t(`wp.${e.wp}.ad`)} ek="etiket-wp" wp={e.wp} />
            <Etiket metin={t(`tur.${e.tur}`)} />
            <Etiket metin={`${yerAdi(e.yer)} · ${ortakKisa(e.lider)}`} />
            {dosyaRozet && (
              <span className={`fd-rozet${e.dosya.tamam === e.dosya.toplam ? ' fd-rozet-tamam' : ''}`}>
                {t('faaliyet.rozet', { n: e.dosya.tamam, toplam: e.dosya.toplam })}
              </span>
            )}
          </div>
        </div>
        <Etiket metin={t(`durum.${e.durum}`)} ek="etiket-durum" durum={e.durum} />
      </button>,
    );
  }
  return <div className="liste">{satirlar}</div>;
}

/* --- Fotoğraflar ---------------------------------------------------------
   Görseller listeyle birlikte gelmez: burada yalnızca kimlikleri var,
   gövdeyi tarayıcı `/api/foto/<id>` üzerinden kendisi çeker. */
function Galeri({ fotolar, silinebilir, sonra, id }) {
  if (!fotolar.length && !silinebilir) return null;
  return (
    <div id={id} className="foto-galeri">
      {!fotolar.length && <p className="ipucu">{t('foto.yok')}</p>}
      {fotolar.map(f => (
        <figure key={f.id} className="foto-kutu">
          <a href={`api/foto/${f.id}`} target="_blank" rel="noopener" title={t('foto.ac')}>
            {/* loading="lazy" YOK: modal <dialog> içinde tembel görsel kaydırınca da yüklenmiyordu.
                Eski sürümde de src önce atandığı için görseller hemen yükleniyordu. */}
            <img src={`api/foto/${f.id}`} alt={f.ad} />
          </a>
          {silinebilir && (
            <button type="button" className="foto-sil" title={t('foto.sil')} aria-label={`${t('foto.sil')}: ${f.ad}`} onClick={async () => {
              if (!(await onayla(t('foto.silOnay', { ad: f.ad }), { evet: t('genel.sil'), tehlike: true }))) return;
              try {
                await iste(`api/foto/${f.id}`, { method: 'DELETE' });
                await sonra();
              } catch (err) { bildir(err.message, 'hata'); }
            }}>×</button>
          )}
        </figure>
      ))}
    </div>
  );
}

/* --- Ayrıntı kutusu ------------------------------------------------------ */
function DetayKutusu({ e, kapat, yenile, duzenle }) {
  return (
    <Kutu acik={!!e} onKapat={kapat} id="detay-kutu">
      {e && <DetayIcerik e={e} yenile={yenile} duzenle={duzenle} />}
    </Kutu>
  );
}

function DetayIcerik({ e, yenile, duzenle }) {
  const yetkili = duzenleyebilir(e);
  const ozet = etkinlikOzet(e);
  const sure = gunFarki(e.baslangic, e.bitis) + 1;
  const satirlar = [
    ['etkinlik.tarih', tarihAraligi(e.baslangic, e.bitis)],
    ['etkinlik.sure', `${sure} ${t('genel.gun')}`],
    ['etkinlik.yer', yerAdi(e.yer)],
    ['etkinlik.lider', ortakAdi(e.lider)],
    ['etkinlik.katilimci', e.katilimcilar.map(ortakAdi).join(', ') || '—'],
  ];

  const sil = async () => {
    if (!(await onayla(t('form.sil.onay'), { evet: t('genel.sil'), tehlike: true }))) return;
    try {
      await iste(`api/etkinlikler/${e.id}`, { method: 'DELETE' });
      await yenile();
    } catch (err) { bildir(err.message, 'hata'); }
  };

  return (
    <div className="kutu-ic">
      <div className="kutu-ust">
        <h2 id="detay-baslik">{etkinlikBaslik(e)}</h2>
        <button type="button" className="kapat" data-kapat aria-label={t('genel.kapat')}>×</button>
      </div>
      <div id="detay-etiketler" className="kutu-etiketler">
        <Etiket metin={t(`wp.${e.wp}.ad`)} ek="etiket-wp" wp={e.wp} />
        <Etiket metin={t(`tur.${e.tur}`)} />
        <Etiket metin={t(`durum.${e.durum}`)} ek="etiket-durum" durum={e.durum} />
        <Etiket metin={t(e.resmi ? 'etkinlik.resmi' : 'etkinlik.yerel')} />
      </div>
      <dl id="detay-satirlar" className="kutu-satirlar">
        {satirlar.map(([a, d]) => <div key={a} className="kutu-satir"><dt>{t(a)}</dt><dd>{d}</dd></div>)}
      </dl>
      {ozet && <div id="detay-ozet" className="kutu-ozet"><strong>{t('etkinlik.ozet')}</strong>{ozet}</div>}
      {e.dosya && <DosyaSeridi e={e} yenile={yenile} fotoEkle={() => duzenle(e)} />}
      <Galeri id="detay-fotolar" fotolar={e.fotolar || []} silinebilir={false} />
      {/* Silme düğmesi yoksa nedeni söylenir: resmî program taahhüttür,
          silinemez, yalnızca düzenlenir ya da "Ertelendi" yapılır. */}
      {yetkili && e.resmi && (
        <p id="detay-resmi-not" className="kutu-aciklama detay-resmi-not">
          {t(durum.kullanici?.koordinator ? 'etkinlik.resmi.silinmez' : 'etkinlik.resmi.silinmezOrtak')}
        </p>
      )}
      <div className="kutu-eylem">
        {yetkili && <button id="detay-duzenle" className="dugme dugme-birincil" onClick={() => duzenle(e)}>{t('genel.duzenle')}</button>}
        {yetkili && !e.resmi && <button id="detay-sil" className="dugme dugme-tehlike" onClick={sil}>{t('genel.sil')}</button>}
        {e.url && <a id="detay-baglanti" className="metin-bag" target="_blank" rel="noopener noreferrer" href={e.url}>{t('etkinlik.baglanti')}</a>}
      </div>
    </div>
  );
}

/* --- Faaliyet dosyası ------------------------------------------------------
   Pencerede bir şerit: "Faaliyet dosyası 4/6" ve her parçanın satırı. Eksik
   parça tıklanınca kendi satırına gidilir. Fotoğraf ve anket türetilir:
   fotoğraf etkinliğin galerisinden, anket Formlar'dan. */
function DosyaSeridi({ e, yenile, fotoEkle }) {
  const [veri, setVeri] = useState(null);
  const [surum, setSurum] = useState(0);
  useEffect(() => {
    let iptal = false;
    iste(`api/etkinlikler/${e.id}/dosya`)
      .then(v => { if (!iptal) setVeri(v); })
      .catch(err => { if (!iptal) { setVeri(null); bildir(err.message, 'hata'); } });
    return () => { iptal = true; };
  }, [e.id, surum]);

  /** Dosya değişince hem şerit hem liste/ana sayfa özetleri tazelenir. */
  const degisti = async () => { await yenile(); setSurum(s => s + 1); };
  if (!veri) return null;

  const tamam = veri.parcalar.filter(p => p.tamam).length;
  return (
    <section id="detay-dosya" className="faaliyet-dosya">
      <div className="fd-bas">
        <h3>{t('faaliyet.baslik')}</h3>
        <span className={`fd-sayac${tamam === veri.parcalar.length ? ' fd-sayac-tamam' : ''}`}>{t('faaliyet.sayac', { n: tamam, toplam: veri.parcalar.length })}</span>
      </div>
      {/* Parça çipleri: eksikler tıklanabilir, kendi satırına götürür. */}
      <div className="fd-cipler">
        {veri.parcalar.map(p => {
          const satirId = `fd-${e.id}-${p.tur}`;
          return (
            <a key={p.tur} className={`fd-cip${p.tamam ? ' fd-cip-tamam' : ''}`} href={`#${satirId}`} onClick={o => {
              o.preventDefault();
              const hedef = document.getElementById(satirId);
              hedef?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
              hedef?.focus();
            }}>{`${p.tamam ? '✓' : '○'} ${t(`faaliyet.parca.${p.tur}`)}`}</a>
          );
        })}
      </div>
      <ul className="fd-liste">
        {veri.parcalar.map(p => <DosyaParcasi key={p.tur} e={e} p={p} yetkili={veri.yetkili} secenekler={veri.secenekler} degisti={degisti} fotoEkle={fotoEkle} />)}
      </ul>
    </section>
  );
}

function DosyaParcasi({ e, p, yetkili, secenekler, degisti, fotoEkle }) {
  const girdi = useRef(null);
  const meta = d => ` · ${boyutYaz(d.boyut)} · ${tamTarih(d.created.slice(0, 10))}${d.yukleyen ? ' · ' + d.yukleyen : ''}`;

  const yukle = async () => {
    const secilen = [...girdi.current.files];
    girdi.current.value = '';
    let n = 0;
    for (const f of secilen) {
      const yanit = await fetch(`api/etkinlikler/${e.id}/dosya?tur=${p.tur}`, {
        method: 'POST', body: f, headers: { 'X-File-Name': encodeURIComponent(f.name) },
      });
      if (yanit.ok) { n++; continue; }
      const g = await yanit.json().catch(() => ({}));
      bildir(`${f.name}: ${hataMetni(g)}`, 'hata');
    }
    if (n) bildir(t('klasor.yuklendi', { n }));
    await degisti();
  };

  const dosyaSil = async d => {
    if (!(await onayla(t('klasor.silOnay', { ad: d.ad }), { evet: t('genel.sil'), tehlike: true }))) return;
    try { await iste(`api/faaliyet-dosya/${d.id}`, { method: 'DELETE' }); bildir(t('genel.silindi')); await degisti(); } catch (err) { bildir(err.message, 'hata'); }
  };

  let govde;
  if (p.tur === 'foto') {
    govde = (
      <>
        <p className="fd-not">{p.sayi ? t('faaliyet.foto.var', { n: p.sayi }) : t('faaliyet.foto.yok')}</p>
        {yetkili && <button type="button" className="metin-bag" onClick={fotoEkle}>{t('faaliyet.foto.ekle')}</button>}
      </>
    );
  } else if (p.tur === 'anket') {
    govde = (
      <>
        {p.form ? <a className="metin-bag" href={`formlar.html#form-${p.form.id}`}>{p.form.baslik}</a> : <p className="fd-not">{t('faaliyet.anket.yok')}</p>}
        {yetkili && (
          <>
            <select className="fd-anket-sec" aria-label={t('faaliyet.anket.sec')} value={p.form ? String(p.form.id) : ''} onChange={async o => {
              try {
                await iste(`api/etkinlikler/${e.id}/anket`, { method: 'PUT', body: JSON.stringify({ formId: o.target.value ? Number(o.target.value) : null }) });
                bildir(t('genel.kaydedildi'));
                await degisti();
              } catch (err) { bildir(err.message, 'hata'); }
            }}>
              <option value="">{t('faaliyet.anket.bagYok')}</option>
              {secenekler.map(f => <option key={f.id} value={f.id}>{f.baslik}</option>)}
            </select>
            {!secenekler.length && <p className="fd-not">{t('faaliyet.anket.secenekYok')}</p>}
          </>
        )}
      </>
    );
  } else {
    govde = (
      <>
        {p.dosyalar.length > 0 && (
          <ul className="fd-dosyalar">
            {p.dosyalar.map(d => (
              <li key={d.id}>
                <a className="metin-bag" href={`api/faaliyet-dosya/${d.id}`} download="">{d.ad}</a>
                <span className="fd-meta">{meta(d)}</span>
                {yetkili && <button type="button" className="fd-sil" aria-label={`${t('genel.sil')}: ${d.ad}`} onClick={() => dosyaSil(d)}>×</button>}
              </li>
            ))}
          </ul>
        )}
        {yetkili && (
          <label className="dugme dugme-ikincil dugme-kucuk fd-yukle">{t('faaliyet.yukle')}
            <input ref={girdi} className="gorsel-gizli" type="file" multiple onChange={yukle} />
          </label>
        )}
      </>
    );
  }

  return (
    <li id={`fd-${e.id}-${p.tur}`} tabIndex={-1} className={`fd-satir${p.tamam ? ' fd-satir-tamam' : ''}`}>
      <div className="fd-satir-ust">
        <strong>{t(`faaliyet.parca.${p.tur}`)}</strong>
        <span className="fd-durum">{t(p.tamam ? 'faaliyet.tamam' : 'faaliyet.eksik')}</span>
      </div>
      {govde}
      {/* Bağ kurulmadan önce toplantı klasörüne yüklenmiş belgeler: parçayı
          tamamlar, klasördeki yerinden indirilir ve orada yönetilir. */}
      {p.klasorde?.length > 0 && (
        <ul className="fd-dosyalar">
          {p.klasorde.map(d => (
            <li key={d.surumId}>
              <a className="metin-bag" href={`api/klasorler/surum/${d.surumId}`} download="">{d.ad}</a>
              <span className="fd-meta">{`${meta(d)} · `}</span>
              <a className="metin-bag" href={`klasorler.html#${d.klasor}`}>{`📁 ${d.klasor}`}</a>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/* --- Ekleme / düzenleme formu ---------------------------------------------- */
function EtkinlikFormu({ acik, mevcut, maxFoto, kapat, yenile }) {
  return (
    <Kutu acik={acik} onKapat={kapat} koru id="form-kutu">
      {acik && <FormIcerik mevcut={mevcut} maxFoto={maxFoto} kapat={kapat} yenile={yenile} />}
    </Kutu>
  );
}

const Secim = ({ name, degerler, etiketle, secili, disabled }) => (
  <select name={name} defaultValue={secili ?? ''} disabled={disabled}>
    {degerler.map(d => <option key={d} value={d}>{etiketle(d)}</option>)}
  </select>
);

/** Seçilen dosyaları sırayla yükler. Paralel gönderim sunucuda adet
 *  sınırını yarışa sokardı. */
async function fotolariYukle(etkinlikId, dosyalar) {
  for (const dosya of dosyalar) {
    await iste(`api/etkinlikler/${etkinlikId}/foto`, {
      method: 'POST',
      headers: { 'Content-Type': dosya.type || 'application/octet-stream', 'x-dosya-adi': encodeURIComponent(dosya.name) },
      body: dosya,
    });
  }
}

function FormIcerik({ mevcut, maxFoto, kapat, yenile }) {
  const k = durum.kullanici;
  /* Kısıtlı düzenlemede yalnızca durum ve bağlantı açık kalır — sunucudaki
     kuralın ekrandaki karşılığı. */
  const kisitli = !!mevcut?.resmi && !k.koordinator;
  const [hata, setHata] = useState('');
  const [bekliyor, setBekliyor] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(false);
  const fotoSec = useRef(null);
  /* Ortak hesabı yalnızca kendi kurumunu lider gösterebilir (sunucu da
     doğrular); koordinatör tüm kurumlar arasından seçer. */
  const liderler = k.koordinator ? durum.ortaklar.map(o => o.id) : [k.partner];

  const gonder = async olay => {
    olay.preventDefault();
    const f = olay.currentTarget;
    setHata('');
    setBekliyor(true);
    const veri = {
      baslik: f.baslik.value, ozet: f.ozet.value, wp: f.wp.value, tur: f.tur.value, yer: f.yer.value, lider: f.lider.value,
      baslangic: f.baslangic.value, bitis: f.bitis.value, durum: f.durum.value, url: f.url.value,
      katilimcilar: [...f.querySelectorAll('#form-katilimcilar input:checked')].map(o => o.value),
    };
    try {
      const kayit = await iste(mevcut ? `api/etkinlikler/${mevcut.id}` : 'api/etkinlikler', {
        method: mevcut ? 'PUT' : 'POST', body: JSON.stringify(veri),
      });
      const dosyalar = [...fotoSec.current.files];
      if (dosyalar.length) {
        setYukleniyor(true);
        await fotolariYukle(kayit.id, dosyalar);
      }
      kapat();
      await yenile();
      bildir(t('genel.kaydedildi'));
    } catch (err) {
      setHata(err.message);
    } finally {
      setBekliyor(false);
      setYukleniyor(false);
    }
  };

  const { start, end } = durum.proje;
  return (
    <form id="etkinlik-form" className="kutu-ic" onSubmit={gonder}>
      <div className="kutu-ust">
        <h2 id="form-baslik">{t(mevcut ? 'form.baslik.duzenle' : 'form.baslik.yeni')}</h2>
        <button type="button" className="kapat" data-kapat aria-label={t('genel.kapat')}>×</button>
      </div>
      {kisitli && <p id="form-kilit" className="uyari">{t('form.resmi.kilit')}</p>}
      <div className="form-izgara">
        <label className="alan form-tam"><span>{t('form.ad')}</span>
          <input name="baslik" maxLength={160} required disabled={kisitli} defaultValue={mevcut ? etkinlikBaslik(mevcut) : ''} /></label>
        <label className="alan"><span>{t('takvim.filtre.ispaketi')}</span>
          <Secim name="wp" degerler={durum.ispaketleri} etiketle={wp => t(`wp.${wp}.ad`)} secili={mevcut?.wp ?? 'WP4'} disabled={kisitli} /></label>
        <label className="alan"><span>{t('takvim.filtre.tur')}</span>
          <Secim name="tur" degerler={durum.turler} etiketle={x => t(`tur.${x}`)} secili={mevcut?.tur ?? 'cogaltici'} disabled={kisitli} /></label>
        <label className="alan"><span>{t('etkinlik.yer')}</span>
          <Secim name="yer" degerler={durum.yerler} etiketle={yerAdi} disabled={kisitli}
            secili={mevcut?.yer ?? durum.ortaklar.find(o => o.id === k.partner)?.country} /></label>
        <label className="alan"><span>{t('etkinlik.lider')}</span>
          <Secim name="lider" degerler={liderler} etiketle={ortakAdi} secili={mevcut?.lider ?? k.partner} disabled={kisitli} /></label>
        <label className="alan"><span>{t('form.baslangic')}</span>
          <input name="baslangic" type="date" required min={start} max={end} disabled={kisitli} defaultValue={mevcut?.baslangic ?? ''} /></label>
        <label className="alan"><span>{t('form.bitis')}</span>
          <input name="bitis" type="date" required min={start} max={end} disabled={kisitli} defaultValue={mevcut?.bitis ?? ''} /></label>
        <label className="alan"><span>{t('etkinlik.durum')}</span>
          <Secim name="durum" degerler={durum.durumlar} etiketle={d => t(`durum.${d}`)} secili={mevcut?.durum ?? 'planlandi'} /></label>
        <label className="alan"><span>{t('form.url')}</span>
          <input name="url" type="url" maxLength={500} placeholder="https://" defaultValue={mevcut?.url ?? ''} /></label>
        <label className="alan form-tam"><span>{t('form.ozet')}</span>
          <textarea name="ozet" maxLength={4000} disabled={kisitli} defaultValue={mevcut ? etkinlikOzet(mevcut) : ''} /></label>
        <fieldset className="alan form-tam">
          <legend className="alan-legend">{t('etkinlik.katilimci')}</legend>
          <div id="form-katilimcilar" className="onay-izgara">
            {durum.ortaklar.map(o => (
              <label key={o.id} className="onay">
                <input type="checkbox" value={o.id} disabled={kisitli} defaultChecked={mevcut ? mevcut.katilimcilar.includes(o.id) : false} />{o.short}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="alan form-tam">
          <legend className="alan-legend">{t('foto.baslik')}</legend>
          {/* Yeni etkinlikte kayıt henüz yok: fotoğraflar kaydedildikten sonra yüklenir. */}
          <Galeri id="form-fotolar" fotolar={mevcut?.fotolar ?? []} silinebilir={!!mevcut} sonra={yenile} />
          <input ref={fotoSec} id="foto-sec" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple />
          <p className="ipucu" id="foto-ipucu">{t('foto.ipucu', { n: maxFoto })}</p>
        </fieldset>
      </div>
      <p className="hata" id="form-hata" role="alert">{hata}</p>
      <div className="kutu-eylem">
        <button type="submit" className="dugme dugme-birincil" disabled={bekliyor}>{t(yukleniyor ? 'foto.yukleniyor' : 'genel.kaydet')}</button>
        <button type="button" className="dugme dugme-ikincil" data-kapat>{t('genel.vazgec')}</button>
      </div>
    </form>
  );
}

/* --- Faaliyet raporu ------------------------------------------------------
   Kutuda yalnızca DÖNEM ve DOSYA BİÇİMİ sorulur; süzgeçler sayfadakilerle
   aynıdır ve kapsam kutuda yazılı durur. Arama yazılıysa eşleşenler
   işaretli liste olarak çıkar: rapora yalnızca işaretli kalanlar girer.
   Belge sunucuda ve İSTEĞİN DİLİNDE üretilir. */
function RaporKutusu({ acik, kapat, filtre, etkinlikler, gorunum, imlec }) {
  return (
    <Kutu acik={acik} onKapat={kapat} id="rapor-kutu">
      {acik && <RaporIcerik kapat={kapat} filtre={filtre} etkinlikler={etkinlikler} gorunum={gorunum} imlec={imlec} />}
    </Kutu>
  );
}

function RaporIcerik({ kapat, filtre, etkinlikler, gorunum, imlec }) {
  const { start, end } = durum.proje;
  /* Dönem seçili aya ya da tüm projeye göre açılır; proje süresiyle sınırlı. */
  const [donem, setDonem] = useState(() => {
    if (gorunum === 'ay' && imlec) {
      const ilk = `${imlec.getUTCFullYear()}-${String(imlec.getUTCMonth() + 1).padStart(2, '0')}-01`;
      const son = new Date(Date.UTC(imlec.getUTCFullYear(), imlec.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
      return { bas: ilk < start ? start : ilk, bit: son > end ? end : son };
    }
    return { bas: start, bit: end };
  });
  const [bicim, setBicim] = useState('docx');
  const [disari, setDisari] = useState(() => new Set());   // eşleşip işareti kaldırılanlar
  const [hata, setHata] = useState('');
  const [hazirlaniyor, setHazirlaniyor] = useState(false);

  const kapsam = [
    filtre.wp ? `${filtre.wp} · ${t(`wp.${filtre.wp}.kisa`)}` : t('rapor.kapsam.wp'),
    filtre.tur ? t(`tur.${filtre.tur}`) : t('rapor.kapsam.tur'),
    filtre.ortak ? ortakKisa(filtre.ortak) : t('rapor.kapsam.ortak'),
    filtre.durum ? t(`durum.${filtre.durum}`) : t('rapor.kapsam.durum'),
    filtre.arama.trim() && t('rapor.kapsam.arama', { q: filtre.arama.trim() }),
  ].filter(Boolean).join('  ·  ');

  /* Arama yazılıysa süzgeçlerden geçen kayıtlar; dönem dışındakiler ayrıca
     döner, "Dönemi genişlet" ile rapora alınabilsinler. */
  let eslesenler = null, disarida = [];
  if (filtre.arama.trim() && donem.bas && donem.bit) {
    const liste = suz(etkinlikler, filtre).sort((a, b) => a.baslangic.localeCompare(b.baslangic));
    const icinde = e => e.baslangic <= donem.bit && e.bitis >= donem.bas;
    eslesenler = liste.filter(icinde);
    disarida = liste.filter(e => !icinde(e));
  }

  /** Bağlantı yerine fetch: oturum düşmüşse tarayıcı hata JSON'unu rapor
   *  dosyası diye kaydetmesin, mesaj kutuda görünsün. */
  const gonder = async olay => {
    olay.preventDefault();
    setHata('');
    if (donem.bit < donem.bas) { setHata(t('rapor.hata.tarih')); return; }
    const parametreler = new URLSearchParams({ bas: donem.bas, bit: donem.bit, bicim });
    if (eslesenler) {
      const idler = eslesenler.filter(e => !disari.has(e.id)).map(e => e.id);
      if (!idler.length) { setHata(t('rapor.hata.secimyok')); return; }
      parametreler.set('ara', filtre.arama.trim());
      parametreler.set('idler', idler.join(','));
    } else {
      for (const [ad, deger] of [['wp', filtre.wp], ['tur', filtre.tur], ['ortak', filtre.ortak], ['durum', filtre.durum]]) {
        if (deger) parametreler.set(ad, deger);
      }
    }
    setHazirlaniyor(true);
    try {
      const yanit = await fetch('api/rapor?' + parametreler);
      if (!yanit.ok) throw new Error(hataMetni(await yanit.json().catch(() => ({}))));
      const ad = /filename="([^"]+)"/.exec(yanit.headers.get('content-disposition') || '')?.[1] || `e-youthpreneur.${bicim}`;
      const bag = Object.assign(document.createElement('a'), { href: URL.createObjectURL(await yanit.blob()), download: ad });
      document.body.append(bag);
      bag.click();
      bag.remove();
      setTimeout(() => URL.revokeObjectURL(bag.href), 30000);
      kapat();
    } catch (err) {
      setHata(err.message);
    } finally {
      setHazirlaniyor(false);
    }
  };

  return (
    <form id="rapor-form" className="kutu-ic" onSubmit={gonder}>
      <div className="kutu-ust">
        <h2>{t('rapor.baslik')}</h2>
        <button type="button" className="kapat" data-kapat aria-label={t('genel.kapat')}>×</button>
      </div>
      <p className="kutu-aciklama">{t('rapor.aciklama')}</p>
      <div className="form-izgara">
        <label className="alan"><span>{t('form.baslangic')}</span>
          <input name="bas" type="date" required min={start} max={end} value={donem.bas} onChange={o => setDonem(d => ({ ...d, bas: o.target.value }))} /></label>
        <label className="alan"><span>{t('form.bitis')}</span>
          <input name="bit" type="date" required min={start} max={end} value={donem.bit} onChange={o => setDonem(d => ({ ...d, bit: o.target.value }))} /></label>
      </div>
      <button type="button" id="rapor-tum-donem" className="metin-bag" onClick={() => setDonem({ bas: start, bit: end })}>{t('rapor.donem.tum')}</button>
      {/* Takvimdeki süzgeçler rapora da uygulanır; hangileri olduğu burada yazar. */}
      <p className="ipucu" id="rapor-kapsam">{kapsam}</p>
      {eslesenler && (
        <fieldset className="alan form-tam" id="rapor-eslesen-alan">
          <legend className="alan-legend"><span>{t('rapor.eslesen')}</span>{' '}
            <small>{t('rapor.eslesen.sayi', { n: eslesenler.filter(e => !disari.has(e.id)).length, toplam: eslesenler.length })}</small></legend>
          <div id="rapor-eslesen" className="onay-izgara">
            {!eslesenler.length && <p className="bos-durum">{t('rapor.eslesen.yok')}</p>}
            {eslesenler.map(e => (
              <label key={e.id} className="onay">
                <input type="checkbox" checked={!disari.has(e.id)} onChange={o => setDisari(s => {
                  const yeni = new Set(s);
                  if (o.target.checked) yeni.delete(e.id); else yeni.add(e.id);
                  return yeni;
                })} />
                <span><strong>{etkinlikBaslik(e)}</strong><small>{` ${tarihAraligi(e.baslangic, e.bitis)} · ${ortakKisa(e.lider)} · ${t(`durum.${e.durum}`)}`}</small></span>
              </label>
            ))}
            {/* Dönem dışındakiler aynı kutuda, seçilemez hâlde durur. */}
            {disarida.length > 0 && (
              <div className="rapor-disinda">
                <p>{t('rapor.disinda', { n: disarida.length })}</p>
                {disarida.map(e => <div key={e.id}>{`${etkinlikBaslik(e)} · ${tarihAraligi(e.baslangic, e.bitis)}`}</div>)}
                <button type="button" className="dugme dugme-ikincil" onClick={() => setDonem(d => ({
                  bas: [d.bas, ...disarida.map(e => e.baslangic)].sort()[0],
                  bit: [d.bit, ...disarida.map(e => e.bitis)].sort().at(-1),
                }))}>{t('rapor.genislet')}</button>
              </div>
            )}
          </div>
        </fieldset>
      )}
      <fieldset className="alan form-tam rapor-bicim">
        <legend className="alan-legend">{t('rapor.bicim')}</legend>
        <div className="onay-izgara">
          {['docx', 'xlsx', 'zip'].map(b => (
            <label key={b} className="onay"><input type="radio" name="bicim" value={b} checked={bicim === b} onChange={() => setBicim(b)} /> <span>{t(`rapor.bicim.${b}`)}</span></label>
          ))}
        </div>
      </fieldset>
      <p className="hata" id="rapor-hata" role="alert">{hata}</p>
      <div className="kutu-eylem">
        <button type="submit" className="dugme dugme-birincil" disabled={hazirlaniyor}>{t(hazirlaniyor ? 'rapor.hazirlaniyor' : 'rapor.indir')}</button>
        <button type="button" className="dugme dugme-ikincil" data-kapat>{t('genel.vazgec')}</button>
      </div>
    </form>
  );
}
