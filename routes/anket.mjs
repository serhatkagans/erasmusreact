import { ValidationError } from '../lib/data.mjs';
import { validateAnswers, questionsOf, accepting, live, disMi } from '../lib/forms.mjs';
import { send, body, clientIp } from '../lib/http.mjs';
import { dictionary } from '../lib/i18n.mjs';
import { metinler } from '../lib/rapor.mjs';

/**
 * Dışarıya açık anket — DOLDURMA uçları (oturumsuz):
 *   /api/anket/:anahtar          anketi oku (GET), yanıt gönder (POST)
 *   /api/anket/:anahtar/gorsel   kapak görseli (GET)
 *
 * Anketi koordinatör Formlar'da hazırlar (routes/form.mjs); bu dosya yalnızca
 * bağlantıyı alan kişinin gördüğü yüzdür. Platformun kapalı kalma kuralının
 * bilinçli istisnasıdır (server.mjs · KAPI): yalnızca anahtarı bilinen,
 * YAYINDAKİ ve silinmemiş tek bir formu açar. Taslak anket, iç form ya da
 * yanlış anahtar aynı 404'ü alır — hangisi olduğu dışarıya söylenmez.
 *
 * Gönderen bilinmez ve kaydedilmez (isimsiz). Kötüye kullanıma karşı:
 * gövde 100 KB ile sınırlı, dosya sorusu yok (lib/forms.mjs), gizli bir
 * tuzak alanı (`web`) doldurulmuşsa gönderim sessizce yutulur, ve aynı
 * adresten kısa sürede çok gönderim kabul edilmez. Adres
 * lib/http.mjs · clientIp'ten gelir: X-Forwarded-For yalnızca TRUST_PROXY
 * açıkken ve zincirin SONUNDAN okunur; baştaki değeri istemci yazabilir,
 * oradan okumak sınırı her istekte başlık değiştirerek atlatılabilir yapardı. Sınır cömerttir: bir
 * sınıf aynı okul ağından birlikte doldurabilir.
 */
const PENCERE_MS = 10 * 60 * 1000;
const PENCERE_SINIRI = 60;

export function anketRoutes({ db }) {
  /* Adres → son gönderim zamanları. Bellekte: sunucu yeniden başlayınca
     sıfırlanır, bu bir güvenlik sınırı değil, kaba bir fren. */
  const gonderimler = new Map();
  const frenle = adres => {
    const simdi = Date.now();
    const liste = (gonderimler.get(adres) || []).filter(z => simdi - z < PENCERE_MS);
    if (liste.length >= PENCERE_SINIRI) return false;
    liste.push(simdi);
    gonderimler.set(adres, liste);
    /* Harita büyümesin: arada bir eskiyen adresler atılır. */
    if (gonderimler.size > 5000) {
      for (const [a, l] of gonderimler) if (!l.some(z => simdi - z < PENCERE_MS)) gonderimler.delete(a);
    }
    return true;
  };

  return async function ({ req, res, url, readOnly, dil }) {
    const yol = url.pathname.match(/^\/api\/anket\/([\w-]{8,40})(\/gorsel)?$/);
    if (!yol) return;
    const [, anahtar, gorselMi] = yol;

    const form = await db.get(`SELECT forms.*, (SELECT g.updated FROM form_gorsel g WHERE g.form_id=forms.id) AS gorsel
                                 FROM forms WHERE dis_anahtar=? AND silindi='' AND durum='yayinda'`, [anahtar]);
    if (!form || !disMi(form)) return send(res, 404, { error: 'anket.hata.bulunamadi' });

    if (gorselMi) {
      if (!readOnly) return send(res, 405, { error: 'form.hata.islem' });
      const gorsel = await db.get('SELECT tur,veri FROM form_gorsel WHERE form_id=?', [form.id]);
      if (!gorsel) return send(res, 404, { error: 'form.hata.gorselYok' });
      const veri = Buffer.from(gorsel.veri);
      res.writeHead(200, { 'Content-Type': gorsel.tur, 'Content-Length': veri.length, 'Cache-Control': 'public, max-age=604800, immutable' });
      return res.end(req.method === 'HEAD' ? undefined : veri);
    }

    if (readOnly) {
      return send(res, 200, {
        baslik: form.baslik,
        aciklama: form.aciklama,
        baslikRich: form.baslik_rich || '',
        aciklamaRich: form.aciklama_rich || '',
        gorsel: form.gorsel || null,
        sonTarih: form.son_tarih,
        acik: accepting(form),
        sorular: questionsOf(form).filter(live),
      });
    }

    if (req.method !== 'POST') return send(res, 405, { error: 'form.hata.islem' });
    const { sozluk } = await dictionary(dil);
    const t = metinler(sozluk, dil).t;
    if (!accepting(form)) throw new ValidationError(t('anket.hata.kapali'));

    const veri = await body(req, 100000);
    /* Tuzak alanı: insan görmez, otomatik doldurucular doldurur. Başarılı
       görünür, kaydedilmez. */
    if (veri.web) return send(res, 200, { ok: true });
    if (!frenle(clientIp(req))) return send(res, 429, { error: 'anket.hata.cokGonderim' });

    const yanitlar = validateAnswers(questionsOf(form), veri.yanitlar, t);
    if (yanitlar === '{}') throw new ValidationError(t('anket.hata.bos'));
    await db.run('INSERT INTO form_dis_yanit (form_id,yanitlar,dil,created) VALUES (?,?,?,?)',
      [form.id, yanitlar, dil, new Date().toISOString()]);
    return send(res, 201, { ok: true });
  };
}
