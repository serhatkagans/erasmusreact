import { durum, t, tamTarih } from '../../ortak.js';

/**
 * Formlar modülünün paylaşılan yardımcıları: soru türleri, biçimli metin
 * (zengin metin) okuyucu, API çağrısı, biçimlendiriciler ve simgeler.
 * Sunucu kuralları lib/forms.mjs içindedir; burası yalnızca ekrandır.
 */

/* Soru türleri — sunucudaki adlarla (lib/data.mjs · QUESTION_TYPES). */
export const TURLER = ['kisa', 'paragraf', 'tekli', 'coklu', 'liste', 'sayi', 'tarih', 'dosya'];
export const SECIMLI = ['tekli', 'coklu', 'liste'];
export const bolumMu = q => q.type === 'bolum';
export const yanitlanabilir = q => !bolumMu(q);

/* Dosya sorusu: sunucudaki sınırlarla aynı (lib/data.mjs). */
export const MAX_DOSYA = 5, MAX_DOSYA_MB = 10;
export const DOSYA_KABUL = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.jpg,.jpeg,.png,.webp,.txt,.csv,.zip';
export const METIN_LISTE_SINIRI = 20;

export const kacis = deger => String(deger ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* Biçimlendiriciler dile bağlıdır; dil bir sayfa açılışı boyunca sabit. */
let bicimler = null;
const b = () => (bicimler ??= {
  sayi: new Intl.NumberFormat(durum.dil, { maximumFractionDigits: 2 }),
  damga: new Intl.DateTimeFormat(durum.dil, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
  saat: new Intl.DateTimeFormat(durum.dil, { hour: '2-digit', minute: '2-digit' }),
  siralayici: new Intl.Collator(durum.dil),
});
export const sayi = n => b().sayi.format(n);
export const damga = iso => b().damga.format(new Date(iso));
export const saat = iso => b().saat.format(new Date(iso));
export const sirala = (a, c) => b().siralayici.compare(a, c);
export const gunEtiketi = gun => tamTarih(gun);
export const boyutMetni = bayt => (bayt < 1048576
  ? t('form.boyut.kb', { n: Math.max(1, Math.round(bayt / 1024)) })
  : t('form.boyut.mb', { n: sayi(Math.round(bayt / 104857.6) / 10) }));

/* Soru kimliği: sunucu [a-z0-9]{1,16} bekler. randomUUID güvenli bağlam
   ister; yerel ağ adresinden (http) açılışta da çalışsın diye getRandomValues. */
export const yeniId = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), x => x.toString(36).padStart(2, '0')).join('');

export async function api(yol, secenek = {}) {
  const yanit = await fetch(yol, { ...secenek, headers: { 'Content-Type': 'application/json', ...secenek.headers } });
  const veri = await yanit.json().catch(() => ({}));
  /* Oturum düştüyse giriş sayfasına dönülür. */
  if (yanit.status === 401) { location.href = 'giris.html'; throw Error(durum.sozluk[veri.error] || t('form.hata.giris')); }
  if (!yanit.ok) throw Error(durum.sozluk[veri.error] || veri.error || t('genel.hata'));
  return veri;
}

/* ---- Biçimli metin -------------------------------------------------------
   Form başlığı ve açıklaması kalın / italik / altı çizili / liste taşıyabilir.
   Düzenleyici (contenteditable) ne üretirse üretsin, kaydedilen ve ekrana
   basılan değer zenginOku'dan geçer: yalnızca <b> <i> <u> <ul> <ol> <li>
   <br> kalır, öznitelik kalmaz, metin kaçışlanır. Sunucu aynı kuralı ayrıca
   denetler (lib/forms.mjs · richText). `satirIci` başlık içindir. */
const ZENGIN_ETIKET = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u', UL: 'ul', OL: 'ol', LI: 'li' };
export function zenginOku(kok, satirIci = false) {
  let cikti = '';
  const gez = dugum => {
    for (const cocuk of dugum.childNodes) {
      if (cocuk.nodeType === Node.TEXT_NODE) { cikti += kacis(cocuk.nodeValue.replace(/\s*\n\s*/g, ' ')); continue; }
      if (cocuk.nodeType !== Node.ELEMENT_NODE) continue;
      const etiket = cocuk.tagName;
      if (etiket === 'BR') { cikti += satirIci ? ' ' : '<br>'; continue; }
      /* Tarayıcı Enter'a basılınca her satırı <div> içine alır: satır sonuna çevrilir. */
      if (etiket === 'DIV' || etiket === 'P') {
        if (cikti && !/(<br>|<\/[uo]l>| )$/.test(cikti)) cikti += satirIci ? ' ' : '<br>';
        gez(cocuk);
        continue;
      }
      let sarmal = ZENGIN_ETIKET[etiket] ? [ZENGIN_ETIKET[etiket]] : [];
      /* Satır birleştirirken tarayıcı biçimi bazen <span style> olarak bırakır. */
      if (!sarmal.length && cocuk.style) {
        if (cocuk.style.fontWeight === 'bold' || Number(cocuk.style.fontWeight) >= 600) sarmal.push('b');
        if (cocuk.style.fontStyle === 'italic') sarmal.push('i');
        if (cocuk.style.textDecorationLine?.includes('underline') || cocuk.style.textDecoration?.includes('underline')) sarmal.push('u');
      }
      if (satirIci) sarmal = sarmal.filter(ad => !['ul', 'ol', 'li'].includes(ad));
      cikti += sarmal.map(ad => `<${ad}>`).join('');
      gez(cocuk);
      cikti += sarmal.reverse().map(ad => `</${ad}>`).join('');
    }
  };
  gez(kok);
  cikti = cikti.replace(/(<br>|\s)+$/, '').replace(/^(<br>|\s)+/, '');
  /* Yalnızca boş etiket kaldıysa (ör. <b></b>) alan boş sayılır. */
  return cikti.replace(/<[^>]+>/g, '').trim() ? cikti : '';
}

/** Saklanan biçimli metni güvenle HTML'e çevirir; yoksa düz metni kaçışlar. */
export function zenginHtml(zengin, duz, satirIci = false) {
  if (!zengin) return satirIci ? kacis(duz) : kacis(duz).replace(/\n/g, '<br>');
  const kalip = document.createElement('template');
  kalip.innerHTML = zengin;
  return zenginOku(kalip.content, satirIci);
}

/* ---- Kapak görseli ------------------------------------------------------ */
const GORSEL_GENISLIK = 1600, GORSEL_TUT_BAYT = 1.5 * 1024 * 1024;
export const gorselAdresi = (id, surum) => `api/formlar/${id}/gorsel?v=${encodeURIComponent(surum)}`;

/* Büyük fotoğraf yüklemeden önce küçültülür: form her açılışta bu görseli indirir. */
export async function gorseliKucult(dosya) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(dosya.type)) throw Error(t('form.hata.gorselTuru'));
  const resim = await createImageBitmap(dosya).catch(() => { throw Error(t('form.hata.gorselAcilmadi')); });
  const olcek = Math.min(1, GORSEL_GENISLIK / resim.width);
  if (olcek === 1 && dosya.size <= GORSEL_TUT_BAYT) { resim.close(); return dosya; }
  const tuval = document.createElement('canvas');
  tuval.width = Math.round(resim.width * olcek); tuval.height = Math.round(resim.height * olcek);
  const ctx = tuval.getContext('2d');
  /* Saydam PNG JPEG'e çevrilince siyah olmasın. */
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, tuval.width, tuval.height);
  ctx.drawImage(resim, 0, 0, tuval.width, tuval.height);
  resim.close();
  return new Promise((coz, at) => tuval.toBlob(x => (x ? coz(x) : at(Error(t('form.hata.gorselHazirlanamadi')))), 'image/jpeg', 0.86));
}

export async function gorselYukle(id, blob) {
  const yanit = await fetch(`api/formlar/${id}/gorsel`, { method: 'PUT', headers: { 'Content-Type': blob.type }, body: blob });
  const veri = await yanit.json().catch(() => ({}));
  if (!yanit.ok) throw Error(durum.sozluk[veri.error] || veri.error || t('form.hata.gorselYuklenemedi'));
  return veri.gorsel;
}

/** Hedef kitle metni: "Bütün ortak kurumlar" ya da "3 kurum". */
export const hedefMetni = form => (form.hedef.length
  ? t('form.hedef.nKurum', { n: form.hedef.length })
  : t('form.hedef.hepsi')) + (form.koordinatorDoldurur ? t('form.hedef.veKoordinator') : '');

/* Düğme simgeleri (satır içi SVG: CSP dış kaynağa izin vermiyor). */
const Svg = ({ d }) => <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d={d} /></svg>;
export const SIMGE = {
  kopya: <Svg d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z" />,
  cop: <Svg d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM8 9h8v10H8V9zm7.5-5-1-1h-5l-1 1H5v2h14V4h-3.5z" />,
  yukari: <Svg d="M7.4 15.4 12 10.8l4.6 4.6L18 14l-6-6-6 6z" />,
  asagi: <Svg d="M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z" />,
  kapat: <Svg d="M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z" />,
  arti: <Svg d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />,
  bolum: <Svg d="M3 5h18v2H3V5zm0 6h18v2H3v-2zm0 6h12v2H3v-2z" />,
  dosya: <Svg d="M16.5 6v11.5a4 4 0 0 1-8 0V5a2.5 2.5 0 0 1 5 0v10.5a1 1 0 0 1-2 0V6H10v9.5a2.5 2.5 0 0 0 5 0V5a4 4 0 0 0-8 0v12.5a5.5 5.5 0 0 0 11 0V6h-1.5z" />,
};

/* Seçenek işareti: tek seçimde daire, çoklu seçimde kare, listede sıra no. */
export const SecenekIsareti = ({ type, j }) => <span className={`secenek-isaret is-${type}`} aria-hidden="true">{type === 'liste' ? `${j + 1}.` : ''}</span>;
