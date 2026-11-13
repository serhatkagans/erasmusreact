import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ValidationError, PROJECT } from '../lib/data.mjs';
import {
  belgeTuruMu, belgeMetniUret, aliciAdiniCoz, imzaBilgisiniCoz,
  imzaUnvaniOner, ozelMetniCoz, topluAlicilariSec, MAX_BELGE, yerTutuculariDoldur,
  bosSayisiniCoz, BOS_ALAN, kayitAyariniCoz, kayitAdiniCoz,
} from '../lib/belge.mjs';
import { metinler, donemBilgisi, tarihAraligi } from '../lib/rapor.mjs';
import { loadLocale } from '../lib/i18n.mjs';
import { OFFICIAL, participantsOf } from '../lib/tohum.mjs';

/**
 * Belge ve rapor metin üreticileri.
 *
 * Bu iki dosya SAFTIR: veritabanına bakmaz, metni sözlükten kurar. Bu
 * yüzden gerçek `locales/*.json` ile denenebilirler — ve denenmelidir,
 * çünkü asıl kırılgan nokta ÇEVİRİ ANAHTARLARININ VARLIĞIDIR. Anahtar
 * yoksa `t()` sessizce anahtarın kendisini döndürür ve belgeye
 * "belge.govde.katilim.proje" yazılır; kimse hata almaz.
 */

const sozlukler = { tr: await loadLocale('tr'), en: await loadLocale('en') };
const m = dil => metinler(sozlukler[dil], dil);

const reddeder = (islev, ...arg) => assert.throws(() => islev(...arg), ValidationError);

test('belge türü listesi kapalıdır', () => {
  assert.ok(belgeTuruMu('katilim') && belgeTuruMu('tesekkur'));
  for (const uydurma of ['sertifika', '', 'KATILIM', null]) assert.ok(!belgeTuruMu(uydurma));
});

test('alıcı adı kırpılır, boş ve uzun reddedilir', () => {
  assert.equal(aliciAdiniCoz('  Ana   Popescu '), 'Ana Popescu');
  reddeder(aliciAdiniCoz, '   ');
  reddeder(aliciAdiniCoz, 'A'.repeat(121));
  assert.equal(aliciAdiniCoz('A'.repeat(120)).length, 120);
});

test('imza: ad zorunlu, unvan boşsa önerilen kullanılır', () => {
  /* İmzasız katılım belgesi resmî olarak işe yaramaz. */
  reddeder(imzaBilgisiniCoz, { ad: '', unvan: 'Koordinatör' });
  reddeder(imzaBilgisiniCoz, { ad: 'A'.repeat(121) });
  reddeder(imzaBilgisiniCoz, { ad: 'Ad Soyad', unvan: 'U'.repeat(121) });

  assert.deepEqual(imzaBilgisiniCoz({ ad: ' Ad  Soyad ', unvan: ' Rektör ' }), { adSoyad: 'Ad Soyad', unvan: 'Rektör' });
  assert.deepEqual(
    imzaBilgisiniCoz({ ad: 'Ad Soyad', unvan: '', varsayilanUnvan: 'Proje Koordinatörü' }),
    { adSoyad: 'Ad Soyad', unvan: 'Proje Koordinatörü' });
});

test('önerilen unvan kurumun projedeki sıfatından gelir', () => {
  const t = m('tr').t;
  assert.match(imzaUnvaniOner({ partner: 'hbv', koordinator: true }, t), /Koordinatör/);
  assert.match(imzaUnvaniOner({ partner: 'geoclub', koordinator: false }, t), /GEO CLUB/);
  /* Tanınmayan kurumda çökmez, genel sıfata düşer. */
  assert.equal(imzaUnvaniOner({ partner: 'yok', koordinator: false }, t), t('belge.imza.unvan.varsayilan'));
});

test('özel metin sınırı', () => {
  assert.equal(ozelMetniCoz('  merhaba  '), 'merhaba');
  assert.equal(ozelMetniCoz(undefined), '');
  reddeder(ozelMetniCoz, 'x'.repeat(1201));
});

test('belge gövdesi: etkinlikli ve proje geneli kalıpları ayrıdır', () => {
  const t = m('tr').t;
  const etkinlikli = belgeMetniUret({
    tur: 'katilim', ad: 'Ana Popescu', t,
    etkinlik: { baslik: 'Açılış Toplantısı', tarih: '15 Aralık 2026' },
  });
  const proje = belgeMetniUret({ tur: 'katilim', ad: 'Ana Popescu', t });

  assert.equal(etkinlikli.baslik, t('belge.tur.katilim'));
  assert.match(etkinlikli.govde, /Açılış Toplantısı/);
  assert.notEqual(etkinlikli.govde, proje.govde, 'iki kalıp ayrı olmalı');

  /* Kapanış cümlesi türe göre ayrıdır ve ortaklaştırılmamalıdır: katılım
     belgesi yalnızca orada bulunmayı belgeler, teşekkür belgesi desteği. */
  const tesekkur = belgeMetniUret({ tur: 'tesekkur', ad: 'Ana Popescu', t });
  assert.notEqual(tesekkur.govde, proje.govde);

  /* Hiçbir gövde ham anahtar olmamalı — eksik çeviri sessizce belgeye geçer. */
  for (const metin of [etkinlikli.govde, proje.govde, tesekkur.govde]) {
    assert.ok(!metin.startsWith('belge.'), `çeviri eksik: ${metin}`);
  }
});

test('tarih belgede bölünmez', () => {
  const { govde } = belgeMetniUret({
    tur: 'katilim', ad: 'X', t: m('tr').t,
    etkinlik: { baslik: 'TPM-1', tarih: '15 Aralık 2026' },
  });
  /* Bağlantısız boşluk (U+00A0): "15" üst satırda, "Aralık 2026" alt
     satırda kalmasın. */
  assert.match(govde, /15 Aralık 2026/);
  assert.ok(!govde.includes('15 Aralık 2026'), 'tarihte sıradan boşluk kalmamalı');
});

test('özel metin kalıbın yerine geçer', () => {
  const { govde } = belgeMetniUret({ tur: 'katilim', ad: 'X', ozelMetin: 'Elle yazılmış metin.', t: m('tr').t });
  assert.equal(govde, 'Elle yazılmış metin.');
});

test('toplu seçim adres çubuğundan gelen kimliği kabul etmez', () => {
  const adaylar = [
    { anahtar: 'uye:1', ad: 'Çiğdem Yılmaz' },
    { anahtar: 'uye:2', ad: 'Ana Popescu' },
    { anahtar: 'kurum:hbv', ad: 'Ankara Hacı Bayram Veli Üniversitesi' },
  ];
  /* Listede olmayan kimlik sessizce elenir: kesişim alınır. */
  const secim = topluAlicilariSec({ adaylar, istenenler: ['uye:2', 'uye:999'] });
  assert.deepEqual(secim.map(x => x.anahtar), ['uye:2']);

  /* Hiç seçim yoksa hata; sınır aşılırsa hata. */
  reddeder(topluAlicilariSec, { adaylar, istenenler: ['uye:999'] });
  reddeder(topluAlicilariSec, {
    adaylar: [], istenenler: [],
    serbest: Array.from({ length: MAX_BELGE + 1 }, (_, i) => ({ ad: `Kişi ${i}` })),
  });
});

test('toplu seçim sırası dile göre kurulur', () => {
  const adaylar = [
    { anahtar: 'a', ad: 'Işık Demir' },
    { anahtar: 'b', ad: 'Irmak Kaya' },
  ];
  /* Türkçede "ı" harfi "i"den ÖNCE gelir; varsayılan sıralama bunu bilmez
     ve basılan deste elle dağıtılırken listeyle eşleşmez. */
  const tr = topluAlicilariSec({ adaylar, istenenler: ['a', 'b'], dil: 'tr' }).map(x => x.ad);
  assert.deepEqual(tr, ['Irmak Kaya', 'Işık Demir']);
});

test('rapor dönemi: tam proje, tam ay ve gün aralığı ayrı yazılır', () => {
  const tr = m('tr');
  assert.equal(donemBilgisi(tr, PROJECT.start, PROJECT.end).slug, 'tum-proje');
  assert.equal(donemBilgisi(tr, '2026-10-01', '2026-10-31').slug, '2026-10');
  assert.equal(donemBilgisi(tr, '2026-10-01', '2027-01-31').slug, '2026-10_2027-01');
  assert.equal(donemBilgisi(tr, '2026-10-05', '2026-10-20').slug, '2026-10-05_2026-10-20');
});

test('tarih aralığı dile göre kurulur', () => {
  /* Elle birleştirildiğinde İngilizce çıktı "15–December 16, 2026"
     oluyordu; Intl.formatRange sırayı dile bırakıyor. */
  const tr = tarihAraligi(m('tr'), '2026-12-15', '2026-12-16');
  const en = tarihAraligi(m('en'), '2026-12-15', '2026-12-16');
  assert.match(tr, /Aralık/);
  assert.match(en, /December/);
  assert.notEqual(tr, en);
  /* Tek günlük etkinlikte aralık değil tek tarih yazılır. */
  assert.equal(tarihAraligi(m('tr'), '2026-12-15', '2026-12-15'), m('tr').tamTarih('2026-12-15'));
});

test('resmî aktivitenin adı sözlükten, yerel kaydınki veritabanından gelir', () => {
  const tr = m('tr');
  const resmi = { slug: OFFICIAL[0].slug, baslik: '', kod: OFFICIAL[0].kod, wp: OFFICIAL[0].wp };
  assert.notEqual(tr.baslik(resmi), resmi.kod, 'resmî kaydın adı sözlükte olmalı');
  assert.equal(tr.baslik({ slug: null, baslik: 'Bükreş Çoğaltıcı Etkinliği', kod: '', wp: 'WP4' }), 'Bükreş Çoğaltıcı Etkinliği');
  /* Hiçbiri yoksa koda, o da yoksa iş paketine düşer — boş başlık çıkmaz. */
  assert.equal(tr.baslik({ slug: null, baslik: '', kod: 'X-9', wp: 'WP4' }), 'X-9');
  assert.equal(tr.baslik({ slug: null, baslik: '', kod: '', wp: 'WP4' }), 'WP4');
});

test('başvurudaki 14 resmî aktivite: tarihler, kimlikler ve çevirileri', () => {
  assert.equal(OFFICIAL.length, 14);
  assert.equal(new Set(OFFICIAL.map(a => a.slug)).size, 14, 'slug benzersiz olmalı');

  for (const a of OFFICIAL) {
    assert.ok(a.baslangic <= a.bitis, `${a.slug}: bitiş başlangıçtan önce`);
    /* Program dışına düşen resmî tarih, aynı kuralı kullanıcıya
       uygulayan doğrulamayla çelişirdi. */
    assert.ok(a.baslangic >= PROJECT.start && a.bitis <= PROJECT.end, `${a.slug}: proje dışı tarih`);
    /* Lider kendi etkinliğinde ayrıca katılımcı olarak yazılmaz. */
    assert.ok(!participantsOf(a, ['hbv', 'bte', a.lider]).includes(a.lider));

    /* ÇEVİRİ ANAHTARI EKSİKSE sessizce anahtarın kendisi görünür:
       takvimde "etkinlik.wp2-a1-ihtiyac-analizi.baslik" yazardı. */
    for (const dil of ['tr', 'en']) {
      assert.ok(sozlukler[dil][`etkinlik.${a.slug}.baslik`], `${dil}: ${a.slug} başlığı eksik`);
      assert.ok(sozlukler[dil][`etkinlik.${a.slug}.ozet`], `${dil}: ${a.slug} özeti eksik`);
    }
  }
});

test('yayındaki diller aynı anahtar kümesini taşır', () => {
  /* Bir dilde olup öbüründe olmayan anahtar, o dilde ham anahtar
     görünmesi demek. `/api/ceviri-durumu` bunu sayar; burada kırılır. */
  const tr = Object.keys(sozlukler.tr).sort();
  const en = Object.keys(sozlukler.en).sort();
  assert.deepEqual(en.filter(k => !sozlukler.tr[k]), [], 'Türkçede eksik anahtar');
  assert.deepEqual(tr.filter(k => !sozlukler.en[k]), [], 'İngilizcede eksik anahtar');

  /* Yer tutucular da eşleşmeli: çeviride `%{n}` unutulursa sayı hiç
     yazılmaz ve kimse hata almaz. */
  const tutucular = metin => [...String(metin).matchAll(/%\{(\w+)\}/g)].map(x => x[1]).sort();
  for (const anahtar of tr) {
    assert.deepEqual(tutucular(sozlukler.en[anahtar]), tutucular(sozlukler.tr[anahtar]),
      `${anahtar}: yer tutucular uyuşmuyor`);
  }
});

test('özel metindeki yer tutucular her alıcının bilgisiyle dolar', () => {
  const metin = 'This is to certify that [Ad Soyad] from [Kurum Adı], [Ülke], attended.';
  assert.equal(
    yerTutuculariDoldur(metin, { ad: 'Lisa Morganti', kurum: 'People of 2050', ulke: 'Denmark' }),
    'This is to certify that Lisa Morganti from People of 2050, Denmark, attended.');
  /* İngilizce karşılıklar ve büyük/küçük harf */
  assert.equal(yerTutuculariDoldur('[name] / [ORGANISATION] / [Country]', { ad: 'A', kurum: 'B', ulke: 'C' }), 'A / B / C');
  /* Değeri olmayan boş kalır, tanınmayan köşeli parantez olduğu gibi durur. */
  assert.equal(yerTutuculariDoldur('from [Kurum Adı] [TPM1]', { ad: 'A' }), 'from  [TPM1]');
  /* belgeMetniUret özel metinde yer tutucuları uygular */
  const b = belgeMetniUret({ tur: 'katilim', ad: 'Ana', kurum: 'GEO CLUB', ozelMetin: 'from [Kurum Adı]', t: k => k });
  assert.equal(b.govde, 'from GEO CLUB');
});

test('başlık ve giriş elle yazılabilir; kurum metindeyse alt satır gizlenir', () => {
  const t = k => k;
  const b = belgeMetniUret({ tur: 'katilim', ad: 'Ana', altAd: 'GEO CLUB · Romania', kurum: 'GEO CLUB',
    ozelMetin: 'from [Kurum Adı], participated.', baslik: 'CERTIFICATE OF ATTENDANCE', giris: 'This is to acknowledge and honor', t });
  assert.equal(b.baslik, 'CERTIFICATE OF ATTENDANCE');
  assert.equal(b.giris, 'This is to acknowledge and honor');
  assert.equal(b.altAd, '', 'kurum iki kez yazılmamalı');
  assert.equal(b.govde, 'from GEO CLUB, participated.');
  const v = belgeMetniUret({ tur: 'katilim', ad: 'Ana', altAd: 'GEO CLUB · Romania', ozelMetin: 'participated.', t });
  assert.equal(v.baslik, 'belge.tur.katilim');
  assert.equal(v.altAd, 'GEO CLUB · Romania');
});

test('isimsiz yedek belge: sayı doğrulanır, deste sonuna eklenir, ad boş basılır', () => {
  assert.equal(bosSayisiniCoz(''), 0);
  assert.equal(bosSayisiniCoz(null), 0);
  assert.equal(bosSayisiniCoz('5'), 5);
  for (const yanlis of ['-1', '2.5', 'abc', String(MAX_BELGE + 1)]) {
    assert.throws(() => bosSayisiniCoz(yanlis), ValidationError);
  }

  const adaylar = [{ anahtar: 'uye:1', ad: 'Zeynep' }, { anahtar: 'uye:2', ad: 'Ali' }];
  const deste = topluAlicilariSec({ adaylar, istenenler: ['uye:1', 'uye:2'], bos: 2 });
  assert.deepEqual(deste.map(x => x.ad), ['Ali', 'Zeynep', '', '']);
  assert.ok(deste.slice(2).every(x => x.bos));
  /* Kişi seçmeden yalnızca yedek üretilebilir; sınır yedekleri de sayar. */
  assert.equal(topluAlicilariSec({ adaylar, istenenler: [], bos: 3 }).length, 3);
  assert.throws(() => topluAlicilariSec({ adaylar, istenenler: ['uye:1'], bos: MAX_BELGE }), ValidationError);

  const b = belgeMetniUret({ tur: 'katilim', ad: '', bos: true, kurum: 'X', ozelMetin: 'from [Kurum Adı], [Ad]', t: k => k });
  assert.equal(b.bos, true);
  assert.equal(b.ad, '');
  assert.equal(b.altAd, '');
  assert.equal(b.govde, `from ${BOS_ALAN}, ${BOS_ALAN}`);
  assert.equal(belgeMetniUret({ tur: 'katilim', ad: 'Ana', t: k => k }).bos, undefined);
});

test('kayıt ayarı: yalnızca belge alanları, sabit sırada saklanır', () => {
  /* Bilinmeyen alan atılır, boş alan atılır, sıra sabitlenir; tür yoksa katılım. */
  const a = kayitAyariniCoz('metin=Merhaba&uydurma=1&alicilar=uye:3,kurum:hbv&imzaAd=Ad&baslik=&ad=Bir&ad=Iki');
  assert.equal(a.toString(), 'tur=katilim&alicilar=uye%3A3%2Ckurum%3Ahbv&ad=Bir&ad=Iki&imzaAd=Ad&metin=Merhaba');
  assert.equal(kayitAyariniCoz(a.toString()).toString(), a.toString(), 'ikinci kez çözmek değiştirmez');
  reddeder(kayitAyariniCoz, '');
  reddeder(kayitAyariniCoz, 'metin=' + 'x'.repeat(20001));
});

test('kayıt adı zorunlu ve sınırlı', () => {
  assert.equal(kayitAdiniCoz('  TPM1   Bükreş '), 'TPM1 Bükreş');
  reddeder(kayitAdiniCoz, '  ');
  reddeder(kayitAdiniCoz, 'A'.repeat(121));
});

test('kayıt anahtarlarının çevirisi her dilde var', async () => {
  const anahtarlar = ['belge.kayitlar.baslik', 'belge.kayit.kaydet', 'belge.kayit.kaydetIpucu', 'belge.kayit.hazirlaKaydet', 'belge.kayit.silSor', 'belge.kayit.eksik',
    'belge.hata.kayit', 'belge.hata.kayitAd', 'belge.hata.kayitAdUzun', 'belge.hata.kayitYok'];
  for (const dil of ['tr', 'en', 'da', 'it', 'pt', 'ro']) {
    const sozluk = await loadLocale(dil);
    for (const a of anahtarlar) assert.ok(sozluk[a], `${dil}: ${a}`);
  }
});
