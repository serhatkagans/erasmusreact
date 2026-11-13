import { ValidationError, partnerOf } from './data.mjs';

/**
 * Katılım ve teşekkür belgesi kuralları.
 *
 * GençTek'teki belge yolundan uyarlandı. İKİ ŞEY BİLEREK DEĞİŞTİ:
 *
 *   · ÖN KOŞUL KAPISI KALDIRILDI. Orada belge, etkinlik raporu yazılmadan ve
 *     kişi yoklamada "geldi" işaretlenmeden üretilemiyordu; belge bir
 *     katılımın kanıtıydı ve kişinin profiline katılım düşürüyordu. Burada
 *     öyle bir bağ yok: ortaklık 24 aylık bir proje, ekipler belli ve
 *     koordinatör belgeyi ETKİNLİKTEN BAĞIMSIZ olarak, istediği zaman
 *     üretebilmeli (ör. proje sonunda ekibe toplu katılım belgesi).
 *
 *   · ALICI SERBEST METİN DEĞİL, LİSTEDEN gelir. Ülkeler ve kişiler zaten
 *     kayıtlı (ortak kurumlar + `team` tablosu); ad elle yazıldığında yazım
 *     hataları belgeye geçer ve aynı kişi iki farklı adla belgelenir.
 *     Listede olmayan konuşmacı/destekçi için serbest ad yine mümkün — o
 *     kişinin kaydı yoktur ve olması da beklenmez.
 *
 * Belgenin METNİ VERİTABANINDA TUTULMAZ: her istekte kayıtlardan üretilir.
 * Ayrı bir tablo aynı bilgiyi ikinci kez saklayıp güncel tutma zorunluluğu
 * doğururdu — kişinin adı düzeltildiğinde eski belge eski adı göstermeye
 * devam ederdi. "Kaydet" (kullanıcı isteği, 13 Kasım 2026: sonradan kontrol,
 * çıktı ve düzenleme) bu yüzden yalnızca belgenin AYARLARINI saklar
 * (`belge_kayit`, bkz. kayitAyariniCoz); açılınca belge yeniden üretilir.
 *
 * Saf tutulur: veritabanına bakmaz, metni sözlükten kurar (bkz. lib/i18n.mjs).
 */

export const belgeTurleri = ['katilim', 'tesekkur'];
export const belgeTuruMu = deger => belgeTurleri.includes(deger);

/**
 * Tek yazdırma işleminde üretilebilecek azami belge sayısı.
 *
 * Sınırın nedeni tarayıcı: her belge tam bir A4 sayfası demek ve yazdırma
 * önizlemesi birkaç yüz sayfada donuyor. Sunucuda bir maliyeti yok, bu yüzden
 * sınır sorguda değil burada.
 */
export const MAX_BELGE = 200;

const AD_MAKS = 120;
const UNVAN_MAKS = 120;
const OZEL_METIN_MAKS = 1200;

/** Bağlantısız boşluk (U+00A0): tarayıcı buradan satır kırmaz. */
const BOLUNMEZ = ' ';

/**
 * Tarihi BÖLÜNMEZ yapar: "15 Aralık 2026" satır sonunda ikiye ayrılmasın —
 * "15" üst satırda, "Aralık 2026" alt satırda kalmasın. GençTek'te aynı
 * sorun yaşanmış ve çözüm oradan alındı.
 */
const tarihiBolunmezYap = tarih => String(tarih).trim().replace(/\s+/g, BOLUNMEZ);

/**
 * Belge alıcısının adını doğrular.
 *
 * Listeden gelen adlar VERİTABANINDAN çözülür (bkz. routes/belge.mjs);
 * buraya yalnızca son temizlik için uğrarlar. Serbest yazılan ad da aynı
 * kurallardan geçer.
 */
export function aliciAdiniCoz(ham) {
  const ad = String(ham ?? '').trim().replace(/\s+/g, ' ');
  if (!ad) throw new ValidationError('belge.hata.alici');
  if (ad.length > AD_MAKS) throw new ValidationError('belge.hata.adUzun');
  return ad;
}

/**
 * İmza bloğunu doğrular.
 *
 * AD ZORUNLU: imzasız bir katılım belgesi resmî olarak işe yaramaz ve boş
 * geçilmesine izin vermek, farkına varılmadan imzasız belge dağıtılmasına yol
 * açardı. Unvan boş bırakılabilir — o zaman önerilen unvan kullanılır
 * (koordinatör kurumun projedeki sıfatı).
 *
 * İmza OTURUM KİŞİSİNDEN GELMEZ: belgeyi hazırlayan kişi ile imzalayan makam
 * aynı olmayabilir. GençTek'te bu bir kez oturumdan alınmış ve geri
 * alınmıştı; aynı hatayı tekrarlamıyoruz.
 */
export function imzaBilgisiniCoz({ ad, unvan, varsayilanUnvan }) {
  const adSoyad = String(ad ?? '').trim().replace(/\s+/g, ' ');
  if (!adSoyad) throw new ValidationError('belge.hata.imza');
  if (adSoyad.length > AD_MAKS) throw new ValidationError('belge.hata.adUzun');

  const sifat = String(unvan ?? '').trim().replace(/\s+/g, ' ') || String(varsayilanUnvan ?? '');
  if (sifat.length > UNVAN_MAKS) throw new ValidationError('belge.hata.unvanUzun');
  return { adSoyad, unvan: sifat };
}

/** İsimsiz yedek belge sayısı: boş = 0; yalnızca 0…MAX_BELGE arası tam sayı. */
export function bosSayisiniCoz(ham) {
  const metin = String(ham ?? '').trim();
  if (!metin) return 0;
  if (!/^\d{1,3}$/.test(metin) || Number(metin) > MAX_BELGE) throw new ValidationError('belge.hata.bos');
  return Number(metin);
}

export function ozelMetniCoz(ham) {
  const metin = String(ham ?? '').trim();
  if (metin.length > OZEL_METIN_MAKS) throw new ValidationError('belge.hata.metinUzun');
  return metin;
}

/**
 * Özel metindeki yer tutucular, her alıcının kendi bilgisiyle doldurulur.
 *
 * Özel metin TÜM belgelerde aynıdır; ama "from [Kurum Adı], participated…"
 * gibi bir cümle kişiye göre değişmeli (kullanıcı isteği, 13 Kasım 2026:
 * TPM1 katılım belgesinde kurum adı cümlenin içinde geçiyor). Kullanıcının
 * kendi yazdığı köşeli parantez biçimi esas alındı; İngilizce karşılıkları
 * da tanınır, büyük/küçük harf fark etmez.
 *
 * Değeri olmayan yer tutucu (ör. serbest adla eklenen kişinin kurumu) BOŞ
 * kalır; "[Kurum Adı]" yazısının belgeye basılmasından iyidir. Tanınmayan
 * köşeli parantezler olduğu gibi bırakılır.
 */
const YER_TUTUCULAR = {
  ad: ['ad soyad', 'ad', 'name', 'full name'],
  kurum: ['kurum adı', 'kurum adi', 'kurum', 'organisation', 'organization', 'institution'],
  ulke: ['ülke', 'ulke', 'country'],
};

const YER_TUTUCU = /\[([^\[\]\n]{1,40})\]/g;

const yerTutucuAlani = ic => {
  const ham = ic.trim().replace(/\s+/g, ' ');
  /* Türkçe küçültme "KURUM ADI"yı doğru çevirir ama "ORGANISATION"daki I'yı
     ı yapar; ikisi de denenir. */
  const adlar = [ham.toLocaleLowerCase('tr'), ham.toLowerCase()];
  return Object.keys(YER_TUTUCULAR).find(k => adlar.some(a => YER_TUTUCULAR[k].includes(a)));
};

export function yerTutucuVarMi(metin, alan) {
  return [...String(metin).matchAll(YER_TUTUCU)].some(m => yerTutucuAlani(m[1]) === alan);
}

export function yerTutuculariDoldur(metin, degerler) {
  return String(metin).replace(YER_TUTUCU, (tum, ic) => {
    const alan = yerTutucuAlani(ic);
    return alan ? String(degerler[alan] ?? '') : tum;
  });
}

/**
 * Belge metnini üretir.
 *
 * GÖVDE İKİ KALIPTAN BİRİDİR: etkinlik seçilmişse "şu tarihte yapılan şu
 * etkinliğe", seçilmemişse projenin kendisine. İkincisi bu projeye özgü ve
 * asıl istenen: koordinatör, bir etkinliğe bağlı olmadan da belge
 * üretebilmeli.
 *
 * KAPANIŞ TÜRE GÖRE AYRIDIR ve ortaklaştırılmamalıdır: katılım belgesi
 * yalnızca orada bulunmayı belgeler, teşekkür belgesi destek verene yazılır.
 * GençTek'te bir kez ortaklaştırılıp aynı gün geri alınmıştı — ortak cümle
 * katılım belgesinde olmayan bir şeyi ("desteğiniz") söylüyordu.
 *
 * TARİH KENDİ SATIRINDA başlar ve bölünmez; satır sonu belgede korunur
 * (bkz. public/belge.css · white-space: pre-line).
 */
/**
 * İSİMSİZ (YEDEK) BELGE: adı elle yazılmak üzere boş basılır (kullanıcı
 * isteği, 13 Kasım 2026: etkinlikte listede olmayan biri çıktığında elde
 * yedek belge bulunsun). Kâğıtta ad yerine boş bir yazı çizgisi durur; özel
 * metindeki [Ad] / [Kurum Adı] / [Ülke] yer tutucuları da elle doldurulacak
 * birer boşluk olur. Boş bırakılsalardı "from , participated" gibi kırık bir
 * cümle basılırdı.
 */
export const BOS_ALAN = '________________________';

export function belgeMetniUret({ tur, ad, altAd = '', kurum = '', ulke = '', etkinlik = null, ozelMetin = '', baslik = '', giris = '', bos = false, t }) {
  const doldur = bos ? { ad: BOS_ALAN, kurum: BOS_ALAN, ulke: BOS_ALAN } : { ad, kurum, ulke };
  const govde = ozelMetin
    ? yerTutuculariDoldur(ozelMetin, doldur)
    : etkinlik
      ? t(`belge.govde.${tur}.etkinlik`, { tarih: tarihiBolunmezYap(etkinlik.tarih), etkinlik: etkinlik.baslik })
      : t(`belge.govde.${tur}.proje`);

  /* Kurum özel metnin içinde geçiyorsa ("from [Kurum Adı], …") adın altındaki
     kurum satırı gizlenir; yoksa kurum belgede iki kez yazılırdı. */
  const kurumMetinde = !!ozelMetin && yerTutucuVarMi(ozelMetin, 'kurum');
  return {
    tur,
    /* Başlık ve giriş satırı elle yazılabilir (kullanıcı isteği, 13 Kasım
       2026: "CERTIFICATE OF ATTENDANCE" / "This is to acknowledge and
       honor"); boşsa sözlükteki kalıp kullanılır. */
    baslik: baslik || t(`belge.tur.${tur}`),
    giris,
    ad: bos ? '' : ad,
    altAd: bos || kurumMetinde ? '' : altAd,
    govde,
    ...(bos && { bos: true }),
  };
}

/**
 * Belge basılacak kişileri belirler.
 *
 * `adaylar` kayıtlı ekip üyeleri ve ortak kurumlardır; istenen kimlikler
 * DAİMA bu listeyle kesiştirilir — adres çubuğuna elle kimlik yazan biri
 * listede olmayan birine belge bastıramasın. Serbest yazılan adlar bu
 * kesişimin dışındadır: onların kaydı zaten yoktur.
 *
 * Sıra öngörülebilir olmak zorunda: basılan deste elle dağıtılırken listeyle
 * eşleşmeli. Sıralama seçili dile göre yapılır — Türkçede "ı" harfi "i"den
 * öncedir, varsayılan sıralama bunu bilmez.
 */
export function topluAlicilariSec({ adaylar, istenenler, serbest = [], bos = 0, dil = 'tr' }) {
  const secilen = adaylar.filter(aday => istenenler.includes(aday.anahtar));
  /* İsimsiz yedekler destenin SONUNA eklenir: adlı belgeler listeyle
     eşleşerek dağıtılırken araya boş kâğıt girmesin. */
  const hepsi = [
    ...[...secilen, ...serbest].sort((a, b) => a.ad.localeCompare(b.ad, dil)),
    ...Array.from({ length: bos }, () => ({ anahtar: null, ad: '', altAd: '', bos: true })),
  ];
  if (!hepsi.length) throw new ValidationError('belge.hata.secimyok');
  if (hepsi.length > MAX_BELGE) throw new ValidationError('belge.hata.sinir');
  return hepsi;
}

/**
 * Kayıtlı belgenin ayarları: `/api/belge` sorgusunun kendisi.
 *
 * Belge zaten bu sorgudan üretildiği için ayrı bir biçim icat edilmedi;
 * kayıt açılınca aynı sorgu yeniden çalıştırılır. Yalnızca belgeyi
 * etkileyen alanlar tutulur ve SIRA SABİTLENİR: aynı ayar iki kez
 * kaydedildiğinde aynı metin çıksın. Değerlerin doğruluğu burada değil,
 * kaydetmeden önce belge gerçekten üretilerek denetlenir (routes/belge.mjs).
 */
export const KAYIT_ALANLARI = ['tur', 'etkinlik', 'alicilar', 'ad', 'bos', 'imzaAd', 'imzaUnvan', 'baslik', 'giris', 'metin'];
const KAYIT_AYAR_MAKS = 20000;
const KAYIT_AD_MAKS = 120;

export function kayitAyariniCoz(ham) {
  const metin = String(ham ?? '');
  if (!metin || metin.length > KAYIT_AYAR_MAKS) throw new ValidationError('belge.hata.kayit');
  const gelen = new URLSearchParams(metin);
  const temiz = new URLSearchParams({ tur: gelen.get('tur')?.trim() || 'katilim' });
  for (const alan of KAYIT_ALANLARI.slice(1)) {
    for (const deger of gelen.getAll(alan)) if (String(deger).trim()) temiz.append(alan, deger);
  }
  return temiz;
}

export function kayitAdiniCoz(ham) {
  const ad = String(ham ?? '').trim().replace(/\s+/g, ' ');
  if (!ad) throw new ValidationError('belge.hata.kayitAd');
  if (ad.length > KAYIT_AD_MAKS) throw new ValidationError('belge.hata.kayitAdUzun');
  return ad;
}

/**
 * İmza için önerilen unvan: belgeyi üreten kişinin kurumu projedeki sıfatıyla
 * yazılır (koordinatör kurum ya da ortak kurum). Kişinin adı önerilmez —
 * imzalayan makam ile belgeyi hazırlayan aynı kişi olmayabilir.
 */
export function imzaUnvaniOner(user, t) {
  const kurum = partnerOf(user.partner);
  if (!kurum) return t('belge.imza.unvan.varsayilan');
  return t(user.koordinator ? 'belge.imza.unvan.koordinator' : 'belge.imza.unvan.ortak', { kurum: kurum.name });
}
