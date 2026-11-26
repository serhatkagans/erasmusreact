import { readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ValidationError, PROJECT, partners, venues, VIRTUAL, sniffPhoto, KURALLAR, workPackages, wpIds, types } from './data.mjs';
import { ozelMetinleriAyarla } from './i18n.mjs';

/**
 * Yönetim sayfasının değiştirdiği site ayarları (26 Kasım 2026).
 *
 * KODDAKİ DEĞERLER VARSAYILANDIR. Veritabanında yalnızca yöneticinin
 * değiştirdiği alanlar durur; açılışta ve her kaydetmeden sonra
 * varsayılanların üstüne yazılır. `PROJECT` ve `partners` nesneleri YERİNDE
 * güncellenir: onları içe aktaran her modül (belge, rapor, takvim…) aynı
 * nesneyi okuduğu için değişiklik sunucu yeniden başlamadan her yere geçer.
 *
 * Kurum KODLARI (hbv, bte…) değişmez: veritabanındaki kayıtlar onlara bağlı.
 */
const VARSAYILAN_PROJE = structuredClone(PROJECT);
const VARSAYILAN_ORTAKLAR = structuredClone(partners);

const GUN = /^\d{4}-\d{2}-\d{2}$/;
const metin = (deger, ad, { max = 200, bos = false } = {}) => {
  const v = String(deger ?? '').trim();
  if (!bos && !v) throw new ValidationError(`${ad} boş olamaz.`);
  if (v.length > max) throw new ValidationError(`${ad} en fazla ${max} karakter olabilir.`);
  return v;
};
const adres = (deger, ad) => {
  const v = metin(deger, ad, { max: 300, bos: true });
  if (v && !/^https?:\/\/[^\s]+$/i.test(v)) throw new ValidationError(`${ad} http:// ya da https:// ile başlamalı.`);
  return v;
};
const tamSayi = (deger, ad, min, max) => {
  const v = Number(deger);
  if (!Number.isInteger(v) || v < min || v > max) throw new ValidationError(`${ad} ${min}–${max} arasında bir tam sayı olmalı.`);
  return v;
};

/** Künyede düzenlenebilen alanlar ve doğrulamaları. */
const PROJE_ALANLARI = {
  projectNo: v => metin(v, 'Proje no', { max: 80 }),
  formId: v => metin(v, 'Form no', { max: 80, bos: true }),
  acronym: v => metin(v, 'Kısa ad', { max: 60 }),
  action: v => metin(v, 'Eylem', { max: 40 }),
  call: v => tamSayi(v, 'Çağrı yılı', 2000, 2100),
  round: v => tamSayi(v, 'Tur', 1, 9),
  agency: v => metin(v, 'Ulusal ajans', { max: 20 }),
  start: v => { if (!GUN.test(String(v))) throw new ValidationError('Başlangıç tarihi YYYY-AA-GG olmalı.'); return String(v); },
  end: v => { if (!GUN.test(String(v))) throw new ValidationError('Bitiş tarihi YYYY-AA-GG olmalı.'); return String(v); },
  months: v => tamSayi(v, 'Süre (ay)', 1, 120),
  eposta: v => {
    const e = metin(v, 'E-posta', { max: 200, bos: true });
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new ValidationError('E-posta adresi geçersiz.');
    return e;
  },
};

/** Kurumda düzenlenebilen alanlar. */
const ORTAK_ALANLARI = {
  name: v => metin(v, 'Kurum adı', { max: 200 }),
  short: v => metin(v, 'Kısa ad', { max: 40 }),
  oid: v => metin(v, 'OID', { max: 20, bos: true }),
  country: v => {
    const ulkeler = venues.filter(u => u !== VIRTUAL);
    if (!ulkeler.includes(v)) throw new ValidationError(`Ülke şunlardan biri olmalı: ${ulkeler.join(', ')}`);
    return v;
  },
  city: v => metin(v, 'Şehir', { max: 80, bos: true }),
  web: v => adres(v, 'Web adresi'),
};

/** Gelen künye gövdesini doğrular; yalnızca varsayılandan FARKLI alanları döner. */
export function projeDogrula(govde) {
  const fark = {};
  for (const [alan, dogrula] of Object.entries(PROJE_ALANLARI)) {
    if (!(alan in govde)) continue;
    const v = dogrula(govde[alan]);
    if (v !== VARSAYILAN_PROJE[alan]) fark[alan] = v;
  }
  const bas = fark.start ?? VARSAYILAN_PROJE.start;
  const son = fark.end ?? VARSAYILAN_PROJE.end;
  if (bas >= son) throw new ValidationError('Bitiş tarihi başlangıçtan sonra olmalı.');
  /* Sosyal hesaplar: simgeleri koddan geldiği için liste sabittir, yalnızca
     adresler değişir. Boş adres o hesabı gizler. */
  if (Array.isArray(govde.sosyal)) {
    const adresler = {};
    for (const h of VARSAYILAN_PROJE.sosyal) {
      const gelen = govde.sosyal.find(s => s?.id === h.id);
      const url = gelen ? adres(gelen.url, h.ad) : h.url;
      if (url !== h.url) adresler[h.id] = url;
    }
    if (Object.keys(adresler).length) fark.sosyal = adresler;
  }
  return fark;
}

export function ortakDogrula(id, govde) {
  const varsayilan = VARSAYILAN_ORTAKLAR.find(p => p.id === id);
  if (!varsayilan) throw new ValidationError('Kurum bulunamadı.');
  const fark = {};
  for (const [alan, dogrula] of Object.entries(ORTAK_ALANLARI)) {
    if (!(alan in govde)) continue;
    const v = dogrula(govde[alan]);
    if (v !== (varsayilan[alan] ?? '')) fark[alan] = v;
  }
  return fark;
}

/* --- Görünüm (tema) --------------------------------------------------------
   Renkler client/src/styles/style.css'teki :root değişkenleridir; buradaki
   değerler oradakilerin kopyasıdır (varsayılan). Değişen renkler sunucunun
   ürettiği tema.css ile ezilir; hiçbir şey değişmediyse sayfaya tema.css
   eklenmez, site derlemedeki hâliyle kalır. */
export const TEMA_RENKLERI = {
  yesil: '#1f7f55', 'yesil-koyu': '#145f40', 'yesil-acik': '#46aa76',
  mavi: '#0f2a4a', 'mavi-acik': '#1084c2', filiz: '#8cc152',
  zemin: '#f6f8fa', kart: '#ffffff', murekkep: '#0f1f33', metin: '#475669', soluk: '#647488',
  wp1: '#5b6b7a', wp2: '#2f6fbf', wp3: '#7453b8', wp4: '#0e8a9e',
};
/* Dış yazı tipi yüklenemez (CSP 'self'): yalnızca sistem yazı tipleri. */
export const TEMA_YAZILARI = {
  sistem: '"Segoe UI", system-ui, -apple-system, sans-serif',
  yuvarlak: '"Trebuchet MS", "Segoe UI", system-ui, sans-serif',
  genis: 'Verdana, Tahoma, "Segoe UI", sans-serif',
  tirnakli: 'Georgia, Cambria, "Times New Roman", serif',
};
const HEX = /^#[0-9a-f]{6}$/;

export function temaDogrula(govde) {
  const fark = {};
  for (const [ad, vars] of Object.entries(TEMA_RENKLERI)) {
    if (!(ad in (govde || {}))) continue;
    const v = String(govde[ad]).trim().toLowerCase();
    if (!HEX.test(v)) throw new ValidationError(`Renk (${ad}) #rrggbb biçiminde olmalı.`);
    if (v !== vars) fark[ad] = v;
  }
  if ('yazi' in (govde || {})) {
    if (!(govde.yazi in TEMA_YAZILARI)) throw new ValidationError('Yazı tipi geçersiz.');
    if (govde.yazi !== 'sistem') fark.yazi = govde.yazi;
  }
  return fark;
}

let tema = { fark: {}, css: '', surum: '' };
export const temaBilgisi = () => tema;

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ');
function temaUret(fark) {
  if (!Object.keys(fark).length) return { fark, css: '', surum: '' };
  const r = { ...TEMA_RENKLERI, ...fark };
  const satir = [];
  for (const ad of Object.keys(TEMA_RENKLERI)) if (fark[ad]) satir.push(`  --${ad}: ${fark[ad]};`);
  if (fark.yazi) satir.push(`  --yazi: ${TEMA_YAZILARI[fark.yazi]};`);
  /* :root:root — derlemedeki :root'tan özgül; dosya sırası önemsizleşir. */
  let css = `/* Yönetim → Görünüm. Otomatik üretilir. */\n:root:root {\n${satir.join('\n')}\n}\n`;
  /* Varsayılan temanın türetilmiş değerleri (ikinci tema kendininkini tutar). */
  const turev = [];
  if (fark.yesil) turev.push(`  --vurgu-rgb: ${rgb(r.yesil)};`);
  if (fark.mavi || fark['mavi-acik']) {
    turev.push(`  --bant: linear-gradient(100deg, color-mix(in srgb, ${r.mavi} 70%, #000) 0%, ${r.mavi} 35%, color-mix(in srgb, ${r.mavi} 45%, ${r['mavi-acik']}) 78%, ${r['mavi-acik']} 100%);`);
    turev.push(`  --bant-golge: rgba(${rgb(r.mavi)}, .25);`);
  }
  if (turev.length) css += `:root:not([data-tema="yesil"]) {\n${turev.join('\n')}\n}\n`;
  return { fark, css, surum: createHash('sha256').update(css).digest('hex').slice(0, 12) };
}

/** Varsayılanlar + kaydedilen farklar → PROJECT ve partners (yerinde). */
function uygula(ayarlar) {
  tema = temaUretGuvenli(ayarlar.tema);
  const proje = ayarlar.proje || {};
  const { sosyal, ...duz } = proje;
  for (const alan of Object.keys(PROJE_ALANLARI)) PROJECT[alan] = alan in duz ? duz[alan] : VARSAYILAN_PROJE[alan];
  PROJECT.sosyal = VARSAYILAN_PROJE.sosyal
    .map(h => ({ ...h, url: sosyal && h.id in sosyal ? sosyal[h.id] : h.url }))
    .filter(h => h.url);
  for (const p of partners) {
    const v = VARSAYILAN_ORTAKLAR.find(o => o.id === p.id);
    const f = ayarlar[`ortak.${p.id}`] || {};
    for (const alan of Object.keys(ORTAK_ALANLARI)) p[alan] = alan in f ? f[alan] : v[alan];
  }
  try { menu = menuDogrula(ayarlar.menu || {}); } catch { menu = menuDogrula({}); }
  kurallariUygula(ayarlar.kurallar);
  listeAdlari = listeleriUygula(ayarlar.listeler);
}

/* --- Menü -------------------------------------------------------------------
   Üst menünün sırası ve gizlenen maddeler. Maddelerin kendisi istemcide
   (client/src/bilesenler/Kabuk.jsx · MENU, ZIYARETCI_MENU); buradaki adlar
   onların `anahtar`ıdır ve iki liste birlikte güncellenmelidir. Madde adları
   Yönetim → Metinler'den değişir (menu.*, tanitim.menu.*). Gizlemek yalnızca
   menüden kaldırır; sayfanın yetkisi değişmez. Yönetim maddesi gizlenemez. */
export const MENU_ANAHTARLARI = {
  uye: ['menu.pano', 'menu.bulten', 'menu.anasayfa', 'menu.takvim', 'menu.ciktilar', 'menu.ekip', 'menu.formlar',
    'menu.belgeler', 'menu.klasorler', 'menu.drive', 'menu.kullanicilar', 'menu.yonetim'],
  ziyaretci: ['tanitim.menu.hakkinda', 'tanitim.menu.ciktilar', 'tanitim.menu.yol', 'tanitim.menu.ortaklar',
    'tanitim.menu.iletisim', 'menu.bulten'],
};
const GIZLENEMEZ = ['menu.yonetim'];

/** { uye: { sira, gizli }, ziyaretci: { sira, gizli } } — bilinmeyen ad atılır. */
export function menuDogrula(govde) {
  const sonuc = {};
  for (const [liste, adlar] of Object.entries(MENU_ANAHTARLARI)) {
    const g = govde?.[liste] || {};
    if (g.sira != null && !Array.isArray(g.sira)) throw new ValidationError('Menü sırası liste olmalı.');
    if (g.gizli != null && !Array.isArray(g.gizli)) throw new ValidationError('Gizli maddeler liste olmalı.');
    const sira = [...new Set((g.sira || []).filter(a => adlar.includes(a)))];
    for (const a of adlar) if (!sira.includes(a)) sira.push(a);
    const gizli = [...new Set((g.gizli || []).filter(a => adlar.includes(a) && !GIZLENEMEZ.includes(a)))];
    sonuc[liste] = { sira, gizli };
  }
  return sonuc;
}
let menu = menuDogrula({});
export const menuAyari = () => menu;

/* --- Görseller -------------------------------------------------------------
   Değiştirilebilen görseller: derlenmiş arayüzün kökündeki logo ve görseller
   (dist/*.png|svg|jpg) ile her kurumun belge logosu (kurum-logo-<kod>.png;
   dosyası olmayan kurum için de yüklenebilir). */
const GORSEL_UZANTI = /\.(png|jpe?g|svg|webp|gif)$/i;
export function gorselAdlari() {
  let dist = [];
  try { dist = readdirSync(new URL('../dist/', import.meta.url)).filter(a => GORSEL_UZANTI.test(a) && !a.startsWith('kurum-logo-')); }
  catch { /* derleme yok */ }
  return [...new Set([...dist, ...partners.map(p => `kurum-logo-${p.id}.png`)])].sort();
}
export const MAX_GORSEL = 5 * 1024 * 1024;

/** Yüklenen dosyanın türü: raster biçimler baytlardan, SVG metinden. */
export function gorselTuru(veri) {
  const raster = sniffPhoto(veri);
  if (raster) return raster;
  const bas = veri.subarray(0, 2048).toString('utf8').replace(/^﻿/, '').trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(bas)) return 'image/svg+xml';
  return null;
}

/* Bellekteki görsel kopyaları: her istekte veritabanına gidilmesin. */
const gorseller = new Map();
export const ozelGorsel = ad => gorseller.get(ad);

const etiket = veri => '"' + createHash('sha256').update(veri).digest('hex').slice(0, 32) + '"';

/** Veritabanından her şeyi okuyup uygular. Açılışta ve her değişiklikten sonra. */
export async function siteYukle(db) {
  const ayarlar = {};
  for (const r of await db.all('SELECT anahtar,deger FROM site_ayar')) {
    try { ayarlar[r.anahtar] = JSON.parse(r.deger); } catch { /* bozuk satır: varsayılan */ }
  }
  uygula(ayarlar);

  /* Sözlük katmanları: dosya < Listeler sekmesindeki adlar < Metinler sekmesi. */
  const metinler = structuredClone(listeAdlari);
  for (const r of await db.all('SELECT dil,anahtar,deger FROM site_metin')) (metinler[r.dil] ||= {})[r.anahtar] = r.deger;
  ozelMetinleriAyarla(metinler);

  gorseller.clear();
  for (const r of await db.all('SELECT ad,tur,veri,updated FROM site_gorsel')) {
    const veri = Buffer.isBuffer(r.veri) ? r.veri : Buffer.from(r.veri);
    gorseller.set(r.ad, { tur: r.tur, veri, updated: r.updated, etag: etiket(veri) });
  }
  return ayarlar;
}

/* Bozuk ya da eski bir kayıt siteyi düşürmesin: geçersizse varsayılan tema. */
function temaUretGuvenli(kayit) {
  try { return temaUret(temaDogrula(kayit || {})); } catch { return temaUret({}); }
}

export const varsayilanProje = () => VARSAYILAN_PROJE;
export const varsayilanOrtak = id => VARSAYILAN_ORTAKLAR.find(p => p.id === id);

/* --- Kurallar ---------------------------------------------------------------
   Sınırlar ve yetkiler (lib/data.mjs · KURALLAR). Üst sınırlar sunucunun
   belleğini korur: yüklenen dosya istek boyunca bellekte tutulur.
   Kullanıcı isteği (26 Kasım 2026): "bülteni hbv ve bte ekibi düzenleyebilsin"
   — bultenKurumlari'ndaki kurumların bütün hesapları ve yönetici düzenler;
   başka kurumun koordinatörü de dahil kimse düzenleyemez. */
const VARSAYILAN_KURALLAR = structuredClone(KURALLAR);
const AY = /^\d{4}-(0[1-9]|1[0-2])$/;
export const KURAL_SINIRLARI = {
  minParola: [8, 64], fotoMb: [1, 20], etkinlikFoto: [1, 50], formDosyaMb: [1, 50],
  klasorMb: [1, 100], driveMb: [1, 200], bultenAylikFoto: [1, 100], bultenVideoMb: [1, 100],
};

export function kurallarDogrula(govde) {
  const fark = {};
  const g = govde || {};
  for (const [ad, [min, max]] of Object.entries(KURAL_SINIRLARI)) {
    if (!(ad in g)) continue;
    const v = tamSayi(g[ad], ad, min, max);
    if (v !== VARSAYILAN_KURALLAR[ad]) fark[ad] = v;
  }
  if ('bultenIlkAy' in g) {
    const v = String(g.bultenIlkAy);
    if (!AY.test(v)) throw new ValidationError('Bültenin ilk ayı YYYY-AA biçiminde olmalı.');
    if (v !== VARSAYILAN_KURALLAR.bultenIlkAy) fark.bultenIlkAy = v;
  }
  if ('bultenKurumlari' in g) {
    if (!Array.isArray(g.bultenKurumlari)) throw new ValidationError('Kurum listesi geçersiz.');
    const ids = partners.map(p => p.id);
    const v = ids.filter(id => g.bultenKurumlari.includes(id));
    if (v.join() !== VARSAYILAN_KURALLAR.bultenKurumlari.join()) fark.bultenKurumlari = v;
  }
  return fark;
}
function kurallariUygula(kayit) {
  let fark = {};
  try { fark = kurallarDogrula(kayit || {}); } catch { /* bozuk kayıt: varsayılan */ }
  Object.assign(KURALLAR, structuredClone(VARSAYILAN_KURALLAR), fark);
  return fark;
}
export const varsayilanKurallar = () => VARSAYILAN_KURALLAR;

export const bultenYetkili = user => !!user && (!!user.yonetici || KURALLAR.bultenKurumlari.includes(user.partner));

/* --- Sabit listeler ---------------------------------------------------------
   İş paketleri, etkinlik türleri ve ülkeler (lib/data.mjs). Kayıt TAM listedir:
   [{ id, tr, en }] — sıra ve adlar. Diziler YERİNDE güncellenir; doğrulama ve
   açılış verisi aynı diziyi okur. Ad boşsa dosyadaki çeviri kullanılır; yeni
   maddenin öbür dilleri Türkçe adı gösterir (sözlük Türkçeye düşer).
   Silme kullanılmayan maddeyle sınırlıdır (routes/yonetim.mjs); "Çevrim içi"
   (VIRTUAL) yer olarak hep kalır ve listede gösterilmez. */
export const LISTE_TANIMI = {
  wp: { kalip: /^WP\d{1,2}$/, ornek: 'WP5', dizi: () => workPackages.map(w => w.id),
    anahtarlar: (id, ad) => ({ [`wp.${id}.ad`]: `${id} · ${ad}`, [`wp.${id}.kisa`]: ad }) },
  tur: { kalip: /^[a-z][a-z0-9]{1,19}$/, ornek: 'atolye', dizi: () => [...types],
    anahtarlar: (id, ad) => ({ [`tur.${id}`]: ad, [`tur.${id}.kisa`]: ad }) },
  ulke: { kalip: /^[A-Z]{2}$/, ornek: 'ES', dizi: () => venues.filter(v => v !== VIRTUAL),
    anahtarlar: (id, ad) => ({ [`ulke.${id}`]: ad }) },
};
const VARSAYILAN_LISTELER = Object.fromEntries(Object.entries(LISTE_TANIMI).map(([ad, l]) => [ad, l.dizi()]));
export const varsayilanListe = ad => VARSAYILAN_LISTELER[ad];
let listeKaydi = {};
let listeAdlari = {};
export const listeKayitlari = () => listeKaydi;

/** [{ id, tr, en }] doğrular; kimlik tekrarı ve biçim denetlenir. */
export function listeDogrula(ad, govde) {
  const tanim = LISTE_TANIMI[ad];
  if (!tanim) throw new ValidationError('Liste bulunamadı.');
  if (!Array.isArray(govde) || !govde.length) throw new ValidationError('Liste en az bir madde içermeli.');
  if (govde.length > 40) throw new ValidationError('Liste en fazla 40 madde içerebilir.');
  const gorulen = new Set();
  return govde.map(m => {
    const id = String(m?.id ?? '').trim();
    if (!tanim.kalip.test(id)) throw new ValidationError(`Kod geçersiz: "${id}" (örnek: ${tanim.ornek}).`);
    if (gorulen.has(id)) throw new ValidationError(`Kod iki kez kullanılmış: ${id}`);
    gorulen.add(id);
    return { id, tr: metin(m.tr, `${id} Türkçe adı`, { max: 120, bos: true }), en: metin(m.en, `${id} İngilizce adı`, { max: 120, bos: true }) };
  });
}

const yerindeDegistir = (dizi, yeni) => { dizi.splice(0, dizi.length, ...yeni); };

/** Kayıtları dizilere uygular; sözlüğe eklenecek adları döner. */
function listeleriUygula(kayit) {
  listeKaydi = {};
  const adlar = {};
  for (const ad of Object.keys(LISTE_TANIMI)) {
    let liste = null;
    try { if (kayit?.[ad]) liste = listeDogrula(ad, kayit[ad]); } catch { liste = null; }
    if (liste) listeKaydi[ad] = liste;
    const idler = liste ? liste.map(m => m.id) : VARSAYILAN_LISTELER[ad];
    if (ad === 'wp') { yerindeDegistir(workPackages, idler.map(id => ({ id }))); yerindeDegistir(wpIds, idler); }
    if (ad === 'tur') yerindeDegistir(types, idler);
    if (ad === 'ulke') yerindeDegistir(venues, [...idler, VIRTUAL]);
    for (const m of liste || []) {
      for (const dil of ['tr', 'en']) if (m[dil]) Object.assign(adlar[dil] ||= {}, LISTE_TANIMI[ad].anahtarlar(m.id, m[dil]));
    }
  }
  return adlar;
}
