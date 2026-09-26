import { useEffect, useRef, useState } from 'react';
import { durum, t, iste, ortakAdi, ortakKisa, basHarfler } from '../ortak.js';
import { useKonum } from '../yonlendirme.js';
import Kutu, { bildir } from './Kutu.jsx';

/**
 * Her sayfanın kabuğu: üst bant (marka, hatırlatıcılar, tema, dil, hesap,
 * menü) ve Erasmus+ alt bandı. Sayfa içeriği `children` olarak gelir.
 */
export default function Kabuk({ children, logolar = false }) {
  return (
    <>
      <a className="atla" href="#icerik">{t('menu.atla')}</a>
      <UstBant />
      {children}
      <AltBant logolar={logolar} />
    </>
  );
}

/* --- Menü -----------------------------------------------------------------
   Tek liste, her sayfada aynı sıra ve aynı öğeler. `sayfa`: aria-current
   için karşılaştırılan dosya adı. Kişiye ait bağlantılar (profil, parola,
   çıkış) hesap menüsündedir. */
const MENU = [
  { anahtar: 'menu.pano', href: 'pano.html' },
  { anahtar: 'menu.anasayfa', href: './', sayfa: 'index.html' },
  { anahtar: 'menu.takvim', href: 'takvim.html' },
  { anahtar: 'menu.ciktilar', href: 'ciktilar.html' },
  { anahtar: 'menu.ekip', href: 'ekip.html' },
  { anahtar: 'menu.formlar', href: 'formlar.html' },
  { anahtar: 'menu.belgeler', href: 'belge.html' },
  { anahtar: 'menu.klasorler', href: 'klasorler.html' },
  { anahtar: 'menu.kullanicilar', href: 'kullanicilar.html', koordinator: true },
];

/** Açılır panel: dışarı tıklayınca ve Esc ile kapanır. */
function useAcilir() {
  const [acik, setAcik] = useState(false);
  const kutu = useRef(null);
  const dugme = useRef(null);
  useEffect(() => {
    if (!acik) return;
    const tikla = o => { if (!kutu.current?.contains(o.target)) setAcik(false); };
    const tus = o => { if (o.key === 'Escape') { setAcik(false); dugme.current?.focus(); } };
    document.addEventListener('click', tikla);
    document.addEventListener('keydown', tus);
    return () => { document.removeEventListener('click', tikla); document.removeEventListener('keydown', tus); };
  }, [acik]);
  return { acik, setAcik, kutu, dugme };
}

function UstBant() {
  const { sayfa } = useKonum();
  const [menuAcik, setMenuAcik] = useState(false);
  const [parolaAcik, setParolaAcik] = useState(false);
  const k = durum.kullanici;

  /* Sayfa değişince telefon menüsü kapansın. */
  useEffect(() => { setMenuAcik(false); }, [sayfa]);
  useEffect(() => {
    if (!menuAcik) return;
    const tus = o => { if (o.key === 'Escape') setMenuAcik(false); };
    document.addEventListener('keydown', tus);
    return () => document.removeEventListener('keydown', tus);
  }, [menuAcik]);

  const ogeler = MENU.filter(o => !o.koordinator || k?.koordinator);

  return (
    <header className={`ust${menuAcik ? ' menu-acik' : ''}`}>
      <div className="kapsayici ust-ic">
        <a className="marka" href="./">
          <img src="logo.png" alt="" />
          <span>E-YOUTHPRENEUR <small>{t('altbilgi.kunye')}</small></span>
        </a>
        {/* Oturumsuz kişi yalnızca giriş ve profil kartını görebilir; menüdeki
            her bağlantı onu girişe geri yollardı. */}
        <nav className="gezinme" id="gezinme" aria-label={t('menu.ana')} hidden={!k}>
          {k && ogeler.map(o => (
            <a key={o.href} href={o.href} aria-current={(o.sayfa || o.href) === sayfa ? 'page' : undefined}>{t(o.anahtar)}</a>
          ))}
        </nav>
        <div className="ust-sag">
          {k && <Hatirlatici />}
          <TemaDugmesi />
          <DilSecici />
          {k && <HesapMenusu parolaAc={() => setParolaAcik(true)} />}
          <a id="giris-baglanti" className="dugme dugme-hayalet" href="giris.html" hidden={!!k || sayfa === 'giris.html'}>{t('menu.giris')}</a>
          <button id="menu-dugme" className="menu-dugme" type="button" aria-expanded={menuAcik} aria-controls="gezinme" hidden={!k}
            onClick={() => setMenuAcik(a => !a)}>
            <span aria-hidden="true">☰</span> <span>{t('menu.menu')}</span>
          </button>
        </div>
      </div>
      {k && <ParolaKutusu acik={parolaAcik} kapat={() => setParolaAcik(false)} />}
    </header>
  );
}

/* --- Dil seçici -----------------------------------------------------------
   Hazır olmayan diller listede durur ama seçilemez. Sunucu dili çereze
   yazsın diye sayfa `?dil=` ile yeniden yüklenir. */
function DilSecici() {
  const yayinda = durum.diller.filter(d => d.ready);
  /* Tek dil yayındayken seçici gereksiz gürültüdür. */
  if (yayinda.length < 2) return null;
  return (
    <div id="dil-secici" className="dil-secici">
      <select className="dil-secim" aria-label={t('menu.dil')} value={durum.dil}
        onChange={o => {
          const adres = new URL(location.href);
          adres.searchParams.set('dil', o.target.value);
          location.href = adres.toString();
        }}>
        {durum.diller.map(({ code, name, ready }) => (
          <option key={code} value={code} disabled={!ready}>{ready ? name : `${name} — ${t('menu.dil.yakinda')}`}</option>
        ))}
      </select>
    </div>
  );
}

/* --- Tema -------------------------------------------------------------------
   İki tema (bkz. style.css · :root[data-tema]): varsayılan mavi bant + yeşil
   vurgu, ikincisi yeşil bant + mavi vurgu. Tercih tarayıcıda saklanır. İlk
   uygulama main.jsx'te, çizimden önce yapılır ki sayfa önce öbür temayla
   boyanıp sonra değişmesin. */
const TEMA_ANAHTAR = 'eyp.tema';
export function temaOku() {
  try { const x = localStorage.getItem(TEMA_ANAHTAR); return x === 'yesil' ? 'yesil' : 'mavi'; } catch { return 'mavi'; }
}
export function temaUygula(tema) {
  if (tema === 'yesil') document.documentElement.dataset.tema = 'yesil';
  else delete document.documentElement.dataset.tema;
}

function TemaDugmesi() {
  const [tema, setTema] = useState(temaOku);
  const metin = t(tema === 'yesil' ? 'menu.tema.mavi' : 'menu.tema.yesil');
  return (
    <button type="button" id="tema-dugme" className="hatirlatici-dugme tema-dugme" aria-label={metin} title={metin}
      onClick={() => {
        const yeni = tema === 'yesil' ? 'mavi' : 'yesil';
        try { localStorage.setItem(TEMA_ANAHTAR, yeni); } catch { /* saklama kapalı: yalnızca bu oturumda */ }
        temaUygula(yeni);
        setTema(yeni);
      }}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" /></svg>
    </button>
  );
}

/* --- Hatırlatıcılar -------------------------------------------------------
   Sunucuda TÜRETİLİR (routes/hatirlatici.mjs); burada yalnızca çizilir.
   Her sayfa geçişinde tazelenir: görev tamamlanınca zil de söner. */
function hatirlaticiMetni(h) {
  const degerler = { ...h.degerler };
  if (degerler.slug) degerler.baslik = durum.sozluk[`etkinlik.${degerler.slug}.baslik`] || degerler.baslik;
  if (degerler.anahtar) degerler.baslik = t(`${degerler.anahtar}.baslik`);
  return t(h.anahtar, degerler);
}

function Hatirlatici() {
  const { sayfa, search } = useKonum();
  const [veri, setVeri] = useState(null);
  const { acik, setAcik, kutu, dugme } = useAcilir();

  useEffect(() => {
    let iptal = false;
    iste('api/hatirlaticilar').then(v => { if (!iptal) setVeri(v); }).catch(() => {});
    setAcik(false);
    return () => { iptal = true; };
  }, [sayfa, search, setAcik]);

  if (!veri) return null;
  return (
    <span id="hatirlatici" className="hatirlatici" ref={kutu}>
      <button ref={dugme} type="button" className="hatirlatici-dugme" aria-expanded={acik} aria-label={t('hatirlatici.ac')}
        title={t('hatirlatici.baslik')} onClick={() => setAcik(a => !a)}>
        🔔{veri.acilSayisi ? <span className="hatirlatici-sayi">{veri.acilSayisi}</span> : null}
      </button>
      <div className="hatirlatici-panel" hidden={!acik} role="region" aria-label={t('hatirlatici.baslik')}>
        <p className="hatirlatici-bas">{t('hatirlatici.baslik')}</p>
        {!veri.hatirlaticilar.length
          ? <p className="hatirlatici-bos">{t('hatirlatici.yok')}</p>
          : veri.hatirlaticilar.map((h, i) => (
            <a key={i} className="hatirlatici-satir" data-oncelik={h.oncelik} href={h.bag} onClick={() => setAcik(false)}>{hatirlaticiMetni(h)}</a>
          ))}
      </div>
    </span>
  );
}

/* --- Hesap menüsü ---------------------------------------------------------- */
function HesapMenusu({ parolaAc }) {
  const k = durum.kullanici;
  const ad = k.ad || k.kullanici;
  const { acik, setAcik, kutu, dugme } = useAcilir();
  const { sayfa } = useKonum();
  useEffect(() => { setAcik(false); }, [sayfa, setAcik]);

  return (
    <div id="hesap" className="hesap" ref={kutu}>
      <button ref={dugme} type="button" className="hesap-dugme" aria-expanded={acik} aria-haspopup="true"
        aria-label={t('hesap.ac', { ad })} onClick={() => setAcik(a => !a)}>
        <span className="hesap-avatar">{basHarfler(ad)}</span>
        <span className="hesap-ad">{`${ad} · ${ortakKisa(k.partner)}`}</span>
      </button>
      <div className="hesap-panel" hidden={!acik}>
        <div className="hesap-kim">
          <strong>{ad}</strong>
          <span>{`${k.kullanici} · ${ortakAdi(k.partner)}${k.koordinator ? ` · ${t('kullanicilar.yetki.tam')}` : ''}`}</span>
        </div>
        <a href={`profil.html?u=${encodeURIComponent(k.kullanici)}`}>{t('menu.profil')}</a>
        <button type="button" onClick={() => { setAcik(false); parolaAc(); }}>{t('menu.parola')}</button>
        <button type="button" onClick={async () => {
          await iste('api/cikis', { method: 'POST' });
          location.href = 'giris.html';
        }}>{t('menu.cikis')}</button>
      </div>
    </div>
  );
}

/* --- Parola değiştirme ------------------------------------------------------ */
function ParolaKutusu({ acik, kapat }) {
  const [hata, setHata] = useState('');
  useEffect(() => { if (acik) setHata(''); }, [acik]);
  return (
    <Kutu acik={acik} onKapat={kapat} koru id="parola-kutu">
      <form className="kutu-ic" onSubmit={async o => {
        o.preventDefault();
        const f = o.currentTarget;
        setHata('');
        try {
          await iste('api/parola', { method: 'POST', body: JSON.stringify({ mevcut: f.mevcut.value, yeni: f.yeni.value }) });
          kapat();
          bildir(t('parola.tamam'));
        } catch (err) { setHata(err.message); }
      }}>
        <div className="kutu-ust">
          <h2>{t('parola.baslik')}</h2>
          <button type="button" className="kapat" data-kapat aria-label={t('genel.kapat')}>×</button>
        </div>
        <p className="kutu-aciklama">{t('parola.ipucu')}</p>
        <label className="alan"><span>{t('parola.mevcut')}</span><input name="mevcut" type="password" autoComplete="current-password" required /></label>
        <label className="alan"><span>{t('parola.yeni')}</span><input name="yeni" type="password" autoComplete="new-password" required minLength={durum.minParola} /></label>
        <p className="hata" role="alert">{hata}</p>
        <div className="kutu-eylem">
          <button type="submit" className="dugme dugme-birincil">{t('parola.guncelle')}</button>
          <button type="button" className="dugme dugme-ikincil" data-kapat>{t('genel.vazgec')}</button>
        </div>
      </form>
    </Kutu>
  );
}

/* --- Alt bant: Erasmus+ görsel kimliği (zorunlu) --------------------------- */
function AltBant({ logolar }) {
  return (
    <footer className="alt">
      <div className="kapsayici alt-ic">
        <div className="alt-ust">
          <span className="marka"><img src="logo.png" alt="" /><span>E-YOUTHPRENEUR</span></span>
          <div className="ab-kilit">
            <img src="ab-amblem.svg" aria-label={t('ab.amblem')} alt="" />
            <span>{t('ab.finanse')}</span>
          </div>
        </div>
        {logolar && (
          <div className="alt-logolar">
            <img src="ab-ortak-finanse.webp" aria-label={t('ab.logo.ortak')} alt="" width="149" height="31" />
            <img src="ulusal-ajans.webp" aria-label={t('ab.logo.ajans')} alt="" width="149" height="78" />
            <img src="ab-baskanligi.webp" aria-label={t('ab.logo.baskanlik')} alt="" width="149" height="82" />
          </div>
        )}
        <div className="alt-kunye">
          <span>{t('altbilgi.program')}</span>
          <span>{t('altbilgi.projeno')}</span>
          <span>{t('altbilgi.sure')}</span>
          <span>{t('altbilgi.ajans')}</span>
        </div>
        <p className="alt-erisim">{t('altbilgi.erisim')}</p>
        <p className="alt-feragat">{t('altbilgi.feragat')}</p>
      </div>
    </footer>
  );
}

/** Sekme başlığı: sayfanın adı çevrilir, proje adı sabit kalır. */
export function useBaslik(anahtarVeyaMetin, { hazir = false } = {}) {
  useEffect(() => {
    if (!anahtarVeyaMetin) { document.title = t('site.ad'); return; }
    document.title = `${hazir ? anahtarVeyaMetin : t(anahtarVeyaMetin)} · ${t('site.ad')}`;
  }, [anahtarVeyaMetin, hazir]);
}
