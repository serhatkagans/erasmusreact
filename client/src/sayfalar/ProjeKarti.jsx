import { useState } from 'react';
import { durum, t, ortakAdi } from '../ortak.js';
import { useBaslik } from '../bilesenler/Kabuk.jsx';
import { SIMGE } from '../bilesenler/simgeler.jsx';
import Karekod from '../bilesenler/Karekod.jsx';

/**
 * Projenin genel kartı: `proje.html` (kısa adres `…/proje`). Oturum istemez.
 * Üyelerin profil kartı (`profil.html?u=…`) kişiseldir; bu kart projenin
 * kendisini tanıtır: logo, slogan, kısa tanıtım, web sitesi, resmî sosyal
 * medya hesapları, e-posta, karekod ve fon logoları. Canva'daki tanıtım
 * kartının (Eyouthpreneur Project, 2026) platformdaki karşılığıdır;
 * afişe, sunuma ya da NFC etiketine bu adres yazılır.
 */
export default function ProjeKarti() {
  const [karekod, setKarekod] = useState(false);
  const [kopyalandi, setKopyalandi] = useState(false);
  useBaslik('kart.baslik');

  const proje = durum.proje || {};
  /* Web sitesi düğmesi platformun ana adresine (tanıtım sayfası) gider;
     karekod ise bu kartın kendisini taşır. */
  const site = new URL('./', location.href).toString();
  const kartAdresi = new URL('proje.html', location.href).toString();

  const paylas = async () => {
    try {
      if (navigator.share) return await navigator.share({ title: t('site.ad'), text: t('profil.slogan'), url: kartAdresi });
      await navigator.clipboard.writeText(kartAdresi);
      setKopyalandi(true);
      setTimeout(() => setKopyalandi(false), 2000);
    } catch { /* Kullanıcı paylaşımı kapattı; yapılacak bir şey yok. */ }
  };

  return (
    <main className="profil-sayfa proje-kart-sayfa">
      <article className="profil-kart proje-kart" id="proje-kart">
        <div className="proje-kart-ust">
          <img className="proje-kart-logo" src="belge-logo-tam.png" alt={t('site.ad')} width="1510" height="354" />
        </div>

        <p className="proje-kart-slogan">{t('profil.slogan')}</p>
        <h1 className="proje-kart-ad">{t('site.ad')}</h1>
        <p className="proje-kart-kunye">{t('altbilgi.kunye')}</p>
        <p className="profil-metin proje-kart-metin">{t('profil.metin')}</p>

        <nav className="proje-kart-baglantilar" id="proje-kart-baglantilar" aria-label={t('profil.takip')}>
          <a className="profil-sosyal-bag proje-kart-site" href={site}>
            <svg viewBox="0 0 24 24" aria-hidden="true">{SIMGE.web}</svg>
            <span>{t('kart.site')}</span>
          </a>
          {(proje.sosyal || []).map(h => (
            <a key={h.id} className={`profil-sosyal-bag profil-sosyal-${h.id}`} href={h.url} target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 24 24" aria-hidden="true">{SIMGE[h.id]}</svg>
              <span>{t(`kart.sosyal.${h.id}`)}</span>
            </a>
          ))}
          {proje.eposta && (
            <a className="profil-sosyal-bag profil-sosyal-eposta" href={`mailto:${proje.eposta}`}>
              <svg viewBox="0 0 24 24" aria-hidden="true">{SIMGE.eposta}</svg>
              <span>{proje.eposta}</span>
            </a>
          )}
          <button type="button" className="profil-sosyal-bag profil-sosyal-rehber" id="proje-kart-karekod-ac"
            aria-expanded={karekod} onClick={() => setKarekod(a => !a)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">{SIMGE.karekod}</svg>
            <span>{t(karekod ? 'profil.karekodGizle' : 'profil.karekod')}</span>
          </button>
        </nav>

        {karekod && (
          <figure className="profil-karekod proje-kart-karekod" id="proje-kart-karekod">
            <Karekod metin={kartAdresi} />
            <figcaption>{t('kart.karekodIpucu')}</figcaption>
          </figure>
        )}

        <div className="profil-eylem">
          <button type="button" className="dugme dugme-hayalet" id="proje-kart-paylas" onClick={paylas}>
            {t(kopyalandi ? 'profil.kopyalandi' : 'kart.paylas')}
          </button>
          <a className="dugme dugme-hayalet" href="bulten.html">{t('kart.bulten')}</a>
        </div>

        <footer className="proje-kart-logolar">
          <img src="ulusal-ajans.png" alt={t('ab.logo.ajans')} width="244" height="128" />
          <img src="kurum-logo-hbv.png" alt={ortakAdi('hbv')} width="1556" height="360" />
          <img src="ab-ortak-finanse.svg" alt={t('ab.logo.ortak')} width="163" height="31" />
        </footer>
      </article>
    </main>
  );
}
