import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sunucuBaslat, istemci, HESAPLAR, KOORDINATOR, ORTAK, ORTAK2 } from './yardim.mjs';

/**
 * Drive (GençTek takviminden aktarıldı, bkz. lib/drive.mjs) — uçtan uca.
 * Koordinatör sahiptir; ortak kurum hesabı yalnızca kendisiyle, kurumuyla
 * ("ortak grubu") ya da bağlantıyla paylaşılanı görür. Platform kapalı
 * olduğu için bağlantı da oturum ister.
 */

let sunucu, koordinator, ortak, cecf, anonim;
before(async () => {
  sunucu = await sunucuBaslat({ hesaplar: HESAPLAR });
  [koordinator, ortak, cecf, anonim] = await Promise.all([istemci(sunucu, KOORDINATOR), istemci(sunucu, ORTAK), istemci(sunucu, ORTAK2), istemci(sunucu)]);
});
after(async () => { await sunucu?.kapat(); });

const yukle = (kim, ust, ad, icerik) => kim.iste(`/api/drive/dosya?ust=${ust}`, { method: 'POST', ham: icerik, headers: { 'x-file-name': encodeURIComponent(ad), 'content-type': 'application/octet-stream' } });

test('Drive: sayfa ve uçlar girişin arkasında, menüde "Drive"', async () => {
  assert.equal((await anonim.iste('/drive.html')).durum, 302);
  assert.equal((await anonim.iste('/api/drive')).durum, 401);
  assert.equal((await koordinator.iste('/drive.html')).durum, 200);
  const acilis = (await koordinator.iste('/api/acilis')).veri;
  assert.equal(acilis.sozluk['menu.drive'], 'Drive');
});

test('Drive: koordinatör yönetir, ortak yalnızca paylaşılanı görür', async () => {
  const kok = (await koordinator.iste('/api/drive/klasor', { method: 'POST', body: { parent: null, name: '  Raporlar  ' } }));
  assert.equal(kok.durum, 201);
  const raporlar = kok.veri.id;
  const gizli = (await koordinator.iste('/api/drive/klasor', { method: 'POST', body: { parent: null, name: 'Gizli' } })).veri.id;
  const dosya = await yukle(koordinator, raporlar, 'Özet çizelge.txt', 'merhaba dünya');
  assert.equal(dosya.durum, 201);
  await yukle(koordinator, gizli, 'gizli.txt', 'gizli');

  /* Ortak kökü "Benimle paylaşılanlar"dır: henüz boş; köke klasör açamaz, görünümler kapalı. */
  assert.deepEqual((await ortak.iste('/api/drive')).veri.items, []);
  assert.equal((await ortak.iste('/api/drive/klasor', { method: 'POST', body: { name: 'x' } })).durum, 400);
  assert.equal((await ortak.iste('/api/drive?gorunum=son')).durum, 403);
  assert.equal((await ortak.iste(`/api/drive?klasor=${gizli}`)).durum, 404);

  /* Kişi paylaşımı: görüntüleyen okur, yükleyemez, adlandıramaz. */
  const ortakId = (await koordinator.iste('/api/drive/kisiler')).veri.find(k => k.city === 'geoclub').id;
  assert.equal((await koordinator.iste(`/api/drive/${raporlar}/kisiler`, { method: 'PUT', body: { user: ortakId, role: 'viewer' } })).durum, 200);
  const paylasilan = (await ortak.iste('/api/drive')).veri.items;
  assert.deepEqual(paylasilan.map(o => o.name), ['Raporlar']);
  const ic = (await ortak.iste(`/api/drive?klasor=${raporlar}`)).veri;
  assert.equal(ic.role, 'viewer');
  assert.deepEqual(ic.items.map(o => o.name), ['Özet çizelge.txt']);
  const indir = await ortak.iste(`/api/drive/${dosya.veri.id}/indir`);
  assert.equal(indir.durum, 200);
  assert.equal(indir.veri.toString(), 'merhaba dünya');
  assert.equal((await yukle(ortak, raporlar, 'a.txt', 'a')).durum, 400);
  assert.equal((await ortak.iste(`/api/drive/${dosya.veri.id}`, { method: 'PUT', body: { name: 'b.txt' } })).durum, 403);
  /* Başka ortak hiçbirini görmez. */
  assert.equal((await cecf.iste(`/api/drive?klasor=${raporlar}`)).durum, 404);
});

test('Drive: ortak grubuna yükleyen yetkisi ve teslim durumu', async () => {
  const toplama = (await koordinator.iste('/api/drive/klasor', { method: 'POST', body: { parent: null, name: 'Fotoğraflar' } })).veri.id;
  assert.equal((await koordinator.iste(`/api/drive/${toplama}/kisiler`, { method: 'PUT', body: { cities: ['geoclub', 'cecf'], role: 'uploader' } })).durum, 200);
  assert.equal((await koordinator.iste(`/api/drive/${toplama}/kisiler`, { method: 'PUT', body: { cities: ['istanbul'], role: 'viewer' } })).durum, 400, 'geçersiz ortak');

  assert.equal((await yukle(ortak, toplama, 'geo.jpg', 'g')).durum, 201);
  assert.equal((await yukle(cecf, toplama, 'cecf.jpg', 'c')).durum, 201);
  /* Yükleyen yalnızca kendi yüklediğini görür. */
  assert.deepEqual((await ortak.iste(`/api/drive?klasor=${toplama}`)).veri.items.map(o => o.name), ['geo.jpg']);
  assert.deepEqual((await cecf.iste(`/api/drive?klasor=${toplama}`)).veri.items.map(o => o.name), ['cecf.jpg']);

  const teslim = (await koordinator.iste(`/api/drive/${toplama}/teslim`)).veri;
  assert.equal(teslim.done, 2);
  assert.deepEqual(teslim.cities.map(c => c.city).sort(), ['cecf', 'geoclub']);
});

test('Drive: çöp kutusu, sürüm ve bağlantı paylaşımı', async () => {
  const klasor = (await koordinator.iste('/api/drive/klasor', { method: 'POST', body: { parent: null, name: 'Bağlantı' } })).veri.id;
  const dosya = (await yukle(koordinator, klasor, 'not.txt', 'bir')).veri.id;
  assert.equal((await koordinator.iste(`/api/drive/${dosya}/surum`, { method: 'POST', ham: 'iki', headers: { 'content-type': 'application/octet-stream' } })).durum, 200);
  const surumler = (await koordinator.iste(`/api/drive/${dosya}/surumler`)).veri;
  assert.equal(surumler.versions.length, 1);

  const pay = (await koordinator.iste(`/api/drive/${klasor}`, { method: 'PUT', body: { share: 'viewer' } })).veri;
  assert.match(pay.link, /^[A-Za-z0-9_-]{32}$/);
  /* Bağlantı oturumlu ortağa açılır; oturumsuz kişi yine kapıda kalır. */
  assert.deepEqual((await cecf.iste(`/api/drive?pay=${pay.link}`)).veri.items.map(o => o.name), ['not.txt']);
  assert.equal((await anonim.iste(`/api/drive?pay=${pay.link}`)).durum, 401);

  assert.equal((await koordinator.iste(`/api/drive/${klasor}`, { method: 'DELETE' })).durum, 400, 'önce çöpe');
  assert.equal((await koordinator.iste(`/api/drive/${klasor}`, { method: 'PUT', body: { trashed: true } })).durum, 200);
  assert.equal((await cecf.iste(`/api/drive?pay=${pay.link}`)).durum, 404, 'çöpteki klasörün bağlantısı çalışmaz');
  assert.ok((await koordinator.iste('/api/drive?gorunum=cop')).veri.items.some(o => o.id === klasor));
  assert.equal((await koordinator.iste(`/api/drive/${klasor}`, { method: 'DELETE' })).durum, 200);
  const etkinlik = (await koordinator.iste('/api/drive/etkinlik')).veri.entries.map(e => e.action);
  assert.ok(etkinlik.includes('delete') && etkinlik.includes('version') && etkinlik.includes('link'));
});
