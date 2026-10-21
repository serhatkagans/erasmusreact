import { useState } from 'react';
import { durum, t, iste, ortakKisa, etkinlikBaslik, tamTarih, tarihAraligi, ayYil, bugun } from '../ortak.js';
import { useVeri } from '../kancalar.js';
import { useKonum } from '../yonlendirme.js';
import { useBaslik } from '../bilesenler/Kabuk.jsx';
import Kutu, { bildir, onayla } from '../bilesenler/Kutu.jsx';
import '../styles/bulten.css';

/**
 * Aylık bülten (GET /api/bulten?ay=…): projenin o ay ne yaptığı ve ne
 * yapacağı. Listeler takvimden, görevlerden, formlardan ve klasörlerden
 * türer; koordinatör her ay için "öne çıkanlar" ve "hedefler" notu yazar.
 * Ay adresle seçilir (`bulten.html?ay=2026-09`), bağlantı paylaşılabilir.
 */

const ayAdi = ay => { const [y, a] = ay.split('-').map(Number); return ayYil(y, a - 1); };

/** Koordinatör notu: "-" ya da "•" ile başlayan satırlar madde olur. */
function NotMetni({ metin }) {
  const bloklar = [];
  for (const satir of metin.split('\n')) {
    const madde = satir.match(/^\s*[-•*]\s+(.*)$/);
    if (madde) {
      const son = bloklar.at(-1);
      if (son?.tur === 'liste') son.ogeler.push(madde[1]); else bloklar.push({ tur: 'liste', ogeler: [madde[1]] });
    } else if (satir.trim()) bloklar.push({ tur: 'p', metin: satir.trim() });
  }
  return bloklar.map((b, i) => (b.tur === 'liste'
    ? <ul key={i}>{b.ogeler.map((o, j) => <li key={j}><Baglantili metin={o} /></li>)}</ul>
    : <p key={i}><Baglantili metin={b.metin} /></p>));
}

/* Nottaki web ve e-posta adresleri tıklanabilir olur. */
const ADRES = /(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)]|[\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g;
function Baglantili({ metin }) {
  return metin.split(ADRES).map((parca, i) => {
    if (i % 2 === 0) return parca;
    const eposta = !parca.startsWith('http');
    const gorunen = eposta ? parca : parca.replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '').replace(/\/$/, '');
    return <a key={i} href={eposta ? `mailto:${parca}` : parca} target={eposta ? undefined : '_blank'} rel="noopener noreferrer">{gorunen}</a>;
  });
}

function Satir({ href, baslik, alt, rozet, rozetSinif = '' }) {
  const ic = (
    <>
      <span className="pano-satir-govde">
        <strong>{baslik}</strong>
        {alt && <span className="pano-satir-alt">{alt}</span>}
      </span>
      {rozet && <span className={`pano-rozet ${rozetSinif}`}>{rozet}</span>}
    </>
  );
  /* Ziyaretçi kayıtları açamaz (giriş ister): satır bağlantısız çizilir. */
  if (!durum.kullanici) href = null;
  return <li>{href ? <a className="pano-satir" href={href}>{ic}</a> : <div className="pano-satir">{ic}</div>}</li>;
}

/** Başlıklı küme; boşsa hiç çizilmez. */
function Kume({ baslik, satirlar }) {
  if (!satirlar.length) return null;
  return (
    <div className="bulten-kume">
      <h3>{t(baslik)} <span className="bulten-kume-sayi">{satirlar.length}</span></h3>
      <ul className="pano-liste">{satirlar.map((s, i) => <Satir key={i} {...s} />)}</ul>
    </div>
  );
}

function Rakam({ n, metin }) {
  return (
    <div className="bulten-rakam">
      <strong>{n}</strong>
      <span>{t(metin)}</span>
    </div>
  );
}

const faaliyetSatiri = (e, rozet, rozetSinif) => ({
  href: `takvim.html#etkinlik-${e.id}`, baslik: etkinlikBaslik(e),
  alt: `${e.wp}${e.kod ? ' ' + e.kod : ''} · ${tarihAraligi(e.baslangic, e.bitis)} · ${ortakKisa(e.lider)}`,
  rozet, rozetSinif,
});

const gorevSatiri = (g, rozet, rozetSinif) => ({
  href: 'ekip.html', baslik: g.baslik,
  alt: [ortakKisa(g.partner), g.uye, g.son_tarih && tamTarih(g.son_tarih)].filter(Boolean).join(' · '),
  rozet, rozetSinif,
});

/* Bitmemiş işin rozeti: süre geçtiyse kırmızı "gecikti", yoksa durumu. */
const acikRozet = (x, durumMetni) => (x.gecikti
  ? [t('bulten.gecikti'), 'pano-rozet-kirmizi']
  : [durumMetni, x.durum === 'devam' ? 'pano-rozet-amber' : '']);

export default function Bulten() {
  useBaslik('bulten.baslik');
  const { params } = useKonum();
  const istenen = params.get('ay') || '';
  const { veri: b, yenile } = useVeri(`api/bulten${istenen ? `?ay=${istenen}` : ''}`);
  const [duzenle, setDuzenle] = useState(false);

  let govde = null;
  if (b) {
    const y = b.yapilanlar;
    const z = b.yapilacaklar;

    const yapFaaliyet = y.faaliyet.map(e => faaliyetSatiri(e, t('durum.tamamlandi'), 'bulten-rozet-yesil'));
    const yapGorev = y.gorev.map(g => gorevSatiri(g, t('bulten.tamam'), 'bulten-rozet-yesil'));
    const yapCikti = y.cikti.map(c => ({ href: `ciktilar.html#${c.slug}`, baslik: t(`${c.anahtar}.baslik`),
      alt: c.sorumlu ? ortakKisa(c.sorumlu) : '', rozet: t('cikti.durum.teslim'), rozetSinif: 'bulten-rozet-yesil' }));
    const yapForm = [
      ...y.formYayin.map(f => ({ href: `formlar.html#form-${f.id}`, baslik: f.baslik,
        alt: t('bulten.formYayinlandi', { tarih: tamTarih(f.tarih) }) })),
      ...y.formYanit.map(f => ({ href: `formlar.html#form-${f.id}`, baslik: f.baslik,
        alt: t('bulten.yanitGeldi'), rozet: t('bulten.yanitSayi', { n: f.n }) })),
    ];
    const yapDosya = [
      ...y.faaliyetDosya.map(f => ({ href: `takvim.html#etkinlik-${f.id}`, baslik: etkinlikBaslik(f),
        alt: f.turler.map(x => t(`faaliyet.parca.${x}`)).join(', '), rozet: t('bulten.faaliyetDosyasi') })),
      ...y.dosya.slice(0, 10).map(d => ({ href: `klasorler.html#${d.klasor}`, baslik: d.ad,
        alt: [d.klasor, ortakKisa(d.partner), d.yukleyen, tamTarih(d.tarih)].filter(Boolean).join(' · ') })),
    ];
    if (!b.uye && b.klasorDosyaSayi) yapDosya.push({ baslik: t('bulten.klasorDosya', { n: b.klasorDosyaSayi }) });
    if (y.dosya.length > 10) yapDosya.push({ href: 'klasorler.html', baslik: t('bulten.dahaFazla', { n: y.dosya.length - 10 }) });
    if (y.fotograf) yapDosya.push({ href: 'takvim.html', baslik: t('bulten.fotograf', { n: y.fotograf }) });
    if (y.ciktiDosya) yapDosya.push({ href: 'ciktilar.html', baslik: t('bulten.ciktiDosya', { n: y.ciktiDosya }) });

    const zFaaliyet = z.faaliyet.map(e => faaliyetSatiri(e, ...acikRozet(e, e.baslangic <= bugun() && e.durum !== 'ertelendi'
      ? t('durum.devam') : t(`durum.${e.durum}`))));
    const zGorev = z.gorev.map(g => gorevSatiri(g, ...acikRozet(g, `%${g.ilerleme}`)));
    const zCikti = z.cikti.map(c => {
      const [rozet, rozetSinif] = acikRozet(c, t(`cikti.durum.${c.durum}`));
      return { href: `ciktilar.html#${c.slug}`, baslik: t(`${c.anahtar}.baslik`),
        alt: [c.sorumlu && ortakKisa(c.sorumlu), tamTarih(c.teslim)].filter(Boolean).join(' · '), rozet, rozetSinif };
    });
    const zForm = z.form.map(f => ({ href: `formlar.html#form-${f.id}`, baslik: f.baslik,
      alt: t('bulten.formSonGun', { tarih: tamTarih(f.sonTarih) }), rozet: t('bulten.yanitSayi', { n: f.yanit }) }));

    const sFaaliyet = b.sonraki.faaliyet.map(e => faaliyetSatiri(e, t(`durum.${e.durum}`)));
    const sGorev = b.sonraki.gorev.map(g => gorevSatiri(g, `%${g.ilerleme}`));

    const yapilanSayi = yapFaaliyet.length + yapGorev.length + yapCikti.length + yapForm.length + yapDosya.length;
    const yapilacakSayi = zFaaliyet.length + zGorev.length + zCikti.length + zForm.length;
    const dosyaSayi = b.klasorDosyaSayi + y.faaliyetDosya.length + y.fotograf + y.ciktiDosya;
    const yanitSayi = y.formYanit.reduce((n, f) => n + f.n, 0);

    govde = (
      <>
        <div className="bulten-rakamlar">
          <Rakam n={y.faaliyet.length + y.gorev.length + y.cikti.length} metin="bulten.r.tamamlanan" />
          <Rakam n={dosyaSayi} metin="bulten.r.dosya" />
          <Rakam n={yanitSayi} metin="bulten.r.yanit" />
          <Rakam n={yapilacakSayi} metin={b.gecmis ? 'bulten.r.kalan' : 'bulten.r.yapilacak'} />
        </div>

        {(b.fotolar.length > 0 || b.duzenleyebilir) && <Fotolar b={b} yenile={yenile} />}

        <div className="bulten-izgara">
          <section className="pano-kutu bulten-sutun bulten-yapilan" aria-labelledby="bulten-yapilan">
            <div className="pano-kutu-bas"><h2 id="bulten-yapilan">{t('bulten.yapilanlar')}</h2></div>
            {b.not.yapilanlar && (
              <div className="bulten-not"><span className="bulten-not-bas">{t('bulten.oneCikanlar')}</span><NotMetni metin={b.not.yapilanlar} /></div>
            )}
            <Kume baslik="bulten.k.faaliyet" satirlar={yapFaaliyet} />
            <Kume baslik="bulten.k.gorev" satirlar={yapGorev} />
            <Kume baslik="bulten.k.cikti" satirlar={yapCikti} />
            <Kume baslik="bulten.k.form" satirlar={yapForm} />
            <Kume baslik="bulten.k.dosya" satirlar={yapDosya} />
            {!yapilanSayi && !b.not.yapilanlar && <p className="pano-bos">{t('bulten.yapilanlar.bos')}</p>}
          </section>

          <section className="pano-kutu bulten-sutun bulten-yapilacak" aria-labelledby="bulten-yapilacak">
            <div className="pano-kutu-bas">
              <h2 id="bulten-yapilacak">{t(b.gecmis ? 'bulten.kalanlar' : 'bulten.yapilacaklar')}</h2>
            </div>
            {b.not.yapilacaklar && (
              <div className="bulten-not"><span className="bulten-not-bas">{t('bulten.hedefler')}</span><NotMetni metin={b.not.yapilacaklar} /></div>
            )}
            <Kume baslik="bulten.k.faaliyet" satirlar={zFaaliyet} />
            <Kume baslik="bulten.k.gorev" satirlar={zGorev} />
            <Kume baslik="bulten.k.cikti" satirlar={zCikti} />
            <Kume baslik="bulten.k.form" satirlar={zForm} />
            {!yapilacakSayi && !b.not.yapilacaklar && <p className="pano-bos">{t(b.gecmis ? 'bulten.kalanlar.bos' : 'bulten.yapilacaklar.bos')}</p>}
          </section>
        </div>

        <section className="pano-kutu bulten-sonraki" aria-labelledby="bulten-sonraki">
          <div className="pano-kutu-bas">
            <h2 id="bulten-sonraki">{t('bulten.sonraki', { ay: ayAdi(b.sonrakiAy) })}</h2>
            <span className="pano-sayi">{String(sFaaliyet.length + sGorev.length)}</span>
          </div>
          <Kume baslik="bulten.k.faaliyet" satirlar={sFaaliyet} />
          <Kume baslik="bulten.k.gorev" satirlar={sGorev} />
          {!sFaaliyet.length && !sGorev.length && <p className="pano-bos">{t('bulten.sonraki.bos')}</p>}
        </section>

        {b.not.updated && b.not.yazan && (
          <p className="bulten-imza">{t('bulten.notYazan', { ad: b.not.yazan, tarih: tamTarih(b.not.updated.slice(0, 10)) })}</p>
        )}
      </>
    );
  }

  return (
    <main id="icerik">
      <section className="kapsayici sayfa-bas">
        <span className="ustbaslik">{`${t('bulten.ust')} · ${durum.proje?.acronym || ''}`}</span>
        <h1>{b ? ayAdi(b.ay) : t('bulten.baslik')}</h1>
        <p>{t(b?.ay === durum.proje?.start?.slice(0, 7) ? 'bulten.giris.baslangic' : b && b.ay < (durum.proje?.start || '') ? 'bulten.giris.hazirlik' : 'bulten.giris')}</p>
        {b && (
          <div className="bulten-arac">
            <nav className="gorunum bulten-aylar" aria-label={t('bulten.aylar')}>
              {[...b.aylar].reverse().map(ay => (
                <a key={ay} href={`bulten.html?ay=${ay}`} aria-current={ay === b.ay ? 'page' : undefined}>{ayAdi(ay)}</a>
              ))}
            </nav>
            <div className="bulten-eylem">
              {b.duzenleyebilir && (
                <button type="button" className="dugme dugme-ikincil" onClick={() => setDuzenle(true)}>{t('bulten.notDuzenle')}</button>
              )}
              <button type="button" className="dugme dugme-ikincil" onClick={() => print()}>{t('bulten.yazdir')}</button>
            </div>
          </div>
        )}
      </section>
      <div className="kapsayici bulten">{govde}</div>
      {b?.duzenleyebilir && <NotKutusu acik={duzenle} b={b} kapat={() => setDuzenle(false)} yenile={yenile} />}
    </main>
  );
}

/** Ayın fotoğrafları. Koordinatör ekler ve siler; büyük hâli yeni sekmede açılır. */
function Fotolar({ b, yenile }) {
  const [yukleniyor, setYukleniyor] = useState(false);
  const yukle = async dosyalar => {
    setYukleniyor(true);
    try {
      for (const dosya of dosyalar) {
        const yanit = await fetch(`api/bulten/${b.ay}/foto`, {
          method: 'POST', body: dosya, headers: { 'x-dosya-adi': encodeURIComponent(dosya.name) },
        });
        if (!yanit.ok) { const g = await yanit.json().catch(() => ({})); bildir(t(g.error || 'genel.hata'), 'hata'); break; }
      }
      yenile();
    } finally { setYukleniyor(false); }
  };
  const sil = async f => {
    if (!(await onayla(t('bulten.fotoSilSor'), { evet: t('genel.sil'), tehlike: true }))) return;
    try { await iste(`api/bulten/foto/${f.id}`, { method: 'DELETE' }); bildir(t('genel.silindi')); yenile(); }
    catch (err) { bildir(err.message, 'hata'); }
  };
  return (
    <section className="pano-kutu bulten-fotolar" aria-labelledby="bulten-foto-bas">
      <div className="pano-kutu-bas">
        <h2 id="bulten-foto-bas">{t('bulten.fotolar')}</h2>
        {b.duzenleyebilir && b.fotolar.length < b.maxFoto && (
          <label className="dugme dugme-ikincil dugme-kucuk bulten-eylem-dugme">
            {t(yukleniyor ? 'bulten.fotoYukleniyor' : 'bulten.fotoEkle')}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" multiple hidden disabled={yukleniyor}
              onChange={o => { const d = [...o.target.files]; o.target.value = ''; if (d.length) yukle(d); }} />
          </label>
        )}
      </div>
      {!b.fotolar.length
        ? <p className="pano-bos">{t('bulten.fotolar.bos')}</p>
        : (
          <ul className={`bulten-foto-izgara${b.fotolar.length === 1 ? ' tek' : ''}`}>
            {b.fotolar.map(f => (
              <li key={f.id}>
                <figure>
                  {f.tur.startsWith('video/')
                    ? <video src={`api/bulten/foto/${f.id}`} controls preload="metadata" playsInline aria-label={f.aciklama || f.ad} />
                    : (
                      <a href={`api/bulten/foto/${f.id}`} target="_blank" rel="noopener">
                        <img src={`api/bulten/foto/${f.id}`} alt={f.aciklama || f.ad} loading="lazy" />
                      </a>
                    )}
                  {f.aciklama && <figcaption>{f.aciklama}</figcaption>}
                </figure>
                {b.duzenleyebilir && (
                  <button type="button" className="bulten-foto-sil" aria-label={t('bulten.fotoSil')} onClick={() => sil(f)}>×</button>
                )}
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}

function NotKutusu({ acik, b, kapat, yenile }) {
  const [hata, setHata] = useState('');
  return (
    <Kutu acik={acik} onKapat={() => { setHata(''); kapat(); }} koru id="bulten-kutu">
      <form className="kutu-ic" onSubmit={async o => {
        o.preventDefault();
        const f = o.currentTarget;
        setHata('');
        try {
          await iste(`api/bulten/${b.ay}`, {
            method: 'PUT',
            body: JSON.stringify({ yapilanlar: f.yapilanlar.value, yapilacaklar: f.yapilacaklar.value }),
          });
          kapat();
          bildir(t('genel.kaydedildi'));
          yenile();
        } catch (err) { setHata(err.message); }
      }}>
        <div className="kutu-ust">
          <h2>{t('bulten.notBaslik', { ay: ayAdi(b.ay) })}</h2>
          <button type="button" className="kapat" data-kapat aria-label={t('genel.kapat')}>×</button>
        </div>
        <p className="alan-ipucu">{t('bulten.notIpucu')}</p>
        <div className="form-izgara">
          <label className="alan form-tam"><span>{t('bulten.oneCikanlar')}</span>
            <textarea name="yapilanlar" rows={6} maxLength={4000} defaultValue={b.not.yapilanlar} /></label>
          <label className="alan form-tam"><span>{t('bulten.hedefler')}</span>
            <textarea name="yapilacaklar" rows={6} maxLength={4000} defaultValue={b.not.yapilacaklar} /></label>
        </div>
        <p className="hata" role="alert">{hata}</p>
        <div className="kutu-eylem">
          <button type="submit" className="dugme dugme-birincil">{t('genel.kaydet')}</button>
          <button type="button" className="dugme dugme-ikincil" data-kapat>{t('genel.vazgec')}</button>
        </div>
      </form>
    </Kutu>
  );
}
