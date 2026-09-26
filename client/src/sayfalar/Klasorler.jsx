import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { durum, t, iste, hataMetni, ortakKisa, yerAdi, tarihAraligi, tamTarih } from '../ortak.js';
import { useBaslik } from '../bilesenler/Kabuk.jsx';
import Kutu, { onayla, bildir } from '../bilesenler/Kutu.jsx';

/**
 * Proje klasörleri — "Proje Yönetim Panosu · Klasör Yapısı" belgesinin
 * platformdaki karşılığı. Ağaç ve yetkiler sunucudan gelir (lib/klasor.mjs);
 * bu sayfa çizer, yükler ve seçimi adres çubuğunda tutar (`#04.2`) ki bir
 * klasörün bağlantısı paylaşılabilsin.
 *
 * Sayılar ALT KLASÖRLERİ DE KAPSAR. "Yalnızca boş klasörler" süzgeci ara
 * rapor öncesi eksik belgeyi bulmak içindir.
 */

/* Izgara görünümü (Drive gibi): ağaç gizlenir, klasörler simgeli kutular
   olarak açılır, üstte yol çubuğu durur. Tercih kişinin tarayıcısında kalır. */
const IZGARA_ANAHTAR = 'eyp.klasor.izgara';
const izgaraOku = () => { try { return localStorage.getItem(IZGARA_ANAHTAR) === '1'; } catch { return false; } };
const KILIT_SIMGE = <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V7a3 3 0 0 0-6 0z" /></svg>;
const KLASOR_SIMGE = <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2h8.4A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" /></svg>;

/* --- Ad ve sayılar ------------------------------------------------------ */
const numara = k => (/^[\d.]+$/.test(k.id) ? k.id : '');
function ad(k) {
  if (k.anahtar) return t(k.anahtar);
  if (k.etiket === 'kurum') return ortakKisa(k.kurum);
  return k.id.split('.').pop();
}
const tamAd = k => [numara(k), ad(k)].filter(Boolean).join(' ');
/** Faaliyete bağlı fotoğraf ve anket klasörlerinde dosya yerine sayılanlar. */
const bagliSayi = k => (k.bagli ? (k.bagli.sayi || 0) + (k.bagli.form ? 1 : 0) : 0);
const boyut = b => {
  const birim = b >= 1048576 ? ['megabyte', b / 1048576] : b >= 1024 ? ['kilobyte', b / 1024] : ['byte', b];
  return new Intl.NumberFormat(durum.dil, { style: 'unit', unit: birim[0], maximumFractionDigits: 1 }).format(birim[1]);
};
const gun = iso => tamTarih(iso.slice(0, 10));
const eur = n => new Intl.NumberFormat(durum.dil, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
const uzanti = ad_ => (ad_.includes('.') ? ad_.split('.').pop().toUpperCase().slice(0, 4) : '?');

function sahipMetni(k) {
  /* Bağlı klasörde yükleme faaliyetin lider kurumundadır. */
  if (k.bagli) return `${ortakKisa(k.bagli.lider)} ${t('klasor.sahip.koordinator')}`;
  if (k.sahip.includes('*')) return t('klasor.sahip.herkes');
  return `${k.sahip.map(ortakKisa).join(', ')} ${t('klasor.sahip.koordinator')}`;
}

/** Kurumun sorumlu olduğu klasörler: sahip listesinde kurum var ya da
 *  klasör kurumun kendi klasörü. "Herkes yükler" klasörleri sayılmaz. */
const kurumumunMu = k => !k.sahip.includes('*') && (k.sahip.includes(durum.kullanici.partner) || k.kurum === durum.kullanici.partner);

/** Veriden türetilen yardımcılar tek yerde: ağaç ilişkileri ve sayılar. */
function yardimcilar(veri) {
  const dizin = new Map(veri.klasorler.map(k => [k.id, k]));
  const cocuklar = id => veri.klasorler.filter(k => k.ust === id);
  const altAgac = id => veri.klasorler.filter(k => k.id === id || k.id.startsWith(id + '.'));
  /** Klasörde (alt klasörler dahil) duran ve kısayolla görünen dosyalar. */
  const sayi = id => {
    const altlar = altAgac(id);
    const kimlikler = new Set(altlar.map(k => k.id));
    return veri.dosyalar.filter(d => kimlikler.has(d.klasor) || d.kisayollar.some(x => kimlikler.has(x))).length
      + altlar.reduce((n, k) => n + bagliSayi(k), 0);
  };
  return { dizin, cocuklar, altAgac, sayi };
}

export default function Klasorler() {
  useBaslik('klasor.sayfa.baslik');
  const [veri, setVeri] = useState(null);
  const [secili, setSecili] = useState('');
  /* İçerik panosu ya seçili klasörü ya da üstteki araçlardan birinin
     listesini gösterir: 'ara' | 'son' | 'kurum' | null (klasör). */
  const [gorunum, setGorunum] = useState(null);
  const [acik, setAcik] = useState(() => new Set());
  const [izgara, setIzgara] = useState(izgaraOku);
  const [arama, setArama] = useState('');
  const [yalnizBos, setYalnizBos] = useState(false);
  const [yukleAcik, setYukleAcik] = useState(false);
  const [durumSatiri, setDurumSatiri] = useState('');
  const [hata, setHata] = useState('');
  const duzenRef = useRef(null);
  const icerikRef = useRef(null);
  const dosyaGirdi = useRef(null);
  const odakBekliyor = useRef(false);
  const izgaraRef = useRef(izgara);
  izgaraRef.current = izgara;

  const yenile = useCallback(async () => setVeri(await iste('api/klasorler')), []);
  const y = useMemo(() => (veri ? yardimcilar(veri) : null), [veri]);

  /** Klasör seç. Izgarada klasöre giriş geçmişe yazılır: tarayıcının Geri
   *  tuşu Drive'daki gibi bir önceki klasöre döner. */
  const sec = useCallback((id, { kaydir = true, gecmis = false, dizin = y?.dizin } = {}) => {
    if (!dizin?.has(id)) id = '';
    setSecili(id);
    setGorunum(null);
    setHata(''); setDurumSatiri('');
    /* Seçilen klasörün yolu açılır ki ağaçta nerede olduğu görünsün. */
    setAcik(a => { const yeni = new Set(a); for (let k = dizin?.get(id); k; k = dizin.get(k.ust)) yeni.add(k.id); return yeni; });
    const yaz = (gecmis ? history.pushState : history.replaceState).bind(history);
    if (id && decodeURIComponent(location.hash.slice(1)) !== id) yaz(null, '', '#' + id);
    /* Izgarada kök (tüm klasörler) de bir yerdir; adresi yalın sayfadır. */
    if (!id && location.hash) yaz(null, '', location.pathname + location.search);
    requestAnimationFrame(() => {
      if (kaydir && id && matchMedia('(max-width: 900px)').matches) icerikRef.current?.scrollIntoView({ block: 'start' });
      /* Izgarada aşağıdayken klasöre girilince yeni içerik görüş dışında kalmasın. */
      else if (izgaraRef.current && duzenRef.current?.getBoundingClientRect().top < 0) duzenRef.current.scrollIntoView({ block: 'start', behavior: 'instant' });
      if (odakBekliyor.current) { odakBekliyor.current = false; odakIcerige(); }
    });
  }, [y]);

  /* Klavyeyle açıldıysa odak yeni klasörün ilk kutusuna geçer. */
  const odakIcerige = () => {
    const ilk = icerikRef.current?.querySelector('.klasor-kart, h2');
    if (!ilk) return;
    if (ilk.tagName === 'H2') ilk.tabIndex = -1;
    ilk.focus({ preventScroll: true });
  };

  /* Açılış */
  useEffect(() => {
    if (!durum.kullanici) return;
    iste('api/klasorler').then(v => {
      setVeri(v);
      const dizin = new Map(v.klasorler.map(k => [k.id, k]));
      const ilk = decodeURIComponent(location.hash.slice(1));
      sec(dizin.has(ilk) ? ilk : izgaraRef.current ? '' : '01', { kaydir: false, dizin });
    }).catch(err => setHata(err.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Adres değişince (Geri tuşu, paylaşılan bağlantı) klasör de değişir. */
  useEffect(() => {
    if (!y) return;
    const degisti = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      setSecili(s => {
        if (id !== s && (y.dizin.has(id) || (izgaraRef.current && !id))) { setTimeout(() => sec(id, { kaydir: false })); }
        return s;
      });
    };
    addEventListener('hashchange', degisti);
    addEventListener('popstate', degisti);
    return () => { removeEventListener('hashchange', degisti); removeEventListener('popstate', degisti); };
  }, [y, sec]);

  /* Izgarada Backspace bir üst klasöre çıkar (yazı alanındayken değil). */
  useEffect(() => {
    const tus = o => {
      if (!izgara || o.key !== 'Backspace' || !secili || gorunum || !y) return;
      if (o.target.closest('input, textarea, select, [contenteditable], dialog')) return;
      o.preventDefault();
      odakBekliyor.current = true;
      sec(y.dizin.get(secili).ust || '', { kaydir: false, gecmis: true });
    };
    addEventListener('keydown', tus);
    return () => removeEventListener('keydown', tus);
  }, [izgara, secili, gorunum, y, sec]);

  const yukle = async (dosyalar, hedef, { surumDosyasi = null, aciklama = '' } = {}) => {
    const mb = Math.round(veri.sinir.bayt / 1048576);
    let n = 0;
    setHata('');
    for (const f of dosyalar) {
      if (f.size > veri.sinir.bayt) { setHata(t('klasor.hata.buyuk', { ad: f.name, mb })); continue; }
      setDurumSatiri(t('klasor.yukleniyor', { ad: f.name }));
      const bagli = y.dizin.get(hedef)?.bagli;
      const yol = surumDosyasi ? `api/klasorler/dosya/${surumDosyasi}/surum`
        : bagli ? `api/etkinlikler/${bagli.etkinlikId}/dosya?tur=${bagli.parca}`
          : `api/klasorler/dosya?klasor=${encodeURIComponent(hedef)}`;
      const yanit = await fetch(yol, {
        method: 'POST', body: f,
        headers: { 'X-File-Name': encodeURIComponent(f.name), 'X-Aciklama': encodeURIComponent(aciklama) },
      });
      if (!yanit.ok) { setHata(hataMetni(await yanit.json().catch(() => ({})))); continue; }
      n++;
    }
    setDurumSatiri('');
    await yenile();
    if (n) bildir(t('klasor.yuklendi', { n }));
  };

  if (!durum.kullanici) {
    return (
      <main id="icerik">
        <section className="kapsayici sayfa-bas">
          <span className="ustbaslik">{t('klasor.ustbaslik')}</span>
          <h1>{t('klasor.sayfa.baslik')}</h1>
          <Hakkinda />
        </section>
        <div className="kapsayici">
          <section className="pano bos-durum" id="giris-uyarisi">
            <p>{t('klasor.girisGerekli')}</p>
            <a className="dugme dugme-birincil" href="giris.html">{t('menu.giris')}</a>
          </section>
        </div>
      </main>
    );
  }

  const ortak = { veri, y, izgara, yalnizBos, sec, odakBekliyor, yenile, yukle, setHata };
  const ozet = veri && t('klasor.ozet', {
    dolu: veri.klasorler.filter(k => bagliSayi(k) || veri.dosyalar.some(d => d.klasor === k.id || d.kisayollar.includes(k.id))).length,
    toplam: veri.klasorler.length, dosya: veri.dosyalar.length,
  });

  return (
    <main id="icerik">
      <section className="kapsayici sayfa-bas">
        <span className="ustbaslik">{t('klasor.ustbaslik')}</span>
        <h1>{t('klasor.sayfa.baslik')}</h1>

        {/* İşe odaklı başlangıç: en sık yapılan dört iş en üstte. */}
        {veri && (
          <div className="klasor-arac" id="klasor-arac">
            {/* Arama hem ağacı süzer hem bulunan dosyaları içerikte listeler;
                kutu boşalınca seçili klasöre dönülür. */}
            <input type="search" id="klasor-ara" className="klasor-ara klasor-arac-ara" placeholder={t('klasor.dosyaAra')} aria-label={t('klasor.dosyaAra')}
              value={arama} onChange={o => { setArama(o.target.value); setGorunum(o.target.value.trim() ? 'ara' : null); }} />
            <label className="klasor-bos-sec"><input type="checkbox" id="klasor-bos" checked={yalnizBos} onChange={o => setYalnizBos(o.target.checked)} /> <span>{t('klasor.bosGoster')}</span></label>
            <div className="klasor-arac-dugmeler">
              <button type="button" className="dugme dugme-ikincil" id="izgara-dugme" aria-pressed={izgara} onClick={() => {
                const yeni = !izgara;
                setIzgara(yeni);
                try { localStorage.setItem(IZGARA_ANAHTAR, yeni ? '1' : '0'); } catch { /* saklama kapalı */ }
                /* Ağaçta kök gösterilmez: seçim yoksa ilk klasöre geçilir. */
                if (!yeni && !secili) sec('01', { kaydir: false });
              }}>{t('klasor.izgara')}</button>
              <button type="button" className="dugme dugme-ikincil" id="kurumum-dugme" aria-pressed={gorunum === 'kurum'} onClick={() => setGorunum(g => (g === 'kurum' ? null : 'kurum'))}>{t('klasor.kurumum')}</button>
              <button type="button" className="dugme dugme-ikincil" id="son-dugme" aria-pressed={gorunum === 'son'} onClick={() => setGorunum(g => (g === 'son' ? null : 'son'))}>{t('klasor.son')}</button>
              <button type="button" className="dugme dugme-birincil" id="yukle-dugme" onClick={() => {
                /* Yüklenebilen bir klasörün içindeyken "nereye?" sorusu gereksiz:
                   dosya seçici doğrudan açılır (Drive'daki gibi). */
                if (!gorunum && y.dizin.get(secili)?.yukleyebilir && dosyaGirdi.current) { dosyaGirdi.current.click(); return; }
                setYukleAcik(true);
              }}>{t('klasor.dosyaYukle')}</button>
            </div>
          </div>
        )}
        <Hakkinda />
      </section>

      <div className="kapsayici">
        {!veri && hata && <p className="hata" role="alert">{hata}</p>}
        {veri && (
          <div className="klasor-duzen" id="klasor-duzen" ref={duzenRef} data-izgara={String(izgara)}>
            <aside className="pano klasor-yan" aria-labelledby="klasor-agac-baslik">
              <div className="klasor-yan-bas">
                <h2 id="klasor-agac-baslik">{t('klasor.anaBasliklar')}</h2>
                <p className="ipucu">{t('klasor.anaBasliklar.not')}</p>
                <p className="ipucu" id="klasor-ozet">{ozet}</p>
              </div>
              <nav id="klasor-agac" className="klasor-agac" aria-labelledby="klasor-agac-baslik">
                <Agac {...ortak} ust={null} secili={secili} acik={acik} setAcik={setAcik} arama={arama.trim().toLocaleLowerCase(durum.dil)} />
              </nav>
            </aside>
            <section className="pano klasor-icerik" id="klasor-icerik" ref={icerikRef} aria-live="polite">
              {gorunum
                ? <AracGorunumu {...ortak} gorunum={gorunum} arama={arama} />
                : <KlasorIcerigi {...ortak} secili={secili} ozet={ozet} dosyaGirdi={dosyaGirdi}
                  yukleKutusu={() => setYukleAcik(true)} durumSatiri={durumSatiri} hata={hata} />}
            </section>
          </div>
        )}

        {/* Belgenin 6. bölümü: alt başlıkların dayanağı ve 6.1 takvim tablosu;
            ardından 03.1'deki bütçe dağılımı. */}
        {veri && (
          <>
            <section className="pano klasor-ek" id="klasor-takvim-bolum">
              <div className="pano-bas"><h2>{t('klasor.altBasliklar')}</h2></div>
              <div className="klasor-bolum">
                <p className="klasor-ek-not">{t('klasor.altBasliklar.not')}</p>
                <h3 className="klasor-ek-bas">{t('klasor.takvim')}</h3>
                <p className="ipucu">{t('klasor.takvim.not')}</p>
                <div className="klasor-tablo-sar" id="klasor-takvim">
                  <TakvimTablosu veri={veri} y={y} git={id => { sec(id, { kaydir: false }); duzenRef.current?.scrollIntoView({ block: 'start' }); }} />
                </div>
              </div>
            </section>
            <section className="pano klasor-ek" id="klasor-butce-bolum">
              <div className="pano-bas"><h2>{t('klasor.butce')}</h2></div>
              <div className="klasor-bolum" id="klasor-butce"><ButceTablosu veri={veri} /></div>
            </section>
          </>
        )}
      </div>

      {veri && (
        <Kutu acik={yukleAcik} onKapat={() => setYukleAcik(false)} koru id="yukle-kutu">
          {yukleAcik && <YukleFormu veri={veri} secili={secili} y={y} kapat={() => setYukleAcik(false)}
            gonder={(hedef, dosyalar, aciklama) => {
              setYukleAcik(false);
              /* Klasöre geçilir ki yükleme durumu ve olası hata orada görünsün. */
              sec(hedef, { kaydir: false });
              yukle(dosyalar, hedef, { aciklama });
            }} />}
        </Kutu>
      )}
    </main>
  );
}

/* Klasör yapısı belgesinin 1. bölümü; açıklama işin önüne geçmesin diye kapalı başlar. */
const Hakkinda = () => (
  <details className="klasor-hakkinda">
    <summary>{t('klasor.hakkinda')}</summary>
    <p>{t('klasor.giris')}</p>
    <h2 className="klasor-bolum-baslik">{t('klasor.mantik')}</h2>
    <ul className="klasor-ilkeler">
      {['numara', 'tek', 'sorumluluk'].map(x => <li key={x}><strong>{t(`klasor.ilke.${x}.baslik`)}</strong><span>{t(`klasor.ilke.${x}`)}</span></li>)}
    </ul>
  </details>
);

/* --- Ağaç --------------------------------------------------------------- */
function Agac({ veri, y, ust, secili, acik, setAcik, arama, yalnizBos, sec }) {
  const eslesir = k => !arama || tamAd(k).toLocaleLowerCase(durum.dil).includes(arama)
    || veri.dosyalar.some(d => d.klasor === k.id && d.ad.toLocaleLowerCase(durum.dil).includes(arama));
  /* Bir düğüm, kendisi ya da altındakilerden biri süzgece uyuyorsa görünür. */
  const gorunur = k => y.altAgac(k.id).some(a => eslesir(a) && (!yalnizBos || y.sayi(a.id) === 0));
  const suzgecli = !!arama || yalnizBos;
  return (
    <ul className="klasor-liste">
      {y.cocuklar(ust).filter(gorunur).map(k => {
        const altlari = y.cocuklar(k.id).length > 0;
        const genis = altlari && (suzgecli || acik.has(k.id));
        const n = y.sayi(k.id);
        return (
          <li key={k.id}>
            <div className="klasor-satir">
              <button type="button" className="klasor-ac" hidden={!altlari} aria-expanded={genis} aria-label={tamAd(k)}
                onClick={() => setAcik(a => { const yeni = new Set(a); if (yeni.has(k.id)) yeni.delete(k.id); else yeni.add(k.id); return yeni; })}>{genis ? '▾' : '▸'}</button>
              <button type="button" className="klasor-sec" aria-current={k.id === secili ? 'true' : undefined} data-bos={String(n === 0)} onClick={() => sec(k.id)}>
                {numara(k) && <span className="klasor-no">{numara(k)}</span>}
                <span className="klasor-ad">{ad(k)}</span>
                <span className="klasor-adet">{n ? String(n) : '·'}</span>
              </button>
            </div>
            {genis && <Agac veri={veri} y={y} ust={k.id} secili={secili} acik={acik} setAcik={setAcik} arama={arama} yalnizBos={yalnizBos} sec={sec} />}
          </li>
        );
      })}
    </ul>
  );
}

/* --- Klasör kutuları ------------------------------------------------------
   Ağaç görünümünde satır listesi, ızgarada simgeli kutular. */
function Kartlar({ klasorler, veri, y, izgara, yalnizBos, sec, odakBekliyor, yukle }) {
  /* "Yalnızca boş klasörler": kendisi ya da altındakilerden biri boş olan kutu kalır. */
  const liste = klasorler.filter(a => !yalnizBos || y.altAgac(a.id).some(x => y.sayi(x.id) === 0));
  if (yalnizBos && klasorler.length && !liste.length) return <p className="klasor-bos-not">{t('klasor.bosYok')}</p>;

  /* Ok tuşlarıyla kutular arasında gezinme; sütun sayısı ızgaranın o anki düzeninden. */
  const okla = o => {
    const kutular = [...o.currentTarget.querySelectorAll('.klasor-kart')];
    const i = kutular.indexOf(document.activeElement);
    if (i < 0) return;
    const sutun = getComputedStyle(o.currentTarget).gridTemplateColumns.split(' ').length;
    const adim = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: sutun, ArrowUp: -sutun, Home: -i, End: kutular.length - 1 - i }[o.key];
    if (adim == null) return;
    const hedef = kutular[i + adim];
    if (!hedef) return;
    o.preventDefault();
    hedef.focus();
  };

  return (
    <div className={`klasor-kartlar${izgara ? ' klasor-izgara' : ''}`} onKeyDown={izgara ? okla : undefined}>
      {liste.map(a => <KlasorKarti key={a.id} a={a} veri={veri} y={y} izgara={izgara} sec={sec} odakBekliyor={odakBekliyor} yukle={yukle} />)}
    </div>
  );
}

function KlasorKarti({ a, veri, y, izgara, sec, odakBekliyor, yukle }) {
  const [uzerinde, setUzerinde] = useState(false);
  const n = y.sayi(a.id);
  let adet = t('klasor.dosyaSayisi', { n });
  let alt = null, benim = false, kilit = false;
  if (izgara) {
    /* Izgara kutusunun alt satırları: dosya ve alt klasör sayısı, son değişiklik. */
    const altlar = y.cocuklar(a.id).length;
    adet = [n ? t('klasor.dosyaSayisi', { n }) : t('klasor.izgara.bos'), altlar ? t('klasor.izgara.alt', { n: altlar }) : ''].filter(Boolean).join(' · ');
    const kimlikler = new Set(y.altAgac(a.id).map(k => k.id));
    const son = veri.dosyalar.filter(d => kimlikler.has(d.klasor)).map(d => d.updated).sort().pop();
    if (son) alt = t('klasor.izgara.son', { tarih: gun(son) });
    benim = kurumumunMu(a);
    /* Kilit: ne kendisine ne altındakilere yüklenebiliyor — içine girmeden bilinsin. */
    kilit = !benim && !y.altAgac(a.id).some(x => x.yukleyebilir);
  }
  const birakilir = izgara && a.yukleyebilir;
  return (
    <button type="button" className="klasor-kart" data-bos={String(n === 0)} data-uzerinde={uzerinde ? 'true' : undefined}
      title={kilit ? `${tamAd(a)} — ${t('klasor.izgara.kilit')}` : tamAd(a)}
      onClick={o => { if (!o.detail) odakBekliyor.current = true; sec(a.id, { kaydir: false, gecmis: izgara }); }}
      onDragOver={birakilir ? o => { if (!o.dataTransfer.types.includes('Files')) return; o.preventDefault(); setUzerinde(true); } : undefined}
      onDragLeave={birakilir ? o => { if (!o.currentTarget.contains(o.relatedTarget)) setUzerinde(false); } : undefined}
      onDrop={birakilir ? o => {
        /* Bırakınca önce klasörün içine girilir: yükleme durumu orada görünsün. */
        o.preventDefault();
        setUzerinde(false);
        const dosyalar = [...o.dataTransfer.files];
        if (!dosyalar.length) return;
        sec(a.id, { kaydir: false, gecmis: true });
        yukle(dosyalar, a.id);
      } : undefined}>
      {izgara && <span className="klasor-simge">{KLASOR_SIMGE}</span>}
      {numara(a) && <span className="klasor-no">{numara(a)}</span>}
      <span className="klasor-kart-ad">{ad(a)}</span>
      <span className="klasor-kart-adet">{uzerinde ? t('klasor.izgara.birak') : adet}</span>
      {alt && <span className="klasor-kart-alt">{alt}</span>}
      {benim && <span className="klasor-kart-benim">{t('klasor.izgara.benim')}</span>}
      {kilit && <span className="klasor-kart-kilit" title={t('klasor.izgara.kilit')}>{KILIT_SIMGE}</span>}
    </button>
  );
}

/* --- Üst araçlar: arama, kurumumun klasörleri, son eklenenler ------------------ */
function AracGorunumu(p) {
  const { veri, gorunum, arama } = p;
  const aranan = arama.trim().toLocaleLowerCase(durum.dil);
  if (gorunum === 'ara') {
    const bulunan = veri.dosyalar
      .filter(d => d.ad.toLocaleLowerCase(durum.dil).includes(aranan) || (d.aciklama || '').toLocaleLowerCase(durum.dil).includes(aranan))
      .sort((a, b) => b.updated.localeCompare(a.updated));
    return (
      <>
        <div className="klasor-bas"><h2>{t('klasor.araSonuc', { n: bulunan.length, arama: arama.trim() })}</h2></div>
        {bulunan.length ? <DosyaListesi {...p} dosyalar={bulunan.slice(0, 50)} /> : <p className="klasor-bos-not">{t('klasor.araYok')}</p>}
      </>
    );
  }
  if (gorunum === 'son') {
    const son = [...veri.dosyalar].sort((a, b) => b.surum.created.localeCompare(a.surum.created)).slice(0, 20);
    return (
      <>
        <div className="klasor-bas"><h2>{t('klasor.son')}</h2><p className="klasor-meta">{t('klasor.son.not')}</p></div>
        {son.length ? <DosyaListesi {...p} dosyalar={son} /> : <p className="klasor-bos-not">{t('klasor.son.yok')}</p>}
      </>
    );
  }
  /* Kurumumun klasörleri: en üst düzeyde kalanlar (alt klasörü de kurumunsa tekrar listelenmez). */
  const benim = veri.klasorler.filter(kurumumunMu);
  const kokler = benim.filter(k => !benim.some(u => u.id === k.ust));
  return (
    <>
      <div className="klasor-bas">
        <h2>{t('klasor.kurumum.baslik', { kurum: ortakKisa(durum.kullanici.partner) })}</h2>
        <p className="klasor-meta">{t('klasor.kurumum.not', { n: benim.length })}</p>
      </div>
      {kokler.length ? <Kartlar {...p} klasorler={kokler} /> : <p className="klasor-bos-not">{t('klasor.kurumum.yok')}</p>}
    </>
  );
}

/** Dosya listesi: her satırın üstünde durduğu klasöre giden bağlantı. */
function DosyaListesi(p) {
  return (
    <ul className="klasor-dosyalar">
      {p.dosyalar.map(d => {
        const k = p.y.dizin.get(d.klasor);
        return (
          <DosyaSatiri key={`${d.kaynak || 'k'}${d.id}`} {...p} d={d} k={k}
            yer={<button type="button" className="metin-bag klasor-dosya-yer" onClick={() => p.sec(k.id, { kaydir: false })}>{`📁 ${tamAd(k)}`}</button>} />
        );
      })}
    </ul>
  );
}

/* --- Seçili klasörün içeriği -------------------------------------------------- */
function KlasorIcerigi(p) {
  const { veri, y, izgara, secili, sec, ozet } = p;
  const k = y.dizin.get(secili);
  if (!k && izgara) {
    /* Izgaranın kökü: yirmi ana klasör. Yol satırı kökte de durur. */
    return (
      <>
        <div className="klasor-bas">
          <nav className="klasor-yol" aria-label={t('klasor.agac')}><span className="klasor-yol-simdi" aria-current="page">{t('klasor.tum')}</span></nav>
          <h2>{t('klasor.tum')}</h2>
          <p className="klasor-meta">{ozet}</p>
        </div>
        <section className="klasor-bolum"><Kartlar {...p} klasorler={y.cocuklar(null)} /></section>
      </>
    );
  }
  if (!k) return <p className="bos-durum">{t('klasor.sec')}</p>;

  const zincir = [];
  for (let x = y.dizin.get(k.ust); x; x = y.dizin.get(x.ust)) zincir.unshift(x);
  const altlar = y.cocuklar(k.id);
  /* Dosyalar: burada duranlar önce, kısayolla görünenler sonra. */
  const burada = veri.dosyalar.filter(d => d.klasor === k.id);
  const kisayollar = veri.dosyalar.filter(d => d.klasor !== k.id && d.kisayollar.includes(k.id));
  const dosyaYok = !burada.length && !kisayollar.length;

  return (
    <>
      {/* Başlık: yol, ad, etkinlik bilgisi ve yükleme yetkisi. */}
      <div className="klasor-bas">
        {(zincir.length > 0 || izgara) && (
          <nav className="klasor-yol" aria-label={t('klasor.agac')}>
            {izgara && <><button type="button" className="metin-bag" onClick={() => sec('', { kaydir: false, gecmis: true })}>{t('klasor.tum')}</button><span className="klasor-yol-ayrac">/</span></>}
            {zincir.map(x => (
              <span key={x.id} style={{ display: 'contents' }}>
                <button type="button" className="metin-bag" onClick={() => sec(x.id, { kaydir: false, gecmis: izgara })}>{tamAd(x)}</button>
                <span className="klasor-yol-ayrac">/</span>
              </span>
            ))}
          </nav>
        )}
        <h2>{numara(k) && <><span className="klasor-no">{numara(k)}</span> </>}{ad(k)}</h2>
        <p className="klasor-meta">
          {k.wp && <span className="etiket etiket-wp" data-wp={k.wp}>{k.wp}</span>}
          <span className="klasor-sahip">{`${t('klasor.sahip')}: ${sahipMetni(k)}`}</span>
        </p>
      </div>

      {/* Bütçe klasöründe (03, 03.1) dağılım tablosu da görünür. */}
      {(k.id === '03' || k.id === '03.1') && (
        <section className="klasor-bolum"><h3 className="klasor-bolum-bas">{t('klasor.butce')}</h3><ButceTablosu veri={veri} /></section>
      )}

      {/* Faaliyet dosyasına bağlı klasör: içeriğin nereden geldiği söylenir. */}
      {k.bagli && (
        <section className="klasor-bolum klasor-bagli">
          <p className="ipucu">{t('klasor.bagli.not', { parca: t(`faaliyet.parca.${k.bagli.parca}`) })}</p>
          {k.bagli.parca === 'foto' && <p>{k.bagli.sayi ? t('faaliyet.foto.var', { n: k.bagli.sayi }) : t('faaliyet.foto.yok')}</p>}
          {k.bagli.parca === 'anket' && (k.bagli.form
            ? <a className="metin-bag" href={`formlar.html#form-${k.bagli.form.id}`}>{k.bagli.form.baslik}</a>
            : <p>{t('faaliyet.anket.yok')}</p>)}
          <p><a className="metin-bag" href={`takvim.html#etkinlik-${k.bagli.etkinlikId}`}>{t('klasor.bagli.ac')}</a></p>
        </section>
      )}

      {altlar.length > 0 && (
        <section className="klasor-bolum">
          <h3 className="klasor-bolum-bas">{t('klasor.altKlasorler')}</h3>
          <Kartlar {...p} klasorler={altlar} />
        </section>
      )}

      {/* Fotoğraf ve anket klasörünün "dosyası" yukarıdaki bölümde. */}
      <section className="klasor-bolum" hidden={dosyaYok && bagliSayi(k) > 0}>
        <h3 className="klasor-bolum-bas">{t('klasor.dosyalar')}</h3>
        {dosyaYok
          ? <p className="klasor-bos-not">{t('klasor.bos')}</p>
          : <ul className="klasor-dosyalar">{[...burada, ...kisayollar].map(d => <DosyaSatiri key={`${d.kaynak || 'k'}${d.id}`} {...p} d={d} k={k} />)}</ul>}
      </section>

      <YuklemeSeridi {...p} k={k} />
    </>
  );
}

/* Yükleme alanı. Yetkisi olmayana neden olmadığı söylenir; alanı tamamen
   gizlemek "bu klasöre nasıl belge konur" sorusunu cevapsız bırakırdı. */
function YuklemeSeridi({ veri, y, k, yukle, dosyaGirdi, izgara, sec, odakBekliyor, yukleKutusu, durumSatiri, hata }) {
  const [uzerinde, setUzerinde] = useState(false);
  const aciklama = useRef(null);
  const mb = Math.round(veri.sinir.bayt / 1048576);

  if (!k.yukleyebilir) {
    /* Yetkisiz klasörde çıkmaz sokak olmasın: aynı ana klasörde yüklenebilen
       klasörler, yoksa kurumun kendi klasörleri önerilir. */
    const kok = k.id.split('.')[0];
    const yakin = veri.klasorler.filter(x => x.yukleyebilir && (x.id === kok || x.id.startsWith(kok + '.')));
    const liste = (yakin.length ? yakin : veri.klasorler.filter(x => x.yukleyebilir && kurumumunMu(x))).slice(0, 6);
    return (
      <section className="klasor-yukle">
        <p className="ipucu">{t(k.bagli && ['foto', 'anket'].includes(k.bagli.parca) ? 'klasor.bagli.takvimden'
          : k.bagli ? 'klasor.bagli.yetkiYok' : 'klasor.yukle.yetkiYok')}</p>
        <div className="klasor-oneri">
          {liste.length > 0 && (
            <>
              <p className="klasor-oneri-bas">{t(yakin.length ? 'klasor.yukle.yakin' : 'klasor.yukle.kurumun')}</p>
              <ul className="klasor-oneri-liste">
                {liste.map(x => (
                  <li key={x.id}><button type="button" className="metin-bag" onClick={() => { odakBekliyor.current = true; sec(x.id, { kaydir: false, gecmis: izgara }); }}>{tamAd(x)}</button></li>
                ))}
              </ul>
            </>
          )}
          {veri.klasorler.some(x => x.yukleyebilir) && <button type="button" className="dugme dugme-ikincil" onClick={yukleKutusu}>{t('klasor.yukle.baska')}</button>}
        </div>
        <p className="ipucu" id="klasor-yukleme" role="status">{durumSatiri}</p>
        <p className="hata" id="klasor-hata" role="alert">{hata}</p>
      </section>
    );
  }

  return (
    /* Sürükle-bırak: bütün yükleme şeridi hedeftir. */
    <section className="klasor-yukle" data-uzerinde={uzerinde ? 'true' : undefined}
      onDragOver={o => { o.preventDefault(); setUzerinde(true); }}
      onDragLeave={() => setUzerinde(false)}
      onDrop={o => {
        o.preventDefault();
        setUzerinde(false);
        if (o.dataTransfer.files.length) yukle([...o.dataTransfer.files], k.id, { aciklama: aciklama.current?.value || '' });
      }}>
      <div className="klasor-yukle-satir">
        <label className="dugme dugme-ikincil" htmlFor="klasor-dosya">{t('klasor.yukle')}</label>
        <input ref={dosyaGirdi} type="file" multiple id="klasor-dosya" className="klasor-gizli" accept={veri.sinir.uzantilar.map(u => '.' + u).join(',')}
          onChange={o => {
            const dosyalar = [...o.target.files];
            o.target.value = '';
            if (dosyalar.length) yukle(dosyalar, k.id, { aciklama: aciklama.current?.value || '' });
          }} />
        {/* Faaliyet dosyasında açıklama alanı yok. */}
        <input ref={aciklama} className="klasor-aciklama" id="klasor-aciklama" hidden={!!k.bagli} maxLength={veri.sinir.aciklama || 300}
          placeholder={t('klasor.yukle.aciklama')} aria-label={t('klasor.yukle.aciklama')} key={k.id} />
      </div>
      <p className="ipucu">{t('klasor.yukle.ipucu', { mb })}</p>
      <p className="ipucu" id="klasor-yukleme" role="status">{durumSatiri}</p>
      <p className="hata" id="klasor-hata" role="alert">{hata}</p>
    </section>
  );
}

/* --- Dosya satırı ------------------------------------------------------------ */
function DosyaSatiri({ d, k, veri, y, yenile, yukle, setHata, yer }) {
  const [surumler, setSurumler] = useState(null);
  const [sorgu, setSorgu] = useState(null);   // 'tasi' | 'kisayol'
  const surumGirdi = useRef(null);
  const faaliyet = d.kaynak === 'faaliyet';
  const kisayolMu = !faaliyet && d.klasor !== k.id;
  const kim = d.yukleyen ? t('klasor.yukleyen', { kurum: ortakKisa(d.partner), kisi: d.yukleyen }) : ortakKisa(d.partner);
  const indirAdres = faaliyet ? `api/faaliyet-dosya/${d.id}` : `api/klasorler/surum/${d.surum.id}`;

  const sil = async () => {
    if (!(await onayla(t('klasor.silOnay', { ad: d.ad }), { evet: t('genel.sil'), tehlike: true }))) return;
    try {
      await iste(faaliyet ? `api/faaliyet-dosya/${d.id}` : `api/klasorler/dosya/${d.id}`, { method: 'DELETE' });
      await yenile();
    } catch (h) { setHata(h.message); }
  };

  const surumleriAc = async () => {
    if (surumler) { setSurumler(null); return; }
    setSurumler((await iste(`api/klasorler/dosya/${d.id}/surumler`)).surumler);
  };

  /* Faaliyet dosyasından gelen belge: sürümü, taşıması ve kısayolu yoktur. */
  return (
    <li className="klasor-dosya" data-kisayol={kisayolMu ? 'true' : undefined}>
      {yer}
      <div className="klasor-dosya-ust">
        <span className="klasor-tur">{uzanti(d.ad)}</span>
        <div className="klasor-dosya-govde">
          <div className="klasor-dosya-baslik">
            <a className="klasor-dosya-ad" href={indirAdres} download="">{d.ad}</a>
            {!faaliyet && <span className="etiket">{t('klasor.surum', { no: d.surum.no })}</span>}
          </div>
          <p className="klasor-dosya-meta">{`${kim} · ${gun(d.surum.created)} · ${boyut(d.surum.boyut)}`}</p>
          {faaliyet && <p className="klasor-dosya-not">{t('klasor.bagli.dosyaNot')}</p>}
          {!faaliyet && d.aciklama && <p className="klasor-dosya-aciklama">{d.aciklama}</p>}
          {kisayolMu && <p className="klasor-dosya-not">{t('klasor.kisayol', { yer: tamAd(y.dizin.get(d.klasor)) })}</p>}
          {!faaliyet && !kisayolMu && d.kisayollar.length > 0 && (
            <p className="klasor-dosya-not">{t('klasor.kisayollar', { yerler: d.kisayollar.map(id => numara(y.dizin.get(id)) || tamAd(y.dizin.get(id))).join(', ') })}</p>
          )}
        </div>
      </div>

      {/* Eylemler: yetki sunucudan gelir (`duzenleyebilir`, `yukleyebilir`),
          sunucu yine de her isteği ayrıca denetler. */}
      <div className="klasor-eylem">
        <a className="metin-bag" href={indirAdres} download="">{t('klasor.indir')}</a>
        {!faaliyet && d.surumSayisi > 1 && (
          <button type="button" className="metin-bag" aria-expanded={!!surumler} onClick={surumleriAc}>{`${t('klasor.surumler')} (${d.surumSayisi})`}</button>
        )}
        {!faaliyet && d.duzenleyebilir && !kisayolMu && (
          <>
            <button type="button" className="metin-bag" onClick={() => surumGirdi.current.click()}>{t('klasor.surumYukle')}</button>
            <input ref={surumGirdi} type="file" hidden onChange={o => {
              const f = o.target.files[0];
              o.target.value = '';
              if (f) yukle([f], k.id, { surumDosyasi: d.id });
            }} />
            <button type="button" className="metin-bag" onClick={() => setSorgu(s => (s === 'tasi' ? null : 'tasi'))}>{t('klasor.tasi')}</button>
          </>
        )}
        {!faaliyet && !kisayolMu && veri.klasorler.some(x => x.yukleyebilir) && (
          <button type="button" className="metin-bag" onClick={() => setSorgu(s => (s === 'kisayol' ? null : 'kisayol'))}>{t('klasor.kisayolEkle')}</button>
        )}
        {kisayolMu && (k.yukleyebilir || d.duzenleyebilir) && (
          <button type="button" className="metin-bag" onClick={async () => {
            try { await iste(`api/klasorler/dosya/${d.id}/kisayol/${encodeURIComponent(k.id)}`, { method: 'DELETE' }); await yenile(); } catch (h) { setHata(h.message); }
          }}>{t('klasor.kisayolKaldir')}</button>
        )}
        {d.duzenleyebilir && !kisayolMu && <button type="button" className="metin-bag klasor-sil" onClick={sil}>{t('genel.sil')}</button>}
      </div>

      {sorgu && (
        <HedefSorgusu veri={veri} istisna={sorgu === 'tasi' ? [d.klasor] : [d.klasor, ...d.kisayollar]} vazgec={() => setSorgu(null)}
          isle={async hedef => {
            if (sorgu === 'tasi') await iste(`api/klasorler/dosya/${d.id}`, { method: 'PUT', body: JSON.stringify({ klasor: hedef }) });
            else await iste(`api/klasorler/dosya/${d.id}/kisayol`, { method: 'POST', body: JSON.stringify({ klasor: hedef }) });
            setSorgu(null);
            await yenile();
          }} setHata={setHata} />
      )}
      {surumler && (
        <ul className="klasor-surumler">
          {surumler.map(v => (
            <li key={v.id}><a href={`api/klasorler/surum/${v.id}`} download="">
              {t('klasor.surumSatir', { no: v.no, tarih: gun(v.created), kisi: v.yukleyen || '—', boyut: boyut(v.boyut) })}</a></li>
          ))}
        </ul>
      )}
    </li>
  );
}

/* Faaliyete bağlı klasörler yalnızca yükleme hedefi olabilir: klasör
   dosyası oraya taşınamaz, kısayol konamaz (sunucu da reddeder). */
function KlasorSecimi({ veri, istisna = [], bagliDahil = false, ...ozellik }) {
  return (
    <select className="klasor-hedef" {...ozellik}>
      <option value="">{t('klasor.hedefSec')}</option>
      {veri.klasorler.filter(k => k.yukleyebilir && !istisna.includes(k.id) && (!k.bagli || bagliDahil)).map(k => (
        <option key={k.id} value={k.id}>{`${'  '.repeat(k.derinlik)}${tamAd(k)}`}</option>
      ))}
    </select>
  );
}

/** Taşı / kısayol ekle için satır içi seçici: açılır liste + Tamam. */
function HedefSorgusu({ veri, istisna, isle, vazgec, setHata }) {
  const [hedef, setHedef] = useState('');
  const [bekliyor, setBekliyor] = useState(false);
  return (
    <div className="klasor-sorgu">
      <KlasorSecimi veri={veri} istisna={istisna} value={hedef} onChange={o => setHedef(o.target.value)} autoFocus />
      <button type="button" className="dugme dugme-ikincil" disabled={bekliyor} onClick={async () => {
        if (!hedef) return;
        setBekliyor(true);
        try { await isle(hedef); } catch (h) { setHata(h.message); setBekliyor(false); }
      }}>{t('klasor.tamam')}</button>
      <button type="button" className="metin-bag" onClick={vazgec}>{t('genel.vazgec')}</button>
    </div>
  );
}

/* --- Dosya yükle kutusu -------------------------------------------------------
   Üstteki düğmeden, yüklenebilen bir klasörün içinde değilken: dosya tek bir
   klasörde durduğu için önce "nereye?" sorulur. */
function YukleFormu({ veri, secili, y, kapat, gonder }) {
  return (
    <form id="yukle-form" className="kutu-ic" onSubmit={o => {
      o.preventDefault();
      const f = o.currentTarget;
      gonder(f.klasor.value, [...f.dosya.files], f.aciklama.value);
    }}>
      <div className="kutu-ust">
        <h2>{t('klasor.dosyaYukle')}</h2>
        <button type="button" className="kapat" data-kapat aria-label={t('genel.kapat')} onClick={kapat}>×</button>
      </div>
      <p className="kutu-aciklama">{t('klasor.yukleKutu.ipucu')}</p>
      <label className="alan"><span>{t('klasor.yukleKutu.klasor')}</span>
        <span id="yukle-klasor-yer"><KlasorSecimi veri={veri} bagliDahil name="klasor" required defaultValue={y.dizin.get(secili)?.yukleyebilir ? secili : ''} /></span></label>
      <label className="alan"><span>{t('klasor.yukleKutu.dosya')}</span>
        <input type="file" name="dosya" multiple required accept={veri.sinir.uzantilar.map(u => '.' + u).join(',')} /></label>
      <label className="alan"><span>{t('klasor.yukle.aciklama')}</span><input name="aciklama" maxLength={300} /></label>
      <p className="ipucu" id="yukle-sinir">{t('klasor.yukle.ipucu', { mb: Math.round(veri.sinir.bayt / 1048576) })}</p>
      <div className="kutu-eylem">
        <button type="submit" className="dugme dugme-birincil">{t('klasor.dosyaYukle')}</button>
        <button type="button" className="dugme dugme-ikincil" data-kapat>{t('genel.vazgec')}</button>
      </div>
    </form>
  );
}

/* --- Belgenin tabloları ------------------------------------------------------ */
function Tablo({ basliklar, satirlar }) {
  return (
    <table className="klasor-tablo">
      <thead><tr>{basliklar.map(b => <th key={b}>{b}</th>)}</tr></thead>
      <tbody>{satirlar.map((satir, i) => <tr key={i}>{satir.map((h, j) => <td key={j}>{h}</td>)}</tr>)}</tbody>
    </table>
  );
}

function ButceTablosu({ veri }) {
  const { toplam, wp } = veri.butce;
  const yuzde = n => new Intl.NumberFormat(durum.dil, { style: 'percent', maximumFractionDigits: 1 }).format(n / toplam);
  const satirlar = wp.map(w => [<span className="etiket etiket-wp" data-wp={w.wp}>{t(`wp.${w.wp}.ad`)}</span>, eur(w.tutar), yuzde(w.tutar)]);
  satirlar.push([<strong>{t('klasor.butce.toplam')}</strong>, <strong>{eur(toplam)}</strong>, yuzde(toplam)]);
  return (
    <div className="klasor-tablo-sar">
      <p className="ipucu">{t('klasor.butce.not')}</p>
      <Tablo basliklar={[t('klasor.butce.wp'), t('klasor.butce.tutar'), t('klasor.butce.pay')]} satirlar={satirlar} />
    </div>
  );
}

function TakvimTablosu({ veri, y, git }) {
  const satirlar = veri.takvim.map(r => [
    r.kod,
    t(`klasor.takvim.a.${r.ad}`),
    r.ulke ? `${yerAdi(r.ulke)} / ${ortakKisa(r.ev)}` : t('klasor.takvim.tumUlkeler'),
    r.tarihAnahtari ? t(r.tarihAnahtari) : tarihAraligi(r.baslangic, r.bitis || r.baslangic),
    r.wp,
    <button type="button" className="metin-bag" onClick={() => git(r.klasor)}>{tamAd(y.dizin.get(r.klasor))}</button>,
  ]);
  return <Tablo basliklar={['kod', 'faaliyet', 'yer', 'tarih', 'wp', 'klasor'].map(a => t(`klasor.takvim.${a}`))} satirlar={satirlar} />;
}
