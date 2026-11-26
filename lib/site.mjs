import { readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ValidationError, PROJECT, partners, venues, VIRTUAL, sniffPhoto } from './data.mjs';
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
const ULKELER = venues.filter(v => v !== VIRTUAL);
const ORTAK_ALANLARI = {
  name: v => metin(v, 'Kurum adı', { max: 200 }),
  short: v => metin(v, 'Kısa ad', { max: 40 }),
  oid: v => metin(v, 'OID', { max: 20, bos: true }),
  country: v => { if (!ULKELER.includes(v)) throw new ValidationError(`Ülke şunlardan biri olmalı: ${ULKELER.join(', ')}`); return v; },
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

/** Varsayılanlar + kaydedilen farklar → PROJECT ve partners (yerinde). */
function uygula(ayarlar) {
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
}

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

  const metinler = {};
  for (const r of await db.all('SELECT dil,anahtar,deger FROM site_metin')) (metinler[r.dil] ||= {})[r.anahtar] = r.deger;
  ozelMetinleriAyarla(metinler);

  gorseller.clear();
  for (const r of await db.all('SELECT ad,tur,veri,updated FROM site_gorsel')) {
    const veri = Buffer.isBuffer(r.veri) ? r.veri : Buffer.from(r.veri);
    gorseller.set(r.ad, { tur: r.tur, veri, updated: r.updated, etag: etiket(veri) });
  }
  return ayarlar;
}

export const varsayilanProje = () => VARSAYILAN_PROJE;
export const varsayilanOrtak = id => VARSAYILAN_ORTAKLAR.find(p => p.id === id);
