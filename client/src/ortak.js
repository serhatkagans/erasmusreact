/**
 * Tüm sayfaların paylaştığı durum ve yardımcılar.
 *
 * Açılış verisi (`/api/acilis`: sözlük, proje künyesi, listeler, oturum)
 * uygulama çizilmeden ÖNCE bir kez çekilir ve `durum` nesnesine yazılır
 * (bkz. main.jsx). Dil ya da oturum değiştiğinde sayfa baştan yüklenir —
 * sunucu dili çereze, oturumu çereze yazar; bu yüzden `durum` bir sayfa
 * açılışı boyunca sabittir ve bileşenler onu doğrudan okuyabilir.
 *
 * ÇEVİRİ: arayüzde metin yazılmaz, anahtar yazılır: `t('anasayfa.baslik')`.
 * Yeni bir dil eklemek yalnızca `locales/<kod>.json` yazmaktır.
 */

export const durum = {
  dil: 'tr',
  sozluk: {},
  proje: null,
  ortaklar: [],
  ispaketleri: [],
  turler: [],
  durumlar: [],
  yerler: [],
  diller: [],
  kullanici: null,
  minParola: 12,
};

/** Sözlükten metin. `%{n}` gibi yer tutucular `degerler` ile doldurulur. */
export function t(anahtar, degerler) {
  let metin = durum.sozluk[anahtar];
  /* Anahtarın kendisi görünürse çeviri eksiği hemen fark edilir; boş
     bırakmak sessizce bozuk bir arayüz üretirdi. */
  if (metin == null) return anahtar;
  if (degerler) for (const [ad, deger] of Object.entries(degerler)) metin = metin.replaceAll(`%{${ad}}`, deger);
  return metin;
}

export const ortakAdi = id => durum.ortaklar.find(o => o.id === id)?.name || id;
export const ortakKisa = id => durum.ortaklar.find(o => o.id === id)?.short || id;
export const yerAdi = kod => t(`ulke.${kod}`);

/** Resmî aktivitelerin başlığı sözlükten, ortakların eklediği etkinliklerin
 *  başlığı kayıttan gelir — aynı listede yan yana durabilsinler diye. */
export const etkinlikBaslik = e => (e.slug && durum.sozluk[`etkinlik.${e.slug}.baslik`]) || e.baslik || e.kod || e.wp;
export const etkinlikOzet = e => (e.slug && durum.sozluk[`etkinlik.${e.slug}.ozet`]) || e.ozet || '';

/* --- Tarih biçimlendirme ------------------------------------------------
   Intl, seçili dile göre ay adlarını kendi verir. Tarihler UTC olarak
   saklanır ve UTC olarak gösterilir: yerel saat dilimi uygulanırsa gün
   kayabilir. */
const bicim = (secenek) => new Intl.DateTimeFormat(durum.dil, { timeZone: 'UTC', ...secenek });
export const gunAy = gun => bicim({ day: 'numeric', month: 'long' }).format(new Date(gun + 'T00:00:00Z'));
export const tamTarih = gun => bicim({ day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(gun + 'T00:00:00Z'));
export const ayYil = (yil, ay) => bicim({ month: 'long', year: 'numeric' }).format(new Date(Date.UTC(yil, ay, 1)));

/**
 * "15–16 Aralık 2026" gibi: ortak olan ay ve yıl tekrarlanmaz. Aralığı
 * Intl kurar, çünkü SIRA DİLE GÖRE DEĞİŞİR ("December 15 – 16, 2026").
 */
export function tarihAraligi(baslangic, bitis) {
  if (baslangic === bitis) return tamTarih(baslangic);
  return bicim({ day: 'numeric', month: 'long', year: 'numeric' })
    .formatRange(new Date(baslangic + 'T00:00:00Z'), new Date(bitis + 'T00:00:00Z'));
}

export const bugun = () => new Date().toISOString().slice(0, 10);
export const gunFarki = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
export const gunEkle = (gun, n) => new Date(Date.parse(gun + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

/* --- Sunucu çağrıları ----------------------------------------------------
   Adresler GÖRELİDİR (`api/...`): uygulama alt dizinde de çalışır. */
export async function iste(yol, secenek = {}) {
  const yanit = await fetch(yol, {
    headers: secenek.body && typeof secenek.body === 'string' ? { 'Content-Type': 'application/json' } : undefined,
    ...secenek,
  });
  const veri = await yanit.json().catch(() => ({}));
  if (!yanit.ok) {
    /* Sunucu bazı hataları çeviri anahtarı olarak döndürür (ör. giris.hata);
       sözlükte karşılığı varsa o gösterilir, yoksa metin olduğu gibi. */
    const hata = new Error(durum.sozluk[veri.error] || veri.error || t('genel.hata'));
    hata.durum = yanit.status;
    hata.veri = veri;
    throw hata;
  }
  return veri;
}

/** Sunucu hatasının çevirisi (fetch'i kendisi yapan yerler için). */
export const hataMetni = veri => durum.sozluk[veri?.error] || veri?.error || t('genel.hata');

/** Bayt sayısını okunur boyuta çevirir (dile göre birim). */
export const boyutYaz = b => new Intl.NumberFormat(durum.dil, { style: 'unit', unit: b >= 1048576 ? 'megabyte' : 'kilobyte', maximumFractionDigits: 1 })
  .format(b >= 1048576 ? b / 1048576 : Math.max(b / 1024, 0.1));

/** Ad soyadın baş harfleri: "Serhat Kağan Şahin" → "SŞ". */
export const basHarfler = ad => (ad || '').trim().split(/\s+/).filter(Boolean)
  .filter((_, i, dizi) => i === 0 || i === dizi.length - 1)
  .map(s => s[0]).join('').toLocaleUpperCase(durum.dil);
