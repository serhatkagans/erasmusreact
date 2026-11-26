import { ValidationError, PROJECT, partners, langCodes, DEFAULT_LANG, KURALLAR } from '../lib/data.mjs';
import { send, body, rawBody } from '../lib/http.mjs';
import { loadLocale } from '../lib/i18n.mjs';
import {
  siteYukle, projeDogrula, ortakDogrula, varsayilanProje, varsayilanOrtak,
  gorselAdlari, gorselTuru, ozelGorsel, MAX_GORSEL,
  TEMA_RENKLERI, TEMA_YAZILARI, temaDogrula, temaBilgisi, menuDogrula, menuAyari,
  kurallarDogrula, varsayilanKurallar, KURAL_SINIRLARI,
} from '../lib/site.mjs';

/**
 * Yönetim sayfası uçları (26 Kasım 2026, kullanıcı: "her şey kodla
 * yapılıyor"). YALNIZCA YÖNETİCİ (users.yonetici) hesabı.
 *
 *   GET    /api/yonetim                 künye ve kurumlar (şimdiki + varsayılan)
 *   PUT    /api/yonetim/proje           künye
 *   PUT    /api/yonetim/ortak/<kod>     kurum bilgisi
 *   GET    /api/yonetim/metinler?dil=   bütün metinler: dosyadaki ve değiştirilen
 *   PUT    /api/yonetim/metinler        { dil, anahtar, deger }
 *   DELETE /api/yonetim/metinler?dil=&anahtar=   varsayılana dön
 *   GET    /api/yonetim/gorseller       değiştirilebilen görseller
 *   PUT    /api/yonetim/gorsel/<ad>     ham gövde: yeni dosya
 *   DELETE /api/yonetim/gorsel/<ad>     varsayılana dön
 *   GET|PUT /api/yonetim/kurallar       sınırlar ve bülten yetkisi (boş gövde: varsayılan)
 *   GET|PUT /api/yonetim/menu           menü sırası ve gizlenenler (boş gövde: varsayılan)
 *   GET|PUT /api/yonetim/tema           renkler ve yazı tipi (boş gövde: varsayılan)
 *
 * Kaydedilen her şey `siteYukle` ile hemen uygulanır; yeniden başlatma yok.
 */
export function yonetimRoutes({ db }) {
  const simdi = () => new Date().toISOString();

  const ayarYaz = async (anahtar, fark) => {
    await db.run('DELETE FROM site_ayar WHERE anahtar=?', [anahtar]);
    if (Object.keys(fark).length) {
      await db.run('INSERT INTO site_ayar (anahtar,deger,updated) VALUES (?,?,?)', [anahtar, JSON.stringify(fark), simdi()]);
    }
    await siteYukle(db);
  };

  const ozet = async () => {
    const ayarlar = {};
    for (const r of await db.all('SELECT anahtar,deger FROM site_ayar')) {
      try { ayarlar[r.anahtar] = JSON.parse(r.deger); } catch { /* yok say */ }
    }
    const vp = varsayilanProje();
    return {
      proje: { ...PROJECT, sosyal: vp.sosyal.map(h => ({ ...h, url: PROJECT.sosyal.find(s => s.id === h.id)?.url || '' })) },
      projeVarsayilan: vp,
      projeDegisen: Object.keys(ayarlar.proje || {}),
      ortaklar: partners.map(p => ({ ...p, varsayilan: varsayilanOrtak(p.id), degisen: Object.keys(ayarlar[`ortak.${p.id}`] || {}) })),
    };
  };

  const dilDogrula = dil => {
    if (!langCodes.includes(dil)) throw new ValidationError('Dil geçersiz.');
    return dil;
  };

  return async function handle({ req, res, url, user }) {
    if (url.pathname !== '/api/yonetim' && !url.pathname.startsWith('/api/yonetim/')) return;
    if (!user) return send(res, 401, { error: 'genel.girisGerekli' });
    if (!user.yonetici) return send(res, 403, { error: 'yonetim.hata.yetki' });
    const yol = url.pathname;

    if (yol === '/api/yonetim' && req.method === 'GET') return send(res, 200, await ozet());

    if (yol === '/api/yonetim/proje' && req.method === 'PUT') {
      const fark = projeDogrula(await body(req));
      await ayarYaz('proje', fark);
      return send(res, 200, await ozet());
    }

    const ortak = yol.match(/^\/api\/yonetim\/ortak\/([a-z0-9]+)$/);
    if (ortak && req.method === 'PUT') {
      const fark = ortakDogrula(ortak[1], await body(req));
      await ayarYaz(`ortak.${ortak[1]}`, fark);
      return send(res, 200, await ozet());
    }

    if (yol === '/api/yonetim/metinler') {
      if (req.method === 'GET') {
        const dil = dilDogrula(url.searchParams.get('dil') || DEFAULT_LANG);
        const temel = await loadLocale(DEFAULT_LANG);
        const dosya = dil === DEFAULT_LANG ? temel : await loadLocale(dil);
        const ozel = Object.fromEntries((await db.all('SELECT anahtar,deger FROM site_metin WHERE dil=?', [dil])).map(r => [r.anahtar, r.deger]));
        return send(res, 200, {
          dil,
          metinler: Object.keys(temel).map(a => ({ anahtar: a, tr: temel[a], dosya: dosya[a] ?? null, ozel: ozel[a] ?? null })),
        });
      }
      if (req.method === 'PUT') {
        const veri = await body(req, 200000);
        const dil = dilDogrula(veri.dil);
        const anahtar = String(veri.anahtar || '');
        if (!(anahtar in await loadLocale(DEFAULT_LANG))) throw new ValidationError('Metin anahtarı bulunamadı.');
        const deger = String(veri.deger ?? '');
        if (deger.length > 20000) throw new ValidationError('Metin en fazla 20000 karakter olabilir.');
        await db.run('DELETE FROM site_metin WHERE dil=? AND anahtar=?', [dil, anahtar]);
        await db.run('INSERT INTO site_metin (dil,anahtar,deger,updated) VALUES (?,?,?,?)', [dil, anahtar, deger, simdi()]);
        await siteYukle(db);
        return send(res, 200, { ok: true });
      }
      if (req.method === 'DELETE') {
        const dil = dilDogrula(url.searchParams.get('dil'));
        await db.run('DELETE FROM site_metin WHERE dil=? AND anahtar=?', [dil, String(url.searchParams.get('anahtar') || '')]);
        await siteYukle(db);
        return send(res, 200, { ok: true });
      }
    }

    if (yol === '/api/yonetim/kurallar') {
      if (req.method === 'PUT') await ayarYaz('kurallar', kurallarDogrula(await body(req)));
      else if (req.method !== 'GET') return send(res, 405, { error: 'genel.hata' });
      const varsayilan = varsayilanKurallar();
      return send(res, 200, {
        kurallar: { ...KURALLAR },
        varsayilan,
        sinirlar: KURAL_SINIRLARI,
        degisen: Object.keys(KURALLAR).filter(a => JSON.stringify(KURALLAR[a]) !== JSON.stringify(varsayilan[a])),
        kurumlar: partners.map(p => ({ id: p.id, short: p.short, name: p.name })),
      });
    }

    if (yol === '/api/yonetim/menu') {
      if (req.method === 'PUT') await ayarYaz('menu', await body(req).then(g => {
        const m = menuDogrula(g);
        const v = menuDogrula({});
        /* Varsayılanla aynıysa kayıt silinir. */
        return JSON.stringify(m) === JSON.stringify(v) ? {} : m;
      }));
      else if (req.method !== 'GET') return send(res, 405, { error: 'genel.hata' });
      return send(res, 200, { menu: menuAyari(), varsayilan: menuDogrula({}) });
    }

    if (yol === '/api/yonetim/tema') {
      if (req.method === 'PUT') await ayarYaz('tema', temaDogrula(await body(req)));
      else if (req.method !== 'GET') return send(res, 405, { error: 'genel.hata' });
      return send(res, 200, {
        varsayilan: { ...TEMA_RENKLERI, yazi: 'sistem' },
        tema: { ...TEMA_RENKLERI, yazi: 'sistem', ...temaBilgisi().fark },
        degisen: Object.keys(temaBilgisi().fark),
        yazilar: Object.keys(TEMA_YAZILARI),
        yaziYigini: TEMA_YAZILARI,
      });
    }

    if (yol === '/api/yonetim/gorseller' && req.method === 'GET') {
      return send(res, 200, {
        gorseller: gorselAdlari().map(ad => ({ ad, ozel: !!ozelGorsel(ad), updated: ozelGorsel(ad)?.updated || null })),
        azami: MAX_GORSEL,
      });
    }

    const gorsel = yol.match(/^\/api\/yonetim\/gorsel\/([\w.-]+)$/);
    if (gorsel) {
      const ad = gorsel[1];
      if (!gorselAdlari().includes(ad)) return send(res, 404, { error: 'Görsel bulunamadı.' });
      if (req.method === 'PUT') {
        const veri = await rawBody(req, MAX_GORSEL);
        const tur = veri.length ? gorselTuru(veri) : null;
        if (!tur) throw new ValidationError('Dosya PNG, JPG, WEBP, GIF ya da SVG olmalı.');
        await db.run('DELETE FROM site_gorsel WHERE ad=?', [ad]);
        await db.run('INSERT INTO site_gorsel (ad,tur,veri,updated) VALUES (?,?,?,?)', [ad, tur, veri, simdi()]);
        await siteYukle(db);
        return send(res, 200, { ok: true });
      }
      if (req.method === 'DELETE') {
        await db.run('DELETE FROM site_gorsel WHERE ad=?', [ad]);
        await siteYukle(db);
        return send(res, 200, { ok: true });
      }
    }
  };
}
