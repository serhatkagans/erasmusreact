import { useEffect, useRef, useState } from 'react';
import { durum, t, yerAdi } from '../ortak.js';
import { useCapayaKaydir } from '../kancalar.js';
import { useBaslik } from '../bilesenler/Kabuk.jsx';
import Kure from './Kure.jsx';
import '../styles/tanitim.css';

/**
 * Tanıtım (landing) sayfası: ana adresi oturumsuz açan ziyaretçi projeyi
 * buradan tanır. Düzen erasmusdays.eu'dan esinlenir — iri başlıklı giriş,
 * "nedir" bölümü, rakam bandı, kartlar, yol haritası, takip çağrısı.
 *
 * Yalnızca açılış verisini (künye, ortaklar, sözlük) kullanır; program
 * verisi girişin arkasındadır ve burada istenmez (istense 401 dönerdi).
 */

const bayrak = kod => kod.length === 2
  ? String.fromCodePoint(...[...kod.toUpperCase()].map(c => 0x1f1e6 + c.charCodeAt(0) - 65))
  : '🌐';

/* Çıktı kartlarının simgeleri: 24×24 çizgi çizimleri, sırası anasayfa.cikti.N ile aynı. */
const CIKTI_SIMGE = [
  <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  <><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 21V5M8 7h7" /></>,
  <><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></>,
  <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4M10 8l4 2-4 2z" /></>,
  <><path d="M3 9h18v10H3zM8 9V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3M3 14h18" /></>,
  <><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h7M9 17h5" /></>,
];

const KIM = [1, 2, 3];

export default function Tanitim() {
  useBaslik(null);
  useCapayaKaydir(true);
  const { proje, ortaklar } = durum;
  const ulkeler = [...new Set(ortaklar.map(o => o.country))];

  return (
    <main id="icerik" className="tanitim">
      <section className="tn-kahraman">
        <div className="kapsayici tn-kahraman-ic">
          <div>
            <span className="tn-rozet"><span aria-hidden="true">●</span> {t('tanitim.rozet')}</span>
            <h1>
              {t('tanitim.baslik.1')} <span className="tn-vurgu">{t('tanitim.baslik.2')}</span>
            </h1>
            <p className="tn-giris">{t('anasayfa.giris')}</p>
            <div className="tn-dugmeler">
              <a className="dugme dugme-birincil tn-dugme-buyuk" href="#hakkinda">{t('tanitim.cta.kesfet')}</a>
              <a className="dugme tn-dugme-cizgi" href="giris.html">{t('menu.giris')}</a>
            </div>
            <p className="tn-tarih">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
              {t('altbilgi.sure')}
            </p>
          </div>
          <Kure ortaklar={ortaklar} />
        </div>
      </section>

      <section className="bolum tn-nedir" id="hakkinda">
        <div className="kapsayici tn-nedir-ic">
          <div className="tn-nedir-gorsel">
            <img src="logo-tam.jpg" alt="E-YOUTHPRENEUR" width="1510" height="310" />
          </div>
          <div>
            <span className="ustbaslik">{t('tanitim.nedir.ustbaslik')}</span>
            <h2>{t('tanitim.nedir.baslik')}</h2>
            <p className="tn-buyuk-metin">{t('tanitim.nedir.metin')}</p>
            <p>{t('anasayfa.amac.metin')}</p>
            <h3 className="tn-alt-baslik">{t('anasayfa.hedef.baslik')}</h3>
            <ul className="tn-hedefler">
              {[1, 2, 3, 4, 5].map(n => <li key={n}>{t(`anasayfa.hedef.${n}`)}</li>)}
            </ul>
          </div>
        </div>
      </section>

      <section className="tn-rakam" aria-labelledby="tn-rakam-baslik">
        <div className="kapsayici">
          <h2 id="tn-rakam-baslik" className="tn-rakam-baslik">{t('tanitim.rakam.baslik')}</h2>
          <div className="tn-rakamlar">
            <Rakam deger={proje.months} etiket={t('anasayfa.sayac.sure')} />
            <Rakam deger={ortaklar.length} etiket={t('anasayfa.sayac.ortak')} />
            <Rakam deger={ulkeler.length} etiket={t('anasayfa.sayac.ulke')} />
            <Rakam deger={CIKTI_SIMGE.length} etiket={t('tanitim.rakam.cikti')} />
            <Rakam deger={durum.ispaketleri.length} etiket={t('tanitim.rakam.ispaketi')} />
          </div>
        </div>
      </section>

      <section className="bolum bolum-beyaz" id="ciktilar">
        <div className="kapsayici">
          <div className="tn-bolum-bas">
            <div>
              <span className="ustbaslik">{t('menu.ciktilar')}</span>
              <h2>{t('anasayfa.cikti.baslik')}</h2>
            </div>
            <p>{t('anasayfa.cikti.aciklama')}</p>
          </div>
          <div className="tn-kartlar">
            {CIKTI_SIMGE.map((simge, i) => (
              <article key={i} className="tn-kart">
                <span className="tn-simge" aria-hidden="true"><svg viewBox="0 0 24 24">{simge}</svg></span>
                <h3>{t(`anasayfa.cikti.${i + 1}.baslik`)}</h3>
                <p>{t(`anasayfa.cikti.${i + 1}.metin`)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bolum" id="yol-haritasi">
        <div className="kapsayici">
          <div className="tn-bolum-bas">
            <div>
              <span className="ustbaslik">{t('menu.ispaketleri')}</span>
              <h2>{t('tanitim.yol.baslik')}</h2>
            </div>
            <p>{t('anasayfa.ispaketleri.aciklama')}</p>
          </div>
          <ol className="tn-yol">
            {durum.ispaketleri.map(wp => (
              <li key={wp} className="tn-adim" data-wp={wp}>
                <span className="tn-adim-no">{wp}</span>
                <h3>{t(`wp.${wp}.kisa`)}</h3>
                <p>{t(`wp.${wp}.ozet`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bolum bolum-beyaz">
        <div className="kapsayici">
          <div className="tn-bolum-bas">
            <div>
              <span className="ustbaslik">{t('tanitim.kim.ustbaslik')}</span>
              <h2>{t('tanitim.kim.baslik')}</h2>
            </div>
            <p>{t('anasayfa.kapsayicilik.metin')}</p>
          </div>
          <div className="tn-kim">
            {KIM.map(n => (
              <article key={n} className="tn-kim-kart" data-n={n}>
                <h3>{t(`tanitim.kim.${n}.baslik`)}</h3>
                <p>{t(`tanitim.kim.${n}.metin`)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bolum" id="ortaklar">
        <div className="kapsayici">
          <div className="tn-bolum-bas">
            <div>
              <span className="ustbaslik">{t('menu.ortaklar')}</span>
              <h2>{t('anasayfa.ortaklar.baslik')}</h2>
            </div>
            <p>{t('anasayfa.ortaklar.aciklama')}</p>
          </div>
          <div className="tn-ortaklar">
            {ortaklar.map(o => {
              const ic = (
                <>
                  <span className="tn-ortak-bayrak" aria-hidden="true">{bayrak(o.country)}</span>
                  <span className="tn-ortak-metin">
                    <strong>{o.name}</strong>
                    <span>{`${o.city} · ${yerAdi(o.country)}`}</span>
                  </span>
                  {o.coordinator && <span className="rozet rozet-koordinator">{t('anasayfa.ortaklar.koordinator')}</span>}
                </>
              );
              return o.web
                ? <a key={o.id} className="tn-ortak" href={o.web} target="_blank" rel="noopener noreferrer">{ic}</a>
                : <div key={o.id} className="tn-ortak">{ic}</div>;
            })}
          </div>
        </div>
      </section>

      <section className="tn-cagri" id="takip">
        <div className="kapsayici tn-cagri-ic">
          <div>
            <h2>{t('tanitim.takip.baslik')}</h2>
            <p>{t('tanitim.takip.metin')}</p>
            <div className="tn-sosyal">
              {proje.sosyal.map(s => (
                <a key={s.id} className="tn-sosyal-bag" href={s.url} target="_blank" rel="noopener noreferrer">{s.ad}</a>
              ))}
            </div>
          </div>
          <div className="tn-cagri-kart">
            <h3>{t('tanitim.ortak.baslik')}</h3>
            <p>{t('tanitim.ortak.metin')}</p>
            <a className="dugme dugme-birincil" href="giris.html">{t('menu.giris')}</a>
          </div>
        </div>
      </section>
    </main>
  );
}

/* Rakam bandı: ekrana girince sıfırdan sayar. Hareket azaltma tercihi
   varsa ya da gözlemci yoksa doğrudan son değer yazılır. */
function Rakam({ deger, etiket }) {
  const kutu = useRef(null);
  const [gosterilen, setGosterilen] = useState(deger);
  useEffect(() => {
    const el = kutu.current;
    if (!el || !('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setGosterilen(0);
    let kare;
    const gozlemci = new IntersectionObserver(([g]) => {
      if (!g.isIntersecting) return;
      gozlemci.disconnect();
      const bas = performance.now();
      const adim = an => {
        const oran = Math.min((an - bas) / 1100, 1);
        setGosterilen(Math.round(deger * (1 - (1 - oran) ** 3)));
        if (oran < 1) kare = requestAnimationFrame(adim);
      };
      kare = requestAnimationFrame(adim);
    }, { threshold: .4 });
    gozlemci.observe(el);
    return () => { gozlemci.disconnect(); cancelAnimationFrame(kare); };
  }, [deger]);
  return (
    <div className="tn-rakam-oge" ref={kutu}>
      <strong>{gosterilen}</strong>
      <span>{etiket}</span>
    </div>
  );
}
