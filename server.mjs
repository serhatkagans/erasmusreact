import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ValidationError, PROJECT, partners, workPackages, types, statuses, venues, languages, MIN_PASSWORD } from './lib/data.mjs';
import { openDb } from './lib/db.mjs';
import { send, digest, sessionToken, sameOrigin, langCookie } from './lib/http.mjs';
import { dictionary, negotiate, coverage } from './lib/i18n.mjs';
import { port, origin, basePath } from './lib/ayar.mjs';
import { etkinlikRoutes } from './routes/etkinlik.mjs';
import { oturumRoutes } from './routes/oturum.mjs';
import { ekipRoutes } from './routes/ekip.mjs';
import { formRoutes } from './routes/form.mjs';
import { hatirlaticiRoutes } from './routes/hatirlatici.mjs';
import { raporRoutes } from './routes/rapor.mjs';
import { belgeRoutes } from './routes/belge.mjs';
import { klasorRoutes } from './routes/klasor.mjs';
import { profilRoutes } from './routes/profil.mjs';
import { kullanicilarRoutes } from './routes/kullanicilar.mjs';
import { ciktiRoutes } from './routes/cikti.mjs';
import { faaliyetRoutes } from './routes/faaliyet.mjs';
import { panoRoutes } from './routes/pano.mjs';
import { driveRoutes } from './routes/drive.mjs';
import { bultenRoutes, ayCoz } from './routes/bulten.mjs';

/**
 * HTTP sunucusu: ortak başlıklar, oturum ve dil çözümü, yönlendirme zinciri
 * ve statik dosyalar. Uçların kendisi `routes/` altındadır.
 *
 * Yönlendirme zinciri sırayla denenir: bir işleyici isteği karşıladıysa
 * DOĞRU döner (lib/http.mjs `send` bunu sağlar), karşılamadıysa hiçbir şey
 * döndürmez ve sıra bir sonrakine geçer. Sonunda hiçbiri sahiplenmezse
 * statik dosyalara, oradan da 404'e düşülür.
 *
 * PLATFORM DIŞARIYA KAPALIDIR (kullanıcı kararı, 23 Eylül 2026: "ziyaretçi
 * yok, herkes üye olacak"). Oturumsuz istek yalnızca giriş sayfasına,
 * NFC profil kartlarına ve ana adresteki tanıtım sayfasına ulaşır; kart,
 * dağıtıldığı kişilerin girişi olmadığı için bilinçli istisnadır. Tanıtım
 * sayfası (8 Ekim 2026) yalnızca /api/acilis'teki künyeyi ve sözlüğü
 * kullanır: program verisi yine girişin arkasındadır. Kural route'lara tek tek yazılmadı,
 * aşağıdaki KAPI'da durur: yeni eklenen bir uç ya da sayfa kendiliğinden
 * kapalı doğar, açmak için bu listeye eklemek gerekir.
 */
const ACIK_API = new Set(['/api/acilis', '/api/giris', '/api/cikis', '/api/profil', '/api/profil/foto', '/api/profil/vcard']);
const ACIK_SAYFA = new Set(['/index.html', '/giris.html', '/profil.html', '/bulten.html']);
/* Aylık bülten herkese açıktır (kullanıcı kararı, 21 Ekim 2026: "bülten
   sayfasını herkes görebilsin"). Yalnızca OKUMA açık; not yazma, fotoğraf
   ekleme ve silme koordinatörde kalır. Oturumsuz okuyana kişi adları ve
   klasördeki dosya adları gönderilmez (routes/bulten.mjs). */
const acikOkuma = yol => yol === '/api/bulten' || /^\/api\/bulten\/foto\/\d+$/.test(yol);
const db = await openDb();

const etkinlik = etkinlikRoutes({ db });
const oturum = oturumRoutes({ db });
const ekip = ekipRoutes({ db });
const form = formRoutes({ db }).handle;
const hatirlatici = hatirlaticiRoutes({ db });
const rapor = raporRoutes({ db });
const belge = belgeRoutes({ db });
const klasorler = klasorRoutes({ db });
const profil = profilRoutes({ db });
const kullanicilar = kullanicilarRoutes({ db });
const cikti = ciktiRoutes({ db });
const faaliyet = faaliyetRoutes({ db });
const pano = panoRoutes({ db });
const drive = driveRoutes({ db });
const bulten = bultenRoutes({ db });

/* Arayüz React ile yazılır (client/) ve `npm run build` ile dist/ klasörüne
   derlenir. Sayfa adresleri eskisiyle aynıdır — `takvim.html`,
   `profil.html?u=…` (NFC etiketleri bu adresleri taşır) — ve hepsine aynı
   React uygulaması (dist/index.html) verilir; hangi sayfanın çizileceğine
   tarayıcıda karar verilir. */
const SAYFALAR = new Set(['/index.html', '/takvim.html', '/giris.html', '/ekip.html', '/formlar.html', '/belge.html',
  '/klasorler.html', '/profil.html', '/kullanicilar.html', '/ciktilar.html', '/pano.html', '/drive.html', '/bulten.html']);
const TURLER = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json',
};
const DIST = new URL('./dist/', import.meta.url);
/* Derleme yoksa sunucu API'yi verir ama hiçbir sayfa açılmaz; bu, sessiz
   bir 404 yerine açılışta söylenir. (`npm run dev`de sayfaları Vite verir.) */
if (!existsSync(new URL('index.html', DIST))) {
  console.warn('UYARI: dist/index.html yok — arayüz derlenmemiş. Önce `npm run build` çalıştırın.');
}

/** Sayfa adresi mi (React uygulamasını alır), yoksa dist/ altındaki bir dosya mı? */
function statikYol(pathname) {
  const wanted = pathname === '/' ? '/index.html' : pathname;
  if (SAYFALAR.has(wanted)) return { dosya: 'index.html', tur: 'text/html', sayfa: true };
  /* Yalnızca düz, bilinen uzantılı dosyalar; `..`, gizli dosya ve alt
     dizinden kaçış yok. Derleme çıktısı `assets/` altındadır. */
  if (!/^\/(assets\/)?[\w.-]+$/.test(wanted) || wanted.includes('..')) return null;
  const tur = TURLER[wanted.slice(wanted.lastIndexOf('.'))];
  if (!tur || tur === 'text/html') return null;
  return { dosya: wanted.slice(1), tur, sayfa: false };
}

async function staticFile(req, res, url, readOnly) {
  const yol = statikYol(url.pathname);
  if (!yol || !readOnly) return;
  let content;
  try { content = await readFile(new URL(yol.dosya, DIST)); } catch { return; }
  const type = yol.tur;
  const etag = '"' + createHash('sha256').update(content).digest('hex').slice(0, 32) + '"';
  /* assets/ altındaki dosyaların adı içeriğin özetini taşır: değişince adı
     da değişir, bu yüzden uzun süre önbellekte kalabilirler. */
  res.setHeader('Cache-Control', yol.dosya.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
  res.setHeader('ETag', etag);
  if (req.headers['if-none-match'] === etag) { res.writeHead(304); return res.end(); }
  const charset = type.startsWith('text/') || type.endsWith('javascript') || type.endsWith('svg+xml') ? '; charset=utf-8' : '';
  res.writeHead(200, { 'Content-Type': type + charset, 'Content-Length': content.length });
  return res.end(req.method === 'HEAD' ? undefined : content);
}

const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  /* Kapalı platform arama motorlarında görünmesin (profil kartları dahil). */
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");

  try {
    const url = new URL(req.url, origin);
    const readOnly = ['GET', 'HEAD'].includes(req.method);
    if (!readOnly && !sameOrigin(req)) {
      return send(res, 403, { error: `İstek kaynağı doğrulanamadı. Sayfayı ${origin}${basePath} adresinden açın.` });
    }
    if (!readOnly) res.setHeader('Cache-Control', 'no-store');

    /* Bültenin kısa adresi: …/bulten ve …/bulten/2026-10 (ya da /bulten/ekim).
       Uygulamanın bütün adresleri göreli olduğu için alt yolda sayfa
       çizilemez; asıl sayfaya göreli yönlendirilir (BASE_PATH bilinmeden). */
    const kisaBulten = readOnly && url.pathname.match(/^\/bulten(\/[^/]*)?\/?$/i);
    if (kisaBulten) {
      const ay = kisaBulten[1] ? ayCoz(decodeURIComponent(kisaBulten[1].slice(1))) : null;
      const ust = url.pathname.length > '/bulten'.length ? '../' : '';
      res.writeHead(302, { Location: `${ust}bulten.html${ay ? `?ay=${ay}` : ''}`, 'Cache-Control': 'no-store' });
      return res.end();
    }

    const token = sessionToken(req);
    const user = token
      ? await db.get('SELECT u.id,u.username,u.ad,u.partner,u.koordinator FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?',
          [digest(token), Date.now()])
      : undefined;
    if (user) user.koordinator = !!user.koordinator;

    const dil = negotiate(req, url);
    /* Adres çubuğundan seçilen dil çereze yazılır ki sonraki sayfalarda
       `?dil=` taşımak gerekmesin. */
    if (url.searchParams.get('dil') === dil) res.setHeader('Set-Cookie', langCookie(dil));

    /* KAPI: oturumsuz istek. Sayfa istendiyse girişe yönlendirilir ve
       girişten sonra geri dönülecek adres taşınır; API 401 alır. Görsel,
       stil ve betik dosyaları açıktır — veri taşımazlar, giriş sayfası da
       onlarla çiziliyor. */
    if (!user) {
      const sayfa = url.pathname === '/' ? '/index.html' : url.pathname;
      if (url.pathname.startsWith('/api/')
        ? !ACIK_API.has(url.pathname) && !(readOnly && acikOkuma(url.pathname))
        : url.pathname === '/takvim.ics') {
        return send(res, 401, { error: 'genel.girisGerekli' });
      }
      if (SAYFALAR.has(sayfa) && !ACIK_SAYFA.has(sayfa)) {
        const geri = `?geri=${encodeURIComponent(sayfa.slice(1) + url.search)}`;
        res.writeHead(302, { Location: `giris.html${geri}`, 'Cache-Control': 'no-store' });
        res.end();
        return;
      }
    }

    const ctx = { req, res, url, user, token, readOnly, dil };

    if (url.pathname.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');

    /* Arayüzün açılışta ihtiyaç duyduğu her şey tek istekte: sözlük, proje
       künyesi, listeler ve oturum durumu. Ayrı ayrı çağrılsaydı sayfa
       çizilene kadar dört gidiş-dönüş beklenirdi. */
    if (url.pathname === '/api/acilis' && req.method === 'GET') {
      const { sozluk, eksik } = await dictionary(dil);
      return send(res, 200, {
        dil,
        sozluk,
        eksikCeviri: eksik,
        /* Tüm diller gönderilir, yayında olmayanlar da: arayüz onları
           "yakında" diye gösterir. Hangilerinin geleceğini görmek, listenin
           bir gün uzayacağını bilmekten daha yararlı. */
        diller: languages.map(({ code, name, ready }) => ({ code, name, ready })),
        proje: PROJECT,
        ortaklar: partners,
        ispaketleri: workPackages.map(w => w.id),
        turler: types,
        durumlar: statuses,
        yerler: venues,
        minParola: MIN_PASSWORD,
        kullanici: user ? { id: user.id, kullanici: user.username, ad: user.ad, partner: user.partner, koordinator: user.koordinator } : null,
      });
    }

    /* Çeviri durumu: hangi dil ne kadar tamam. Yeni dil eklerken bakılır. */
    if (url.pathname === '/api/ceviri-durumu' && req.method === 'GET') {
      return send(res, 200, { diller: await coverage() });
    }

    if (await etkinlik(ctx)) return;
    if (await oturum(ctx)) return;
    if (await ekip(ctx)) return;
    if (await form(ctx)) return;
    if (await hatirlatici(ctx)) return;
    if (await rapor(ctx)) return;
    if (await belge(ctx)) return;
    if (await klasorler(ctx)) return;
    if (await profil(ctx)) return;
    if (await kullanicilar(ctx)) return;
    if (await cikti(ctx)) return;
    if (await faaliyet(ctx)) return;
    if (await pano(ctx)) return;
    if (await drive(ctx)) return;
    if (await bulten(ctx)) return;
    if (await staticFile(req, res, url, readOnly)) return;

    send(res, 404, { error: 'Sayfa bulunamadı.' });
  } catch (err) {
    if (err instanceof ValidationError) return send(res, 400, { error: err.message });
    console.error(err);
    if (!res.headersSent) send(res, 500, { error: 'İşlem tamamlanamadı.' });
  }
});

/* Drive'a 50 MB'lık dosya yavaş bağlantıda dakikalar sürebilir; başlıklar
   yine 10 saniyede gelmeli, gövde boyutunu da her uç kendisi sınırlar. */
server.requestTimeout = 600000;
server.headersTimeout = 10000;
server.listen(port, process.env.HOST || '127.0.0.1',
  () => console.log(`${PROJECT.acronym} platformu: ${origin}${basePath} (${db.kind})`));
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(async () => { await db.close(); process.exit(0); }));
}
