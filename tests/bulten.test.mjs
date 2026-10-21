import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sunucuBaslat, istemci, HESAPLAR, KOORDINATOR, ORTAK } from './yardim.mjs';
import { ayCoz, bultenAylari } from '../routes/bulten.mjs';

/**
 * Aylık bülten: herkese açık okuma, koordinatöre ait yazma, kısa adres.
 */

let sunucu;
before(async () => { sunucu = await sunucuBaslat({ hesaplar: HESAPLAR }); });
after(async () => { await sunucu?.kapat(); });

const ay = bultenAylari()[0];
/* En küçük geçerli PNG başlığı: tür baytlardan anlaşılır. */
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

test('bülten aylarını ve kısa adresteki ayı çözer', () => {
  assert.equal(bultenAylari('2026-10-21').join(), '2026-10,2026-09');
  const aylar = ['2026-10', '2026-09'];
  assert.equal(ayCoz('2026-10', aylar), '2026-10');
  assert.equal(ayCoz('ekim', aylar), '2026-10');
  assert.equal(ayCoz('Eylül', aylar), '2026-09');
  assert.equal(ayCoz('eylul-2026', aylar), '2026-09');
  assert.equal(ayCoz('kasim', aylar), null);
  assert.equal(ayCoz('abc', aylar), null);
});

test('bülten herkese açık; ziyaretçi kişi adı ve dosya adı görmez', async () => {
  const anonim = await istemci(sunucu);
  assert.equal((await anonim.iste('/bulten.html')).durum, 200);
  const b = await anonim.iste(`/api/bulten?ay=${ay}`);
  assert.equal(b.durum, 200);
  assert.equal(b.veri.duzenleyebilir, false);
  assert.equal(b.veri.uye, false);
  assert.deepEqual(b.veri.yapilanlar.dosya, []);
  assert.equal(b.veri.not.yazan, '');

  /* Yazma ziyaretçiye ve koordinatör olmayan ortağa kapalı. */
  assert.equal((await anonim.iste(`/api/bulten/${ay}`, { method: 'PUT', body: { yapilanlar: 'x' } })).durum, 401);
  assert.equal((await anonim.iste(`/api/bulten/${ay}/foto`, { method: 'POST', ham: PNG })).durum, 401);
  const ortak = await istemci(sunucu, ORTAK);
  assert.equal((await ortak.iste(`/api/bulten/${ay}`, { method: 'PUT', body: { yapilanlar: 'x' } })).durum, 403);

  /* Bültenin dışındaki veriler yine kapalı. */
  assert.equal((await anonim.iste('/api/pano')).durum, 401);
});

test('koordinatör not yazar ve fotoğraf ekler; ziyaretçi fotoğrafı görür', async () => {
  const k = await istemci(sunucu, KOORDINATOR);
  assert.equal((await k.iste(`/api/bulten/${ay}`, { method: 'PUT', body: { yapilanlar: '- Hesaplar açıldı', yapilacaklar: '' } })).durum, 200);
  const foto = await k.iste(`/api/bulten/${ay}/foto`, { method: 'POST', ham: PNG, headers: { 'x-dosya-adi': 'afis.png' } });
  assert.equal(foto.durum, 201);
  /* Görsel olmayan dosya reddedilir. */
  assert.equal((await k.iste(`/api/bulten/${ay}/foto`, { method: 'POST', ham: Buffer.from('merhaba dunya!') })).durum, 400);

  const anonim = await istemci(sunucu);
  const b = await anonim.iste(`/api/bulten?ay=${ay}`);
  assert.equal(b.veri.not.yapilanlar, '- Hesaplar açıldı');
  assert.equal(b.veri.fotolar.length, 1);
  const gorsel = await anonim.iste(`/api/bulten/foto/${foto.veri.id}`);
  assert.equal(gorsel.durum, 200);
  assert.equal(gorsel.tur, 'image/png');
  const parca = await anonim.iste(`/api/bulten/foto/${foto.veri.id}`, { headers: { range: 'bytes=0-7' } });
  assert.equal(parca.durum, 206);
  assert.equal(parca.veri.length, 8);
  assert.equal((await anonim.iste(`/api/bulten/foto/${foto.veri.id}`, { method: 'DELETE' })).durum, 401);
  assert.equal((await k.iste(`/api/bulten/foto/${foto.veri.id}`, { method: 'DELETE' })).durum, 200);
});

test('kısa adres: /bulten ve /bulten/<ay> asıl sayfaya yönlenir', async () => {
  const anonim = await istemci(sunucu);
  const kok = await anonim.iste('/bulten');
  assert.equal(kok.durum, 302);
  assert.equal(kok.basliklar.get('location'), 'bulten.html');
  const ayli = await anonim.iste('/bulten/eylul-2026');
  assert.equal(ayli.basliklar.get('location'), '../bulten.html?ay=2026-09');
  assert.equal((await anonim.iste('/bulten/2026-10')).basliklar.get('location'), '../bulten.html?ay=2026-10');
});
