import { ValidationError, partners, partnerOf, PROJECT } from '../lib/data.mjs';
import { send, body } from '../lib/http.mjs';
import { dictionary } from '../lib/i18n.mjs';
import { metinler, tarihAraligi } from '../lib/rapor.mjs';
import {
  belgeTuruMu, belgeMetniUret, aliciAdiniCoz, imzaBilgisiniCoz,
  imzaUnvaniOner, ozelMetniCoz, topluAlicilariSec, bosSayisiniCoz, MAX_BELGE,
  kayitAyariniCoz, kayitAdiniCoz,
} from '../lib/belge.mjs';

/** Ortak hesabın başka kuruma belge üretme / kayıt açma denemesi: 403. */
class YetkiHatasi extends Error {}

/**
 * Katılım ve teşekkür belgesi üretimi.
 *
 * Uç, HAZIR BELGE METNİNİ döndürür; sayfa onu kâğıda dizip yazdırır
 * (bkz. public/belge.js). Metnin sunucuda kurulmasının iki sebebi var:
 *
 *   · ALICININ ADI VERİTABANINDAN ÇÖZÜLÜR, adresten değil. Adres çubuğundaki
 *     adla basılsaydı belge "Ana Popescu" yerine yanlış yazılmış bir adla
 *     çıkabilir ve kimin belgesi olduğu belirsizleşirdi. Kimliğin gerçekten
 *     kayıtlı bir ekip üyesine ait olduğu ayrıca doğrulanır.
 *   · Belge, isteğin DİLİNDE üretilir (bkz. routes/rapor.mjs'deki aynı karar):
 *     kalıp cümleler sözlükten gelir, tarihler seçili dilin biçimiyle yazılır.
 *
 * YETKİ
 * - Koordinatör her kuruma ve her kişiye belge üretir.
 * - Ortak hesabı yalnızca KENDİ KURUMUNUN ekibine ve kendi kurumuna üretir.
 * - Listede olmayan kişi (konuşmacı, destek veren) için serbest ad herkese
 *   açıktır: o kişinin kaydı yoktur ve olması da beklenmez.
 *
 * ÖN KOŞUL YOKTUR — GençTek'teki "rapor yazılmadan, yoklama alınmadan belge
 * üretilemez" kapısı buraya taşınmadı. Orada belge bir katılımın kanıtıydı ve
 * kişinin profiline katılım düşürüyordu; burada öyle bir bağ yok, belge
 * etkinlikten bağımsız olarak da (proje geneline) üretilebiliyor.
 *
 * KAYITLI BELGELER (/api/belge/kayitlar): belgenin ayarları ad verilerek
 * saklanır, sonradan açılıp yeniden yazdırılır ya da düzenlenir. Kayıt,
 * kaydı yapan kişinin kurumuna aittir; ortak yalnızca kendi kurumunun
 * kayıtlarını görür ve değiştirir, koordinatör hepsini. Kaydetmeden önce
 * belge GERÇEKTEN ÜRETİLİR: yetkisi olmayan ya da üretilemeyen bir ayar
 * kaydedilemez.
 */
export function belgeRoutes({ db }) {
  /** Virgüllü kimlik listesi; boş parametre "hiçbiri" demektir. */
  const kimlikler = ham => {
    const metin = (ham || '').trim();
    if (!metin) return [];
    if (!/^[^,]+(,[^,]+)*$/.test(metin)) throw new ValidationError('belge.hata.secim');
    return [...new Set(metin.split(','))];
  };

  /** Sorgudan belge destesini üretir; GET /api/belge ve kaydetme paylaşır. */
  async function uret(sorgu, user, dil) {
    const tur = sorgu.get('tur') || 'katilim';
    if (!belgeTuruMu(tur)) throw new ValidationError('belge.hata.tur');

    const { sozluk } = await dictionary(dil);
    const m = metinler(sozluk, dil);
    const t = m.t;

    /* --- Etkinlik (isteğe bağlı) ---------------------------------------
       Seçilmezse belge projenin kendisine yazılır; asıl istenen bu. */
    const etkinlikId = sorgu.get('etkinlik') || '';
    let etkinlik = null;
    if (etkinlikId) {
      if (!/^\d{1,9}$/.test(etkinlikId)) throw new ValidationError('belge.hata.etkinlik');
      const row = await db.get(
        'SELECT id,slug,wp,kod,baslik,ozet,baslangic,bitis,lider,tur FROM events WHERE id=?', [Number(etkinlikId)]);
      if (!row) throw new ValidationError('belge.hata.etkinlik');
      const kayit = { ...row, baslangic: String(row.baslangic).slice(0, 10), bitis: String(row.bitis).slice(0, 10) };
      etkinlik = {
        id: kayit.id,
        baslik: m.baslik(kayit),
        tarih: tarihAraligi(m, kayit.baslangic, kayit.bitis),
        /* Ev sahibi = etkinliği yürüten (lider) kurum. Logosu belgede
           gösterilir (public/kurum-logo-<kurum>.png); dosyası olmayan
           kurumda arayüz logoyu sessizce atlar. Fikri çıktıda (cikti) lider
           "yürüten" kurumdur, ev sahibi değil: orada gösterilmez. */
        evSahibi: row.tur !== 'cikti' && partnerOf(row.lider) ? { id: row.lider, ad: partnerOf(row.lider).name } : null,
      };
    }

    /* --- Alıcılar ------------------------------------------------------
       Adaylar KAYITLI olanlardır: ekip üyeleri ve ortak kurumlar. Anahtar
       "uye:12" / "kurum:hbv" biçiminde; iki liste tek seçim kutusunda yan
       yana durduğu için tek anahtar alanı ikisini de taşır. */
    const uyeler = await db.all('SELECT id,partner,ad,rol,aktif FROM team ORDER BY partner, ad');
    const adaylar = [
      ...uyeler.map(u => ({
        anahtar: `uye:${u.id}`,
        partner: u.partner,
        ad: u.ad,
        /* Kişinin altına kurumu ve ülkesi yazılır: belgeyi okuyan, kişinin
           hangi ortak kurumdan katıldığını görmeli. */
        altAd: [partnerOf(u.partner)?.name, t(`ulke.${partnerOf(u.partner)?.country}`)].filter(Boolean).join(' · '),
        /* Özel metindeki [Kurum Adı] / [Ülke] yer tutucuları için. */
        kurum: partnerOf(u.partner)?.name || '',
        ulke: partnerOf(u.partner) ? t(`ulke.${partnerOf(u.partner).country}`) : '',
      })),
      ...partners.map(p => ({
        anahtar: `kurum:${p.id}`,
        partner: p.id,
        ad: p.name,
        altAd: t(`ulke.${p.country}`),
        kurum: p.name,
        ulke: t(`ulke.${p.country}`),
      })),
    ];

    const istenenler = kimlikler(sorgu.get('alicilar'));
    for (const anahtar of istenenler) {
      const aday = adaylar.find(a => a.anahtar === anahtar);
      if (!aday) throw new ValidationError('belge.hata.secim');
      /* Ortak hesabı başka kurumun kişisine belge basamaz; koordinatör
         serbesttir. Arayüz zaten yalnızca kendi kurumunu gösteriyor, bu
         satır adresi elle yazana karşı. */
      if (!user.koordinator && aday.partner !== user.partner) throw new YetkiHatasi();
    }

    /* Listede olmayan kişi: serbest ad. Her satır bir belge. */
    const serbest = sorgu.getAll('ad')
      .flatMap(deger => String(deger).split('\n'))
      .map(deger => deger.trim())
      .filter(Boolean)
      .map(deger => ({ anahtar: null, ad: aliciAdiniCoz(deger), altAd: '' }));

    /* İsimsiz yedek belge: adı elle yazılır (bkz. lib/belge.mjs · BOS_ALAN). */
    const bos = bosSayisiniCoz(sorgu.get('bos'));

    const alicilar = topluAlicilariSec({ adaylar, istenenler, serbest, bos, dil });

    const ozelMetin = ozelMetniCoz(sorgu.get('metin'));
    const imza = imzaBilgisiniCoz({
      ad: sorgu.get('imzaAd'),
      unvan: sorgu.get('imzaUnvan'),
      varsayilanUnvan: imzaUnvaniOner(user, t),
    });

    const kisa = (ham, max) => {
      const deger = String(ham ?? '').trim().replace(/\s+/g, ' ');
      if (deger.length > max) throw new ValidationError('belge.hata.unvanUzun');
      return deger;
    };
    const baslik = kisa(sorgu.get('baslik'), 120);
    const giris = kisa(sorgu.get('giris'), 200);

    const belgeler = alicilar.map(alici => belgeMetniUret({
      tur, ad: alici.ad, altAd: alici.altAd, kurum: alici.kurum, ulke: alici.ulke, bos: !!alici.bos, etkinlik, ozelMetin, baslik, giris, t,
    }));

    return {
      belgeler,
      imza,
      etkinlik,
      azami: MAX_BELGE,
      kunye: {
        proje: t('site.ad'),
        program: t('altbilgi.program'),
        projeNo: PROJECT.formId,
        finanse: t('ab.finanse'),
        feragat: t('altbilgi.feragat'),
        /* Belgenin alt ortasında, ev sahibi olmayan belgelerde gösterilir. */
        koordinator: (k => k && { id: k.id, ad: k.name })(partners.find(o => o.coordinator)),
      },
    };
  }

  const KAYIT_SUTUN = `k.id,k.ad,k.partner,k.ayar,k.sayi,k.created,k.updated,
    o.ad AS olusturan_ad, g.ad AS guncelleyen_ad`;
  const KAYIT_KAYNAK = `belge_kayit k LEFT JOIN users o ON o.id=k.olusturan LEFT JOIN users g ON g.id=k.guncelleyen`;
  const kayitCikti = k => {
    const ayar = new URLSearchParams(k.ayar);
    return {
      id: Number(k.id), ad: k.ad, partner: k.partner, ayar: k.ayar, sayi: Number(k.sayi),
      tur: ayar.get('tur') || 'katilim', etkinlik: ayar.get('etkinlik') ? Number(ayar.get('etkinlik')) : null,
      olusturan: k.olusturan_ad || '', guncelleyen: k.guncelleyen_ad || '', created: k.created, updated: k.updated,
    };
  };
  const kayitGetir = async (id, user) => {
    const k = await db.get(`SELECT ${KAYIT_SUTUN} FROM ${KAYIT_KAYNAK} WHERE k.id=?`, [id]);
    /* Başka kurumun kaydı "yok" sayılır: varlığı da sızmasın. */
    return k && (user.koordinator || k.partner === user.partner) ? k : null;
  };

  /** Gövdeden ad + ayarı okur, belgeyi üreterek doğrular. */
  const kayitGovdesi = async (req, user, dil) => {
    const g = await body(req);
    const ad = kayitAdiniCoz(g.ad);
    const ayar = kayitAyariniCoz(g.ayar);
    const { belgeler } = await uret(ayar, user, dil);
    return { ad, ayar: ayar.toString(), sayi: belgeler.length };
  };

  async function kayitlar({ req, res, user, dil, id }) {
    if (!id && req.method === 'GET') {
      const satirlar = await db.all(
        `SELECT ${KAYIT_SUTUN} FROM ${KAYIT_KAYNAK} ${user.koordinator ? '' : 'WHERE k.partner=?'} ORDER BY k.updated DESC, k.id DESC`,
        user.koordinator ? [] : [user.partner]);
      return send(res, 200, { kayitlar: satirlar.map(kayitCikti) });
    }
    if (!id && req.method === 'POST') {
      const { ad, ayar, sayi } = await kayitGovdesi(req, user, dil);
      const simdi = new Date().toISOString();
      const yeni = await db.insert(
        'INSERT INTO belge_kayit (ad,partner,ayar,sayi,olusturan,guncelleyen,created,updated) VALUES (?,?,?,?,?,?,?,?)',
        [ad, user.partner, ayar, sayi, user.id, user.id, simdi, simdi]);
      return send(res, 201, { kayit: kayitCikti(await kayitGetir(Number(yeni), user)) });
    }
    if (!id) return send(res, 405, { error: 'genel.hata' });

    const kayit = await kayitGetir(id, user);
    if (!kayit) return send(res, 404, { error: 'belge.hata.kayitYok' });
    if (req.method === 'GET') return send(res, 200, { kayit: kayitCikti(kayit) });
    if (req.method === 'PUT') {
      const { ad, ayar, sayi } = await kayitGovdesi(req, user, dil);
      await db.run('UPDATE belge_kayit SET ad=?, ayar=?, sayi=?, guncelleyen=?, updated=? WHERE id=?',
        [ad, ayar, sayi, user.id, new Date().toISOString(), id]);
      return send(res, 200, { kayit: kayitCikti(await kayitGetir(id, user)) });
    }
    if (req.method === 'DELETE') {
      await db.run('DELETE FROM belge_kayit WHERE id=?', [id]);
      return send(res, 200, { ok: true });
    }
    return send(res, 405, { error: 'genel.hata' });
  }

  return async function handle({ req, res, url, user, dil }) {
    const kayitYolu = url.pathname.match(/^\/api\/belge\/kayitlar(?:\/(\d{1,9}))?$/);
    if (!(url.pathname === '/api/belge' && req.method === 'GET') && !kayitYolu) return;
    if (!user) return send(res, 401, { error: 'belge.hata.giris' });
    try {
      if (kayitYolu) return await kayitlar({ req, res, user, dil, id: kayitYolu[1] ? Number(kayitYolu[1]) : null });
      return send(res, 200, await uret(url.searchParams, user, dil));
    } catch (err) {
      if (err instanceof YetkiHatasi) return send(res, 403, { error: 'belge.hata.yetki' });
      throw err;
    }
  };
}
