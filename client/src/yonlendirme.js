import { useSyncExternalStore } from 'react';

/**
 * Sayfa yönlendirmesi.
 *
 * ADRESLER ESKİSİYLE AYNIDIR: `takvim.html`, `profil.html?u=…`,
 * `formlar.html#form-3`. NFC etiketlerine yazılmış profil adresleri, yer
 * imleri, hatırlatıcı bağlantıları ve sunucunun `giris.html?geri=…`
 * yönlendirmesi olduğu gibi çalışsın diye. Sunucu bu adreslerin hepsine
 * aynı React uygulamasını verir; hangi sayfanın çizileceğine burada, adresin
 * SON PARÇASINA bakılarak karar verilir. Önek (BASE_PATH, ör.
 * ornek.org/eyouthpreneur/) bilinmek zorunda değildir.
 *
 * Bağlantılar düz `<a href="takvim.html">` olarak yazılır. Belgeye bağlı tek
 * bir tıklama dinleyicisi uygulama içi `.html` bağlantılarını yakalar ve
 * sayfayı yeniden yüklemeden geçer (history.pushState). Yeni sekme, indirme,
 * başka site ve değiştirici tuşlu tıklamalar tarayıcıya bırakılır.
 */

export const SAYFALAR = ['index.html', 'pano.html', 'takvim.html', 'ciktilar.html', 'ekip.html', 'formlar.html',
  'belge.html', 'klasorler.html', 'drive.html', 'kullanicilar.html', 'giris.html', 'profil.html'];

/** Oturumsuz açılabilen sayfalar (sunucudaki ACIK_SAYFA ile aynı). Ana
    adres oturumsuz ziyaretçiye tanıtım sayfasını gösterir. */
export const ACIK_SAYFALAR = new Set(['index.html', 'giris.html', 'profil.html']);

const dinleyiciler = new Set();
const haberVer = () => { for (const d of dinleyiciler) d(); };
addEventListener('popstate', haberVer);
addEventListener('hashchange', haberVer);

let anlik = null;
function oku() {
  const { pathname, search, hash } = location;
  const anahtar = pathname + search + hash;
  if (anlik?.anahtar !== anahtar) {
    const son = pathname.split('/').pop();
    anlik = { anahtar, sayfa: son || 'index.html', search, hash, params: new URLSearchParams(search) };
  }
  return anlik;
}

/** Geçerli sayfa: `{ sayfa, search, hash, params }`. Adres değişince yeniden çizer. */
export function useKonum() {
  return useSyncExternalStore(d => { dinleyiciler.add(d); return () => dinleyiciler.delete(d); }, oku);
}

/** Uygulama içinde başka adrese geçer. `degistir`: geçmişe yeni kayıt açmadan. */
export function git(adres, { degistir = false } = {}) {
  const hedef = new URL(adres, location.href);
  const onceki = location.pathname + location.search;
  history[degistir ? 'replaceState' : 'pushState'](null, '', hedef);
  haberVer();
  if (hedef.pathname + hedef.search !== onceki) {
    /* Yeni sayfa en üstten açılır; adreste çapa varsa sayfa kendisi kaydırır. */
    if (!hedef.hash) scrollTo({ top: 0, behavior: 'instant' });
  }
}

/** Yalnızca çapayı değiştirir (ör. `#ayrinti`), hashchange gibi davranır. */
export function capaAyarla(capa, { degistir = false } = {}) {
  const adres = new URL(location.href);
  adres.hash = capa ? `#${capa}` : '';
  if (!capa) {
    history[degistir ? 'replaceState' : 'pushState'](null, '', adres.pathname + adres.search);
  } else {
    history[degistir ? 'replaceState' : 'pushState'](null, '', adres);
  }
  haberVer();
}

/**
 * Sayfadan ayrılma koruması: kaydedilmemiş değişikliği olan ekran (formlar
 * düzenleyicisi) başka sayfaya geçilmeden önce sorsun diye. İşlev söz döner:
 * doğruysa geçilir. Kaldırma işlevi döner.
 */
const korumalar = new Set();
export function ayrilmaKorumasi(sor) {
  korumalar.add(sor);
  return () => korumalar.delete(sor);
}
async function korumalariSor() {
  for (const sor of korumalar) if (!(await sor())) return false;
  return true;
}

/* Uygulama içi bağlantıları yakala. */
document.addEventListener('click', olay => {
  if (olay.defaultPrevented || olay.button !== 0 || olay.metaKey || olay.ctrlKey || olay.shiftKey || olay.altKey) return;
  const a = olay.target.closest?.('a[href]');
  if (!a || a.target && a.target !== '_self' || a.hasAttribute('download')) return;
  const hedef = new URL(a.href, location.href);
  if (hedef.origin !== location.origin) return;
  const tabanBurasi = location.pathname.replace(/[^/]*$/, '');
  if (!hedef.pathname.startsWith(tabanBurasi)) return;
  const son = hedef.pathname.slice(tabanBurasi.length) || 'index.html';
  if (!SAYFALAR.includes(son)) return;
  /* Aynı sayfada yalnızca çapa değişiyorsa tarayıcının kendi kaydırması
     çalışsın (hashchange dinleniyor). */
  if (hedef.pathname === location.pathname && hedef.search === location.search && a.getAttribute('href').includes('#')) return;
  olay.preventDefault();
  if (korumalar.size && hedef.pathname !== location.pathname) {
    korumalariSor().then(tamam => { if (tamam) git(hedef.href); });
    return;
  }
  git(hedef.href);
});
