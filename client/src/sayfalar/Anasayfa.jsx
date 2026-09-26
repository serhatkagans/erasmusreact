import { durum, t, ortakAdi, yerAdi, etkinlikBaslik, tarihAraligi, bugun, gunFarki } from '../ortak.js';
import { useVeri, useCapayaKaydir } from '../kancalar.js';
import { useBaslik } from '../bilesenler/Kabuk.jsx';

/**
 * Ana sayfa: projenin tanıtımı ve programın özeti. Sayaçlar, ilerleme
 * çubukları, yaklaşan etkinlikler ve iş paketi kartları canlı veriden
 * üretilir — takvimde bir şey değişince ana sayfa da değişir.
 */

/** Bayrak emojisi ülke kodundan türetilir; ayrı görsel dosyası gerekmez. */
const bayrak = kod => kod.length === 2
  ? String.fromCodePoint(...[...kod.toUpperCase()].map(c => 0x1f1e6 + c.charCodeAt(0) - 65))
  : '🌐';

const yuzde = (pay, payda) => (payda ? `${(pay / payda * 100).toFixed(1)}%` : '0%');

const CIKTI_KARTLARI = ['ihtiyac-analizi', 'ekitap', 'proje-formati', 'egitim-modulu', 'arac-seti', 'politika-raporu'];

export default function Anasayfa() {
  useBaslik(null);
  const { veri } = useVeri('api/etkinlikler');
  const { veri: ciktiVeri } = useVeri('api/ciktilar');
  const etkinlikler = veri?.etkinlikler;
  useCapayaKaydir(!!etkinlikler);

  return (
    <main id="icerik">
      <section className="kahraman">
        <div className="kapsayici kahraman-ic">
          <div>
            <span className="ustbaslik">{t('anasayfa.ustbaslik')}</span>
            <h1>{t('anasayfa.baslik')}</h1>
            <p className="kahraman-giris">{t('anasayfa.giris')}</p>
            <div className="kahraman-dugmeler">
              <a className="dugme dugme-birincil" href="takvim.html">{t('anasayfa.cta.takvim')}</a>
              <a className="dugme dugme-ikincil" href="#ispaketleri">{t('anasayfa.cta.ispaketleri')}</a>
            </div>
          </div>
          <Sayaclar etkinlikler={etkinlikler} ciktilar={ciktiVeri?.ciktilar} />
        </div>
      </section>

      <section className="bolum bolum-beyaz">
        <div className="kapsayici">
          <div className="bolum-bas">
            <span className="ustbaslik">{t('anasayfa.yaklasan.baslik')}</span>
            <h2>{t('anasayfa.yaklasan.baslik')}</h2>
            <p>{t('anasayfa.yaklasan.aciklama')}</p>
          </div>
          <div id="yaklasan" className="yaklasan-liste">{etkinlikler && <Yaklasanlar etkinlikler={etkinlikler} />}</div>
          <p className="bolum-devam"><a className="metin-bag" href="takvim.html">{t('anasayfa.yaklasan.tumu')}</a></p>
        </div>
      </section>

      <section className="bolum">
        <div className="kapsayici izgara izgara-genis">
          <div>
            <span className="ustbaslik">{t('anasayfa.amac.ustbaslik')}</span>
            <h2>{t('anasayfa.amac.ustbaslik')}</h2>
            <p className="amac-metin">{t('anasayfa.amac.metin')}</p>
          </div>
          <div>
            <h3 className="hedef-baslik">{t('anasayfa.hedef.baslik')}</h3>
            <ul className="hedef-liste">
              {[1, 2, 3, 4, 5].map(n => <li key={n}>{t(`anasayfa.hedef.${n}`)}</li>)}
            </ul>
          </div>
        </div>
      </section>

      <section className="bolum bolum-beyaz" id="ciktilar">
        <div className="kapsayici">
          <div className="bolum-bas">
            <span className="ustbaslik">{t('menu.ciktilar')}</span>
            <h2>{t('anasayfa.cikti.baslik')}</h2>
            <p>{t('anasayfa.cikti.aciklama')}</p>
          </div>
          <div className="izgara">
            {CIKTI_KARTLARI.map((slug, i) => {
              const c = ciktiVeri?.ciktilar.find(x => x.slug === slug);
              return (
                <a key={slug} className="kart kart-bag" href={`ciktilar.html#${slug}`}>
                  <div className="kart-numara">{i + 1}</div>
                  <h3>{t(`anasayfa.cikti.${i + 1}.baslik`)}</h3>
                  <p>{t(`anasayfa.cikti.${i + 1}.metin`)}</p>
                  <span className="kart-durum" data-durum={c?.durum}>{c ? t(`cikti.durum.${c.durum}`) : ''}</span>
                </a>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bolum" id="ispaketleri">
        <div className="kapsayici">
          <div className="bolum-bas">
            <span className="ustbaslik">{t('menu.ispaketleri')}</span>
            <h2>{t('anasayfa.ispaketleri.baslik')}</h2>
            <p>{t('anasayfa.ispaketleri.aciklama')}</p>
          </div>
          <div id="ispaketleri-izgara" className="izgara">
            {etkinlikler && durum.ispaketleri.map(wp => {
              const sayi = etkinlikler.filter(e => e.wp === wp).length;
              return (
                <article key={wp} className="kart wp-kart" data-wp={wp}>
                  <span className="ustbaslik">{t(`wp.${wp}.ad`)}</span>
                  <h3>{t(`wp.${wp}.baslik`)}</h3>
                  <p>{t(`wp.${wp}.ozet`)}</p>
                  {/* WP1 yönetim paketidir; takvimde ayrı aktivitesi yok, sayı yazılmaz. */}
                  {sayi > 0 && <p className="wp-sayi" style={{ marginTop: '12px' }}>{`${sayi} ${t('anasayfa.ispaketleri.aktivite')}`}</p>}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bolum bolum-beyaz" id="ortaklar">
        <div className="kapsayici">
          <div className="bolum-bas">
            <span className="ustbaslik">{t('menu.ortaklar')}</span>
            <h2>{t('anasayfa.ortaklar.baslik')}</h2>
            <p>{t('anasayfa.ortaklar.aciklama')}</p>
          </div>
          <div id="ortaklar-izgara" className="izgara">
            {etkinlikler && durum.ortaklar.map(o => {
              const liderlik = etkinlikler.filter(e => e.lider === o.id).length;
              return (
                <article key={o.id} className="kart ortak-kart">
                  <div className="ortak-ust">
                    <span className="bayrak" aria-hidden="true">{bayrak(o.country)}</span>
                    <span className={`rozet ${o.coordinator ? 'rozet-koordinator' : 'rozet-ortak'}`}>
                      {t(o.coordinator ? 'anasayfa.ortaklar.koordinator' : 'anasayfa.ortaklar.ortak')}
                    </span>
                  </div>
                  <h3>{o.name}</h3>
                  <div className="ortak-yer">{`${o.city} · ${yerAdi(o.country)}`}</div>
                  <div className="ortak-alt">
                    <span>{liderlik ? t('anasayfa.ortaklar.lider', { n: liderlik }) : ''}</span>
                    {o.web && <a className="metin-bag" href={o.web} target="_blank" rel="noopener noreferrer">{t('genel.web')}</a>}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bolum">
        <div className="kapsayici kapsayici-dar">
          <span className="ustbaslik">{t('anasayfa.kapsayicilik.baslik')}</span>
          <h2>{t('anasayfa.kapsayicilik.baslik')}</h2>
          <p>{t('anasayfa.kapsayicilik.metin')}</p>
        </div>
      </section>
    </main>
  );
}

function Sayaclar({ etkinlikler, ciktilar }) {
  const { start, end, months } = durum.proje;
  const simdi = bugun();
  const toplam = gunFarki(start, end);
  const gecen = Math.min(Math.max(gunFarki(start, simdi), 0), toplam);
  const oran = toplam > 0 ? gecen / toplam : 0;

  /* Başvuruda taahhüt edilen faaliyetlerden kaçı tamamlandı. Yalnızca resmî
     kayıtlar sayılır: ek etkinlikler taahhüdün ölçüsü değildir. */
  const resmi = etkinlikler?.filter(e => e.resmi) || [];
  const biten = resmi.filter(e => e.durum === 'tamamlandi').length;
  const suren = resmi.filter(e => e.durum === 'devam').length;

  /* Teslim edilen çıktılar: ara ürün (masa başı araştırma) sayılmaz. */
  const asil = ciktilar?.filter(c => !c.araUrun) || [];
  const teslim = asil.filter(c => c.durum === 'teslim').length;

  return (
    <div className="sayaclar">
      <div className="sayac"><strong id="sayac-sure">{months}</strong><span>{t('anasayfa.sayac.sure')}</span></div>
      <div className="sayac"><strong id="sayac-ortak">{durum.ortaklar.length}</strong><span>{t('anasayfa.sayac.ortak')}</span></div>
      <div className="sayac"><strong id="sayac-ulke">{new Set(durum.ortaklar.map(o => o.country)).size}</strong><span>{t('anasayfa.sayac.ulke')}</span></div>
      <div className="sayac"><strong id="sayac-etkinlik">{etkinlikler ? etkinlikler.length : '—'}</strong><span>{t('anasayfa.sayac.etkinlik')}</span></div>
      {/* İki ayrı ölçü: takvimde geçen süre ve gerçekten tamamlanan iş. */}
      <div className="ilerleme ilerleme-sure">
        <span className="ustbaslik">{t('anasayfa.ilerleme.baslik')}</span>
        <div className="ilerleme-ray"><div className="ilerleme-dolu" style={{ width: `${(oran * 100).toFixed(1)}%` }} /></div>
        <div className="ilerleme-alt">
          <span>{simdi < start
            /* Proje başlamadan "0 ay geçti" demek yerine geri sayım. */
            ? `${t('anasayfa.ilerleme.basladi')} ${gunFarki(simdi, start)} ${t('genel.gun')}`
            : t('anasayfa.ilerleme.gecen', { n: Math.floor(oran * months) })}</span>
          <span>{tarihAraligi(start, end)}</span>
        </div>
      </div>
      <div className="ilerleme ilerleme-is">
        <span className="ustbaslik">{t('anasayfa.faaliyet.baslik')}</span>
        <div className="ilerleme-ray"><div className="ilerleme-dolu" style={{ width: yuzde(biten, resmi.length) }} /></div>
        <div className="ilerleme-alt">
          <span>{etkinlikler ? t('anasayfa.faaliyet.tamam', { n: biten, toplam: resmi.length }) : ''}</span>
          <span>{suren ? t('anasayfa.faaliyet.devam', { n: suren }) : ''}</span>
        </div>
      </div>
      <div className="ilerleme ilerleme-is">
        <span className="ustbaslik">{t('anasayfa.teslim.baslik')}</span>
        <div className="ilerleme-ray"><div className="ilerleme-dolu" style={{ width: yuzde(teslim, asil.length) }} /></div>
        <div className="ilerleme-alt">
          <span>{ciktilar ? t('anasayfa.teslim.metin', { n: teslim, toplam: asil.length }) : ''}</span>
          <a className="metin-bag" href="ciktilar.html">{t('anasayfa.teslim.tumu')}</a>
        </div>
      </div>
    </div>
  );
}

function Yaklasanlar({ etkinlikler }) {
  const simdi = bugun();
  /* Süren ve gelecek etkinlikler; en fazla beş satır — tam liste takvimde. */
  const liste = etkinlikler
    .filter(e => e.bitis >= simdi && e.durum !== 'ertelendi')
    .sort((a, b) => a.baslangic.localeCompare(b.baslangic))
    .slice(0, 5);
  if (!liste.length) return <p className="bos-durum">{t('anasayfa.yaklasan.bos')}</p>;
  const ayKisa = new Intl.DateTimeFormat(durum.dil, { timeZone: 'UTC', month: 'short' });
  return liste.map(e => {
    const bas = new Date(e.baslangic + 'T00:00:00Z');
    const kalanGun = gunFarki(simdi, e.baslangic);
    return (
      <a key={e.id} className="yaklasan" data-wp={e.wp} href={`takvim.html#etkinlik-${e.id}`}>
        <div className="yaklasan-tarih"><strong>{bas.getUTCDate()}</strong><span>{ayKisa.format(bas)}</span></div>
        <div>
          <div className="yaklasan-ad">{etkinlikBaslik(e)}</div>
          <div className="yaklasan-alt">
            <span>{t(`tur.${e.tur}`)}</span><span>{yerAdi(e.yer)}</span><span>{ortakAdi(e.lider)}</span>
          </div>
        </div>
        <span className="yaklasan-kalan">{kalanGun < 0 ? t('anasayfa.yaklasan.suruyor')
          : kalanGun === 0 ? t('anasayfa.yaklasan.bugun')
            : t('anasayfa.yaklasan.kalan', { n: kalanGun })}</span>
      </a>
    );
  });
}
