import { ValidationError, normalizeUsername, sniffPhoto, PHOTO_TYPES, partners } from '../lib/data.mjs';
import { send, rawBody, body } from '../lib/http.mjs';
import { origin, basePath } from '../lib/ayar.mjs';

/**
 * Herkese açık kişi profili (dijital kartvizit): `profil.html?u=<kullanici>`.
 *
 * Oturum istemez — adres NFC etiketine yazılıp dağıtılır. Bu yüzden
 * yalnızca kartta görünen alanlar döner: ad, kullanıcı adı, kurum,
 * fotoğrafın sürümü, telefon, e-posta ve kısa tanıtım. Parola özeti,
 * koordinatör bayrağı ve hesap numarası ASLA bu uçtan çıkmaz; kimlik
 * numarası zaten hiçbir yerde tutulmuyor.
 *
 * FOTOĞRAF herkese açık okunur; yalnızca kişinin kendisi ve proje
 * yöneticisi (koordinatör) yükler ya da kaldırır. Tarayıcı fotoğrafı
 * yüklemeden önce kare kırpıp küçültür (~100 KB); sunucudaki sınır buna
 * göre dardır ve tür yine baytlardan çıkarılır.
 *
 * TELEFON ve TANITIM da aynı kuralla yazılır (kişi ve koordinatör). Telefon
 * uluslararası biçimde tutulur (+ ve 8–15 rakam): kart WhatsApp bağlantısı
 * (`wa.me/<rakamlar>`) ve arama bağlantısı üretir, ortaklar farklı
 * ülkelerde olduğu için ülke kodu zorunludur. E-POSTA kişinin kendi
 * yazdığıdır; ekip tablosundaki e-posta koordinatörün kaydıdır ve kişinin
 * onayı olmadan herkese açık karta taşınmaz.
 *
 * UNVAN serbest metindir (ör. "Proje koordinatörü"), LINKEDIN yalnızca
 * linkedin.com adresi olabilir. DİLLER ISO 639 kodlarıyla tutulur
 * (`tr,en,pap`; Papiamento gibi iki harfli kodu olmayan dil üç harfle).
 * Kart adlarını izleyicinin dilinde Intl.DisplayNames ile yazar, bu yüzden
 * dil adları için çeviri anahtarı gerekmez.
 *
 * REHBER KARTI (`/api/profil/vcard`): kartta görünen bilgilerden vCard 3.0
 * üretir; telefon rehberine tek dokunuşla kaydedilir. Fotoğraf da gömülür.
 */
export const MAX_PROFIL_FOTO = 2 * 1024 * 1024;
export const MAX_HAKKINDA = 300;
export const MAX_UNVAN = 80;
export const MAX_DIL = 10;

const DIL_ADI = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' });

export function unvanDuzelt(deger) {
  const unvan = String(deger ?? '').replace(/\s+/g, ' ').trim();
  if ([...unvan].length > MAX_UNVAN) throw new ValidationError('profil.hata.unvan');
  return unvan;
}

/* "linkedin.com/in/ad" da yazılabilir; https:// eklenir, sorgu ve iz atılır. */
export function linkedinDuzelt(deger) {
  const ham = String(deger ?? '').trim();
  if (!ham) return '';
  let adres;
  try { adres = new URL(/^https?:\/\//i.test(ham) ? ham : `https://${ham}`); }
  catch { throw new ValidationError('profil.hata.linkedin'); }
  const yol = adres.pathname.replace(/\/+$/, '');
  if (!/^([a-z]{2,3}\.)?linkedin\.com$/i.test(adres.hostname) || yol.length < 4 || ham.length > 200) {
    throw new ValidationError('profil.hata.linkedin');
  }
  return `https://www.linkedin.com${yol}`;
}

export function dillerDuzelt(deger) {
  const liste = Array.isArray(deger) ? deger : String(deger ?? '').split(',');
  const kodlar = [...new Set(liste.map(k => String(k).trim().toLowerCase()).filter(Boolean))];
  if (kodlar.length > MAX_DIL || kodlar.some(k => !/^[a-z]{2,3}$/.test(k) || !DIL_ADI.of(k))) {
    throw new ValidationError('profil.hata.diller');
  }
  return kodlar;
}
const dilListesi = s => (s ? s.split(',') : []);

export function telefonDuzelt(deger) {
  const ham = String(deger ?? '').trim();
  if (!ham) return '';
  const rakam = ham.replace(/[\s().-]/g, '').replace(/^00/, '+');
  if (!/^\+\d{8,15}$/.test(rakam)) throw new ValidationError('profil.hata.telefon');
  return rakam;
}

export function epostaDuzelt(deger) {
  const ham = String(deger ?? '').trim();
  if (!ham) return '';
  if (ham.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ham)) throw new ValidationError('profil.hata.eposta');
  return ham;
}

/* vCard metin kaçışı (RFC 2426): ters bölü, noktalı virgül, virgül, satır sonu. */
const vc = s => String(s).replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
/* Uzun satırlar 75 karakterde katlanır; devam satırı boşlukla başlar. */
const katla = satir => satir.match(/.{1,74}/g).join('\r\n ');

export function vcardUret({ kisi, foto, adres }) {
  const kurum = partners.find(p => p.id === kisi.partner);
  const ad = kisi.ad || kisi.username;
  const parca = ad.trim().split(/\s+/);
  const soyad = parca.length > 1 ? parca.pop() : '';
  const satirlar = [
    'BEGIN:VCARD', 'VERSION:3.0',
    `N:${vc(soyad)};${vc(parca.join(' '))};;;`,
    `FN:${vc(ad)}`,
    kurum && `ORG:${vc(kurum.name)}`,
    kisi.unvan && `TITLE:${vc(kisi.unvan)}`,
    kisi.telefon && `TEL;TYPE=CELL:${kisi.telefon}`,
    kisi.eposta && `EMAIL;TYPE=INTERNET:${vc(kisi.eposta)}`,
    `URL:${adres}`,
    kisi.linkedin && `URL;TYPE=linkedin:${kisi.linkedin}`,
    kisi.hakkinda && `NOTE:${vc(kisi.hakkinda)}`,
    foto && katla(`PHOTO;ENCODING=b;TYPE=${foto.tur === 'image/png' ? 'PNG' : foto.tur === 'image/webp' ? 'WEBP' : 'JPEG'}:${Buffer.from(foto.veri).toString('base64')}`),
    'END:VCARD',
  ];
  return satirlar.filter(Boolean).join('\r\n') + '\r\n';
}

export function profilRoutes({ db }) {
  const kisiBul = async u => {
    const kullanici = normalizeUsername(u).slice(0, 100);
    return kullanici ? db.get('SELECT id,username,ad,partner,telefon,eposta,hakkinda,unvan,linkedin,diller FROM users WHERE username=?', [kullanici]) : null;
  };

  return async function handle({ req, res, url, user, readOnly }) {
    if (url.pathname === '/api/profil' && readOnly) {
      const kisi = await kisiBul(url.searchParams.get('u'));
      if (!kisi) return send(res, 404, { error: 'profil.yok' });
      const foto = await db.get('SELECT updated FROM user_photos WHERE user_id=?', [kisi.id]);
      return send(res, 200, {
        kullanici: kisi.username, ad: kisi.ad || kisi.username, partner: kisi.partner,
        foto: foto?.updated || null, telefon: kisi.telefon || '', eposta: kisi.eposta || '', hakkinda: kisi.hakkinda || '',
        unvan: kisi.unvan || '', linkedin: kisi.linkedin || '', diller: dilListesi(kisi.diller),
      });
    }

    if (url.pathname === '/api/profil/vcard' && readOnly) {
      const kisi = await kisiBul(url.searchParams.get('u'));
      if (!kisi) return send(res, 404, { error: 'profil.yok' });
      const foto = await db.get('SELECT tur,veri FROM user_photos WHERE user_id=?', [kisi.id]);
      const adres = `${origin}${basePath}/profil.html?u=${encodeURIComponent(kisi.username)}`;
      const veri = Buffer.from(vcardUret({ kisi, foto, adres }), 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/vcard; charset=utf-8',
        'Content-Length': veri.length,
        'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="${kisi.username.replace(/[^\w.-]/g, '_')}.vcf"`,
      });
      res.end(req.method === 'HEAD' ? undefined : veri);
      return true;
    }

    if (url.pathname === '/api/profil' && req.method === 'PUT') {
      if (!user) return send(res, 401, { error: 'kullanicilar.hata.giris' });
      const kisi = await kisiBul(url.searchParams.get('u'));
      if (!kisi) return send(res, 404, { error: 'profil.yok' });
      if (user.id !== kisi.id && !user.koordinator) return send(res, 403, { error: 'profil.hata.yetkiBilgi' });
      const gelen = await body(req);
      const telefon = telefonDuzelt(gelen.telefon);
      const eposta = epostaDuzelt(gelen.eposta);
      const hakkinda = String(gelen.hakkinda ?? '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      if ([...hakkinda].length > MAX_HAKKINDA) throw new ValidationError('profil.hata.hakkinda');
      const unvan = unvanDuzelt(gelen.unvan);
      const linkedin = linkedinDuzelt(gelen.linkedin);
      const diller = dillerDuzelt(gelen.diller);
      await db.run('UPDATE users SET telefon=?, eposta=?, hakkinda=?, unvan=?, linkedin=?, diller=? WHERE id=?',
        [telefon, eposta, hakkinda, unvan, linkedin, diller.join(','), kisi.id]);
      return send(res, 200, { telefon, eposta, hakkinda, unvan, linkedin, diller });
    }

    if (url.pathname !== '/api/profil/foto') return;
    const kisi = await kisiBul(url.searchParams.get('u'));

    if (readOnly) {
      const foto = kisi && await db.get('SELECT tur,veri FROM user_photos WHERE user_id=?', [kisi.id]);
      if (!foto) return send(res, 404, { error: 'profil.yok' });
      const veri = Buffer.isBuffer(foto.veri) ? foto.veri : Buffer.from(foto.veri);
      res.writeHead(200, {
        'Content-Type': foto.tur,
        'Content-Length': veri.length,
        /* Adres `&v=<sürüm>` taşır; yeni fotoğraf yeni adres demektir. */
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Disposition': 'inline',
      });
      res.end(req.method === 'HEAD' ? undefined : veri);
      return true;
    }

    if (!user) return send(res, 401, { error: 'kullanicilar.hata.giris' });
    if (!kisi) return send(res, 404, { error: 'profil.yok' });
    if (user.id !== kisi.id && !user.koordinator) return send(res, 403, { error: 'profil.hata.yetki' });

    if (req.method === 'PUT') {
      const veri = await rawBody(req, MAX_PROFIL_FOTO);
      const tur = veri.length ? sniffPhoto(veri) : null;
      if (!tur || !PHOTO_TYPES[tur]) throw new ValidationError('profil.hata.tur');
      const updated = new Date().toISOString();
      await db.run('DELETE FROM user_photos WHERE user_id=?', [kisi.id]);
      await db.run('INSERT INTO user_photos (user_id,tur,veri,updated) VALUES (?,?,?,?)', [kisi.id, tur, veri, updated]);
      return send(res, 200, { foto: updated });
    }

    if (req.method === 'DELETE') {
      await db.run('DELETE FROM user_photos WHERE user_id=?', [kisi.id]);
      return send(res, 200, { foto: null });
    }
  };
}
