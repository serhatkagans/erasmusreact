import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sunucuBaslat, istemci, HESAPLAR, KOORDINATOR } from './yardim.mjs';

/**
 * Yönetim (admin) sayfası — uçtan uca: yalnızca yönetici hesabı girer;
 * künye, kurum, metin ve görsel değişikliği sunucu yeniden başlamadan
 * açılış verisine ve statik dosyaya yansır, varsayılana dönülebilir.
 */
const YONETICI = { kullanici: 'test-admin', parola: 'TestParolasi2026!' };

let sunucu;
before(async () => {
  sunucu = await sunucuBaslat({ hesaplar: [...HESAPLAR, { ...YONETICI, kurum: 'hbv', yonetici: true, ad: 'Test Admin' }] });
});
after(async () => { await sunucu?.kapat(); });

test('yönetim: yalnızca yönetici; koordinatör bile giremez', async () => {
  assert.equal((await (await istemci(sunucu)).iste('/api/yonetim')).durum, 401);
  assert.equal((await (await istemci(sunucu, KOORDINATOR)).iste('/api/yonetim')).durum, 403);
  const admin = await istemci(sunucu, YONETICI);
  assert.equal((await admin.iste('/api/yonetim')).durum, 200);
  const acilis = (await admin.iste('/api/acilis')).veri.kullanici;
  assert.equal(acilis.yonetici, true);
  assert.equal(acilis.koordinator, true, 'yönetici koordinatör yetkilerini de taşır');
});

test('yönetim: künye ve kurum değişikliği hemen yansır, varsayılana döner', async () => {
  const admin = await istemci(sunucu, YONETICI);
  const once = (await admin.iste('/api/acilis')).veri.proje;

  assert.equal((await admin.iste('/api/yonetim/proje', { method: 'PUT', body: { start: '2027-01-01', end: '2026-01-01' } })).durum, 400);
  const yaz = await admin.iste('/api/yonetim/proje', { method: 'PUT', body: { projectNo: 'YENI-123', sosyal: [{ id: 'x', url: '' }] } });
  assert.equal(yaz.durum, 200);
  assert.deepEqual(yaz.veri.projeDegisen.sort(), ['projectNo', 'sosyal']);
  const sonra = (await admin.iste('/api/acilis')).veri.proje;
  assert.equal(sonra.projectNo, 'YENI-123');
  assert.ok(!sonra.sosyal.some(s => s.id === 'x'), 'boş adresli hesap gizlenir');

  assert.equal((await admin.iste('/api/yonetim/ortak/bte', { method: 'PUT', body: { web: 'ftp://x' } })).durum, 400);
  assert.equal((await admin.iste('/api/yonetim/ortak/yok', { method: 'PUT', body: { name: 'X' } })).durum, 400);
  assert.equal((await admin.iste('/api/yonetim/ortak/bte', { method: 'PUT', body: { city: 'Ankara' } })).durum, 200);
  assert.equal((await admin.iste('/api/acilis')).veri.ortaklar.find(o => o.id === 'bte').city, 'Ankara');

  /* Varsayılana dönüş: varsayılan değerleri göndermek farkı siler. */
  const sifir = await admin.iste('/api/yonetim/proje', { method: 'PUT', body: { ...yaz.veri.projeVarsayilan } });
  assert.deepEqual(sifir.veri.projeDegisen, []);
  assert.deepEqual((await admin.iste('/api/acilis')).veri.proje, once);
});

test('yönetim: metin değişikliği sözlüğe yansır, silinince dosyadakine döner', async () => {
  const admin = await istemci(sunucu, YONETICI);
  const dosyadaki = (await admin.iste('/api/acilis?dil=en')).veri.sozluk['altbilgi.projeno'];
  assert.equal((await admin.iste('/api/yonetim/metinler', { method: 'PUT', body: { dil: 'en', anahtar: 'yok.boyle', deger: 'x' } })).durum, 400);
  assert.equal((await admin.iste('/api/yonetim/metinler', { method: 'PUT', body: { dil: 'en', anahtar: 'altbilgi.projeno', deger: 'Project No: TEST' } })).durum, 200);
  assert.equal((await admin.iste('/api/acilis?dil=en')).veri.sozluk['altbilgi.projeno'], 'Project No: TEST');
  const liste = (await admin.iste('/api/yonetim/metinler?dil=en')).veri.metinler.find(m => m.anahtar === 'altbilgi.projeno');
  assert.equal(liste.ozel, 'Project No: TEST');
  assert.equal(liste.dosya, dosyadaki);
  await admin.iste('/api/yonetim/metinler?dil=en&anahtar=altbilgi.projeno', { method: 'DELETE' });
  assert.equal((await admin.iste('/api/acilis?dil=en')).veri.sozluk['altbilgi.projeno'], dosyadaki);
});

test('yönetim: görsel yüklenince aynı adla sunulur; yalnızca görsel kabul edilir', async () => {
  const admin = await istemci(sunucu, YONETICI);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
  assert.equal((await admin.iste('/api/yonetim/gorsel/logo.png', { method: 'PUT', ham: Buffer.from('<html>merhaba</html>') })).durum, 400);
  assert.equal((await admin.iste('/api/yonetim/gorsel/server.mjs', { method: 'PUT', ham: png })).durum, 404);
  assert.equal((await admin.iste('/api/yonetim/gorsel/logo.png', { method: 'PUT', ham: png })).durum, 200);

  const anonim = await istemci(sunucu);
  const logo = await anonim.iste('/logo.png');
  assert.equal(logo.durum, 200);
  assert.deepEqual(logo.veri, png);
  assert.match(logo.basliklar.get('content-security-policy'), /sandbox/);

  /* Dosyası olmayan kurum logosu da yüklenebilir. */
  assert.equal((await admin.iste('/api/yonetim/gorsel/kurum-logo-bte.png', { method: 'PUT', ham: png })).durum, 200);
  assert.equal((await anonim.iste('/kurum-logo-bte.png')).durum, 200);

  await admin.iste('/api/yonetim/gorsel/logo.png', { method: 'DELETE' });
  assert.notDeepEqual((await anonim.iste('/logo.png')).veri, png);
});

test('yönetim: görünüm — renk farkı tema.css olur ve sayfaya eklenir; yalnızca yönetici', async () => {
  const anonim = await istemci(sunucu);
  assert.equal((await (await istemci(sunucu, KOORDINATOR)).iste('/api/yonetim/tema', { method: 'PUT', body: { yesil: '#000000' } })).durum, 403);
  assert.doesNotMatch((await anonim.iste('/giris.html')).veri.toString(), /tema\.css/, 'değişiklik yokken eklenmez');

  const admin = await istemci(sunucu, YONETICI);
  assert.equal((await admin.iste('/api/yonetim/tema', { method: 'PUT', body: { yesil: 'kirmizi' } })).durum, 400);
  assert.equal((await admin.iste('/api/yonetim/tema', { method: 'PUT', body: { yazi: 'comic' } })).durum, 400);
  const yaz = await admin.iste('/api/yonetim/tema', { method: 'PUT', body: { yesil: '#AA0000', mavi: '#0f2a4a', yazi: 'tirnakli' } });
  assert.equal(yaz.durum, 200);
  assert.deepEqual(yaz.veri.degisen.sort(), ['yazi', 'yesil'], 'varsayılana eşit renk kaydedilmez');

  const css = (await anonim.iste('/tema.css')).veri.toString();
  assert.match(css, /--yesil: #aa0000/);
  assert.match(css, /--vurgu-rgb: 170, 0, 0/);
  assert.match(css, /Georgia/);
  assert.match((await anonim.iste('/giris.html')).veri.toString(), /<link rel="stylesheet" href="tema\.css\?v=\w+">/);

  await admin.iste('/api/yonetim/tema', { method: 'PUT', body: {} });
  assert.equal((await anonim.iste('/tema.css')).veri.toString(), '');
  assert.doesNotMatch((await anonim.iste('/giris.html')).veri.toString(), /tema\.css/);
});

test('yönetim: menü — sıra ve gizlenenler açılışa yansır; yönetim maddesi gizlenemez', async () => {
  const admin = await istemci(sunucu, YONETICI);
  const once = (await admin.iste('/api/acilis')).veri.menu;
  assert.equal(once.uye.sira[0], 'menu.pano');
  assert.deepEqual(once.uye.gizli, []);

  const yaz = await admin.iste('/api/yonetim/menu', { method: 'PUT', body: {
    uye: { sira: ['menu.bulten', 'yok.boyle'], gizli: ['menu.drive', 'menu.yonetim'] },
    ziyaretci: { gizli: ['tanitim.menu.yol'] },
  } });
  assert.equal(yaz.durum, 200);
  const m = (await admin.iste('/api/acilis')).veri.menu;
  assert.equal(m.uye.sira[0], 'menu.bulten');
  assert.ok(!m.uye.sira.includes('yok.boyle'));
  assert.equal(m.uye.sira.length, once.uye.sira.length, 'eksik maddeler sona eklenir');
  assert.deepEqual(m.uye.gizli, ['menu.drive']);
  assert.deepEqual(m.ziyaretci.gizli, ['tanitim.menu.yol']);
  assert.equal((await admin.iste('/api/yonetim/menu', { method: 'PUT', body: { uye: { sira: 'x' } } })).durum, 400);

  await admin.iste('/api/yonetim/menu', { method: 'PUT', body: {} });
  assert.deepEqual((await admin.iste('/api/acilis')).veri.menu, once);
});

test('yönetim: kurallar — sınırlar açılışa, bülten yetkisi uçlara yansır; varsayılana döner', async () => {
  const admin = await istemci(sunucu, YONETICI);
  const koordinator = await istemci(sunucu, KOORDINATOR); // hbv
  const ay = (await admin.iste('/api/bulten')).veri.ay;
  const govde = { gizli: [], sira: [], gizliMadde: [], manset: '' };

  assert.equal((await admin.iste('/api/yonetim/kurallar', { method: 'PUT', body: { minParola: 3 } })).durum, 400);
  assert.equal((await admin.iste('/api/yonetim/kurallar', { method: 'PUT', body: { driveMb: 999 } })).durum, 400);
  assert.equal((await admin.iste('/api/yonetim/kurallar', { method: 'PUT', body: { bultenIlkAy: '2026-13' } })).durum, 400);
  assert.equal((await koordinator.iste('/api/yonetim/kurallar', { method: 'PUT', body: { minParola: 20 } })).durum, 403);

  assert.equal((await koordinator.iste(`/api/bulten/${ay}/ayar`, { method: 'PUT', body: govde })).durum, 200, 'hbv varsayılan olarak düzenler');
  const yaz = await admin.iste('/api/yonetim/kurallar', { method: 'PUT', body: { minParola: 16, driveMb: 20, bultenKurumlari: ['bte', 'yok'] } });
  assert.equal(yaz.durum, 200);
  assert.deepEqual(yaz.veri.degisen.sort(), ['bultenKurumlari', 'driveMb', 'minParola']);
  const acilis = (await admin.iste('/api/acilis')).veri;
  assert.equal(acilis.minParola, 16);
  assert.equal(acilis.kurallar.driveMb, 20);
  assert.equal((await koordinator.iste(`/api/bulten/${ay}/ayar`, { method: 'PUT', body: govde })).durum, 403, 'listeden çıkan kurum düzenleyemez');
  assert.equal((await koordinator.iste('/api/bulten')).veri.duzenleyebilir, false);
  assert.equal((await admin.iste(`/api/bulten/${ay}/ayar`, { method: 'PUT', body: govde })).durum, 200, 'yönetici her zaman');

  await admin.iste('/api/yonetim/kurallar', { method: 'PUT', body: { ...yaz.veri.varsayilan } });
  assert.equal((await admin.iste('/api/acilis')).veri.minParola, 12);
  assert.equal((await koordinator.iste(`/api/bulten/${ay}/ayar`, { method: 'PUT', body: govde })).durum, 200);
});
