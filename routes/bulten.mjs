import { listOf, ValidationError, requireText, sniffPhoto, PHOTO_TYPES, MAX_PHOTO_BYTES } from '../lib/data.mjs';
import { send, body, rawBody } from '../lib/http.mjs';
import { CIKTILAR } from '../lib/cikti.mjs';

/**
 * Aylık bülten: projenin ay ay ne yaptığı ve ne yapacağı.
 *
 *   GET /api/bulten?ay=2026-10   o ayın bülteni (ay yoksa içinde bulunulan ay)
 *   PUT /api/bulten/2026-10      koordinatör notu: { yapilanlar, yapilacaklar }
 *   POST /api/bulten/2026-10/foto   ayın fotoğrafı (koordinatör; gövde: görsel)
 *   GET|DELETE /api/bulten/foto/:id
 *   PUT /api/bulten/foto/:id     açıklama: { aciklama } (ilk satır başlık, altı tanıtım)
 *
 * Listeler TÜRETİLİR (panodaki gibi): görev tamamlanınca, dosya yüklenince,
 * faaliyet "tamamlandı" yapılınca bülten kendiliğinden dolar. Elle yazılan
 * tek şey koordinatörün ay notudur (öne çıkanlar ve hedefler).
 *
 * Bir şey "yapılan" sayılır: faaliyet tamamlandı, görev tamamlandı, çıktı
 * teslim edildi, form yayımlandı ya da yanıt aldı, dosya yüklendi. Ayına
 * düşen ama bitmemiş olan "yapılacak" listesine girer; geçmiş aydaysa
 * gecikmiş olarak görünür.
 *
 * HERKESE AÇIK OKUMA (21 Ekim 2026): GET uçları oturumsuz da çalışır
 * (server.mjs · acikOkuma). Oturumsuz okuyana kişi adları (yükleyen, görev
 * sahibi, notu yazan) ve klasördeki dosya adları gitmez; dosyalar yalnızca
 * sayı olarak görünür. Yazan her uç koordinatör ister.
 */

/** Bülten bu aydan başlar (hazırlık ayı; proje 1 Ekim 2026'da başladı). */
export const ILK_AY = '2026-09';

const ayEkle = (ay, n) => {
  const [y, a] = ay.split('-').map(Number);
  const d = new Date(Date.UTC(y, a - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
const aySonu = ay => new Date(Date.parse(ayEkle(ay, 1) + '-01T00:00:00Z') - 86400000).toISOString().slice(0, 10);

/** İlk aydan içinde bulunulan aya kadar bütün aylar, yeniden eskiye. */
export function bultenAylari(bugun = new Date().toISOString().slice(0, 10)) {
  const aylar = [];
  for (let ay = ILK_AY; ay <= bugun.slice(0, 7); ay = ayEkle(ay, 1)) aylar.unshift(ay);
  return aylar;
}

/**
 * Kısa adresteki ayı çözer: "2026-10", "ekim", "ekim-2026", "Eylül 2026",
 * "10-2026". Yıl yazılmadıysa bültendeki en yeni o ay alınır. Çözülemezse null.
 */
const AY_ADLARI = ['ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik'];
export function ayCoz(metin, aylar = bultenAylari()) {
  const s = String(metin || '').toLocaleLowerCase('tr')
    .replace(/[üşığçö]/g, h => ({ ü: 'u', ş: 's', ı: 'i', ğ: 'g', ç: 'c', ö: 'o' })[h]);
  const yil = s.match(/\b(20\d\d)\b/)?.[1];
  const ad = AY_ADLARI.findIndex(a => s.includes(a));
  const sayi = s.replace(/\b20\d\d\b/, '').match(/\b(0?[1-9]|1[0-2])\b/)?.[1];
  const ayNo = ad >= 0 ? ad + 1 : Number(sayi || 0);
  if (!ayNo) return null;
  const mm = String(ayNo).padStart(2, '0');
  if (yil) return `${yil}-${mm}`;
  return aylar.find(a => a.endsWith(`-${mm}`)) || null;
}

const NOT_SINIRI = 4000;
const AYLIK_FOTO = 12;
const ACIKLAMA_SINIRI = 400;

/* Ayın fotoğrafları kısa tanıtım videosu da alır (ör. 30 saniyelik reels). */
const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
const VIDEO_TURLERI = { 'video/mp4': 'mp4', 'video/webm': 'webm' };
const MEDYA = { ...PHOTO_TYPES, ...VIDEO_TURLERI };
function sniffVideo(b) {
  if (b.length < 12) return null;
  if (b.toString('ascii', 4, 8) === 'ftyp') return 'video/mp4';
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'video/webm';
  return null;
}
const gun = v => (v ? String(v).slice(0, 10) : null);

export function bultenRoutes({ db }) {
  return async function handle({ req, res, url, user }) {
    if (url.pathname !== '/api/bulten' && !url.pathname.startsWith('/api/bulten/')) return;
    const okuma = ['GET', 'HEAD'].includes(req.method);
    if (!user && !okuma) return send(res, 401, { error: 'genel.girisGerekli' });

    const bugun = new Date().toISOString().slice(0, 10);
    const aylar = bultenAylari(bugun);

    const parca = url.pathname.slice('/api/bulten'.length).split('/').filter(Boolean);

    /* --- Ayın fotoğrafları ------------------------------------------------ */
    if (parca[0] === 'foto' && parca.length === 2) {
      const id = Number(parca[1]);
      const foto = Number.isInteger(id) && id > 0 && await db.get('SELECT id,tur,veri FROM bulten_foto WHERE id=?', [id]);
      if (!foto) return send(res, 404, { error: 'bulten.hata.foto' });
      if (req.method === 'DELETE') {
        if (!user?.koordinator) return send(res, 403, { error: 'bulten.hata.yetki' });
        await db.run('DELETE FROM bulten_foto WHERE id=?', [id]);
        return send(res, 200, { ok: true });
      }
      if (req.method === 'PUT') {
        if (!user?.koordinator) return send(res, 403, { error: 'bulten.hata.yetki' });
        const g = await body(req);
        const aciklama = typeof g.aciklama === 'string' ? g.aciklama.replace(/\r\n/g, '\n').trim() : '';
        if (aciklama.length > ACIKLAMA_SINIRI) throw new ValidationError('bulten.hata.aciklamaUzun');
        await db.run('UPDATE bulten_foto SET aciklama=? WHERE id=?', [aciklama, id]);
        return send(res, 200, { ok: true });
      }
      if (!['GET', 'HEAD'].includes(req.method)) return send(res, 405, { error: 'genel.hata' });
      const veri = Buffer.isBuffer(foto.veri) ? foto.veri : Buffer.from(foto.veri);
      const ortak = { 'Content-Type': foto.tur, 'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=31536000, immutable', 'Content-Disposition': 'inline' };
      /* Video oynatıcı ileri sarmak için parça ister (Range). */
      const aralik = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      if (aralik && (aralik[1] || aralik[2])) {
        const bas = aralik[1] ? Number(aralik[1]) : Math.max(0, veri.length - Number(aralik[2]));
        const son = aralik[1] && aralik[2] ? Math.min(Number(aralik[2]), veri.length - 1) : veri.length - 1;
        if (bas > son || bas >= veri.length) {
          res.writeHead(416, { 'Content-Range': `bytes */${veri.length}` });
          res.end();
          return true;
        }
        res.writeHead(206, { ...ortak, 'Content-Length': son - bas + 1, 'Content-Range': `bytes ${bas}-${son}/${veri.length}` });
        res.end(req.method === 'HEAD' ? undefined : veri.subarray(bas, son + 1));
        return true;
      }
      res.writeHead(200, { ...ortak, 'Content-Length': veri.length });
      res.end(req.method === 'HEAD' ? undefined : veri);
      return true;
    }
    if (parca.length === 2 && parca[1] === 'foto' && req.method === 'POST') {
      const ay = parca[0];
      if (!aylar.includes(ay)) return send(res, 404, { error: 'bulten.hata.ay' });
      if (!user?.koordinator) return send(res, 403, { error: 'bulten.hata.yetki' });
      const adet = await db.get('SELECT CAST(count(*) AS INTEGER) AS n FROM bulten_foto WHERE ay=?', [ay]);
      if (Number(adet.n) >= AYLIK_FOTO) throw new ValidationError('bulten.hata.fotoSayi');
      const veri = await rawBody(req, MAX_VIDEO_BYTES);
      const tur = veri.length ? sniffPhoto(veri) || sniffVideo(veri) : null;
      if (!tur || !MEDYA[tur]) throw new ValidationError('bulten.hata.fotoTur');
      if (PHOTO_TYPES[tur] && veri.length > MAX_PHOTO_BYTES) throw new ValidationError('bulten.hata.fotoTur');
      const ad = requireText(decodeURIComponent(req.headers['x-dosya-adi'] || ''), 'Dosya adı', { max: 200, required: false })
        || `medya.${MEDYA[tur]}`;
      const aciklama = requireText(decodeURIComponent(req.headers['x-aciklama'] || ''), 'Açıklama', { max: ACIKLAMA_SINIRI, required: false }) || '';
      const id = await db.insert(
        'INSERT INTO bulten_foto (ay,ad,aciklama,tur,boyut,veri,yukleyen,created) VALUES (?,?,?,?,?,?,?,?)',
        [ay, ad, aciklama, tur, veri.length, veri, user.id, new Date().toISOString()]);
      return send(res, 201, { id: Number(id) });
    }

    /* --- Koordinatör notu ------------------------------------------------- */
    if (req.method === 'PUT' && parca.length === 1) {
      const ay = parca[0];
      if (!aylar.includes(ay)) return send(res, 404, { error: 'bulten.hata.ay' });
      if (!user?.koordinator) return send(res, 403, { error: 'bulten.hata.yetki' });
      const g = await body(req);
      const metin = v => {
        const s = typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim() : '';
        if (s.length > NOT_SINIRI) throw new ValidationError('bulten.hata.uzun');
        return s;
      };
      const yapilanlar = metin(g.yapilanlar);
      const yapilacaklar = metin(g.yapilacaklar);
      await db.run(
        `INSERT INTO bulten_not (ay,yapilanlar,yapilacaklar,yazan,updated) VALUES (?,?,?,?,?)
         ON CONFLICT(ay) DO UPDATE SET yapilanlar=excluded.yapilanlar, yapilacaklar=excluded.yapilacaklar,
           yazan=excluded.yazan, updated=excluded.updated`,
        [ay, yapilanlar, yapilacaklar, user.id, new Date().toISOString()]);
      return send(res, 200, { ok: true });
    }
    if (req.method !== 'GET' || url.pathname !== '/api/bulten') return send(res, 405, { error: 'genel.hata' });

    const ay = aylar.includes(url.searchParams.get('ay')) ? url.searchParams.get('ay') : aylar[0];
    const bas = `${ay}-01`;
    const son = aySonu(ay);
    const sonrakiAy = ayEkle(ay, 1);
    const ayda = v => !!v && String(v).slice(0, 7) === ay;
    const gecmis = son < bugun;

    /* --- Faaliyetler -------------------------------------------------------- */
    const etkinlikler = (await db.all('SELECT id,slug,kod,wp,tur,baslik,lider,katilimcilar,baslangic,bitis,durum,updated FROM events'))
      .map(e => ({ id: e.id, slug: e.slug, kod: e.kod, wp: e.wp, tur: e.tur, baslik: e.baslik, lider: e.lider,
        katilimcilar: listOf(e.katilimcilar), baslangic: gun(e.baslangic), bitis: gun(e.bitis), durum: e.durum, updated: gun(e.updated) }));
    /* Tamamlanan faaliyet bittiği ayda yazılır; erken kapatıldıysa kapatıldığı ayda. */
    const bittigiAy = e => (e.updated && e.updated < e.bitis ? e.updated : e.bitis);
    const ortusur = e => e.baslangic <= son && e.bitis >= bas;

    const yapilanFaaliyet = etkinlikler.filter(e => e.durum === 'tamamlandi' && ayda(bittigiAy(e)));
    const yapilacakFaaliyet = etkinlikler.filter(e => e.durum !== 'tamamlandi' && ortusur(e))
      .map(e => ({ ...e, gecikti: e.durum !== 'ertelendi' && e.bitis < bugun }));
    const sonrakiFaaliyet = etkinlikler.filter(e => e.durum !== 'tamamlandi' && e.baslangic.slice(0, 7) === sonrakiAy);

    /* --- Görevler ----------------------------------------------------------- */
    const gorevler = (await db.all(
      `SELECT g.id,g.partner,g.wp,g.baslik,g.son_tarih,g.durum,g.ilerleme,g.updated,t.ad AS uye
         FROM tasks g LEFT JOIN team t ON t.id=g.uye_id`))
      .map(g => ({ ...g, son_tarih: gun(g.son_tarih), updated: gun(g.updated), ilerleme: Number(g.ilerleme || 0) }));
    const yapilanGorev = gorevler.filter(g => g.durum === 'tamamlandi' && ayda(g.updated));
    const acik = g => g.durum !== 'tamamlandi' && g.durum !== 'iptal';
    const yapilacakGorev = gorevler.filter(g => acik(g) && ayda(g.son_tarih))
      .map(g => ({ ...g, gecikti: g.son_tarih < bugun }));
    const sonrakiGorev = gorevler.filter(g => acik(g) && g.son_tarih?.slice(0, 7) === sonrakiAy);

    /* --- Çıktılar (takvime bağlı olmayanlar; bağlı olanlar faaliyetle gelir) */
    const ciktiSatir = new Map((await db.all('SELECT slug,durum,sorumlu,teslim,updated FROM outputs')).map(r => [r.slug, r]));
    const ciktilar = CIKTILAR.filter(t => !t.etkinlik).map(t => {
      const s = ciktiSatir.get(t.slug) || {};
      return { slug: t.slug, anahtar: t.anahtar, durum: s.durum, sorumlu: s.sorumlu || null, teslim: gun(s.teslim), updated: gun(s.updated) };
    });
    const yapilanCikti = ciktilar.filter(c => c.durum === 'teslim' && ayda(c.updated));
    const yapilacakCikti = ciktilar.filter(c => c.durum !== 'teslim' && ayda(c.teslim))
      .map(c => ({ ...c, gecikti: c.teslim < bugun }));

    /* --- Formlar: bu ay yayımlananlar, yanıt alanlar, son günü bu ay olanlar */
    const formlar = await db.all("SELECT id,baslik,son_tarih,durum,yayinlandi,created FROM forms WHERE silindi=''");
    const yanitlar = await db.all('SELECT form_id,created FROM form_yanitlar');
    const yayinlanan = formlar.filter(f => f.durum !== 'taslak' && ayda(f.yayinlandi || f.created))
      .map(f => ({ id: f.id, baslik: f.baslik, tarih: gun(f.yayinlandi || f.created) }));
    const yanitAlan = formlar
      .map(f => ({ id: f.id, baslik: f.baslik, n: yanitlar.filter(y => y.form_id === f.id && ayda(y.created)).length }))
      .filter(f => f.n > 0);
    const formSonGun = formlar.filter(f => f.durum !== 'taslak' && ayda(f.son_tarih))
      .map(f => ({ id: f.id, baslik: f.baslik, sonTarih: gun(f.son_tarih), yanit: yanitlar.filter(y => y.form_id === f.id).length }));

    /* --- Dosyalar ----------------------------------------------------------- */
    const klasorDosya = (await db.all(
      `SELECT d.id,d.klasor,d.ad,d.partner,d.created,u.ad AS yukleyen_ad,u.username
         FROM klasor_dosya d LEFT JOIN users u ON u.id=d.yukleyen ORDER BY d.created DESC`))
      .filter(d => ayda(d.created))
      .map(d => ({ id: d.id, klasor: d.klasor, ad: d.ad, partner: d.partner, tarih: gun(d.created), yukleyen: d.yukleyen_ad || d.username || '' }));
    const faaliyetDosya = (await db.all(
      `SELECT f.event_id,f.tur,f.created,e.slug,e.kod,e.wp,e.baslik FROM event_files f JOIN events e ON e.id=f.event_id`))
      .filter(f => ayda(f.created));
    const fotograf = (await db.all('SELECT yuklendi FROM event_photos')).filter(f => ayda(f.yuklendi)).length;
    const ciktiDosya = (await db.all('SELECT created FROM output_files')).filter(f => ayda(f.created)).length;

    /* Faaliyet dosyaları faaliyet başına tek satır: "gündem, yoklama". */
    const faaliyetDosyaGrup = [...faaliyetDosya.reduce((m, f) => {
      const g = m.get(f.event_id) || { id: f.event_id, slug: f.slug, kod: f.kod, wp: f.wp, baslik: f.baslik, turler: [] };
      if (!g.turler.includes(f.tur)) g.turler.push(f.tur);
      return m.set(f.event_id, g);
    }, new Map()).values()];

    const fotolar = (await db.all('SELECT id,ad,aciklama,tur,boyut FROM bulten_foto WHERE ay=? ORDER BY id', [ay]))
      .map(f => ({ id: Number(f.id), ad: f.ad, aciklama: f.aciklama, tur: f.tur, boyut: Number(f.boyut) }));
    const not = await db.get('SELECT n.yapilanlar,n.yapilacaklar,n.updated,u.ad,u.username FROM bulten_not n LEFT JOIN users u ON u.id=n.yazan WHERE n.ay=?', [ay]);

    /* Oturumsuz okuyan: kişi adları ve klasör dosya adları çıkarılır. */
    if (!user) {
      for (const g of [...yapilanGorev, ...yapilacakGorev, ...sonrakiGorev]) g.uye = null;
      klasorDosya.length = 0;
    }
    const klasorDosyaSayi = (await db.all('SELECT created FROM klasor_dosya')).filter(d => ayda(d.created)).length;

    return send(res, 200, {
      klasorDosyaSayi,
      ay, aylar, bas, son, gecmis, sonrakiAy, duzenleyebilir: !!user?.koordinator, uye: !!user, fotolar, maxFoto: AYLIK_FOTO,
      not: { yapilanlar: not?.yapilanlar || '', yapilacaklar: not?.yapilacaklar || '',
        updated: not?.updated || null, yazan: not && user ? (not.ad || not.username || '') : '' },
      yapilanlar: { faaliyet: yapilanFaaliyet, gorev: yapilanGorev, cikti: yapilanCikti,
        formYayin: yayinlanan, formYanit: yanitAlan,
        dosya: klasorDosya, faaliyetDosya: faaliyetDosyaGrup, fotograf, ciktiDosya },
      yapilacaklar: { faaliyet: yapilacakFaaliyet, gorev: yapilacakGorev, cikti: yapilacakCikti, form: formSonGun },
      sonraki: { faaliyet: sonrakiFaaliyet, gorev: sonrakiGorev },
    });
  };
}
