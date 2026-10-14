import { lazy, Suspense, useEffect } from 'react';
import { durum } from './ortak.js';
import { useKonum, git, ACIK_SAYFALAR } from './yonlendirme.js';
import Kabuk from './bilesenler/Kabuk.jsx';
import { OnayKutusu, Bildirimler } from './bilesenler/Kutu.jsx';

/* Her sayfa ayrı bir parça olarak yüklenir: giriş sayfası formlar
   düzenleyicisinin kodunu indirmek zorunda kalmasın. */
const SAYFA = {
  'index.html': lazy(() => import('./sayfalar/Anasayfa.jsx')),
  'tanitim': lazy(() => import('./sayfalar/Tanitim.jsx')),
  'pano.html': lazy(() => import('./sayfalar/Pano.jsx')),
  'takvim.html': lazy(() => import('./sayfalar/Takvim.jsx')),
  'ciktilar.html': lazy(() => import('./sayfalar/Ciktilar.jsx')),
  'ekip.html': lazy(() => import('./sayfalar/Ekip.jsx')),
  'formlar.html': lazy(() => import('./sayfalar/Formlar.jsx')),
  'belge.html': lazy(() => import('./sayfalar/Belge.jsx')),
  'klasorler.html': lazy(() => import('./sayfalar/Klasorler.jsx')),
  'drive.html': lazy(() => import('./sayfalar/Drive.jsx')),
  'kullanicilar.html': lazy(() => import('./sayfalar/Kullanicilar.jsx')),
  'giris.html': lazy(() => import('./sayfalar/Giris.jsx')),
  'profil.html': lazy(() => import('./sayfalar/Profil.jsx')),
};

export default function Uygulama() {
  const { sayfa, search } = useKonum();
  /* Ana adres oturumsuz ziyaretçiye projenin tanıtımını gösterir; giriş
     yapan aynı adreste canlı veriyle çizilen ana sayfayı görür. */
  const Sayfa = SAYFA[sayfa === 'index.html' && !durum.kullanici ? 'tanitim' : sayfa];

  /* KAPI (istemci tarafı). Asıl kapı sunucudadır (server.mjs); bu yalnızca
     oturum uygulama içindeyken düştüğünde (ör. süre doldu, başka sekmede
     çıkış yapıldı) kişiyi girişe götürür. */
  const kapali = !durum.kullanici && !ACIK_SAYFALAR.has(sayfa);
  useEffect(() => {
    if (!kapali) return;
    git(`giris.html?geri=${encodeURIComponent(sayfa + search)}`, { degistir: true });
  }, [kapali, sayfa, search]);

  return (
    <>
      <Kabuk logolar={sayfa === 'index.html'}>
        {Sayfa && !kapali
          ? <Suspense fallback={<main id="icerik" />}><Sayfa key={sayfa} /></Suspense>
          : <main id="icerik"><p className="bos-durum">{Sayfa ? '' : 'Sayfa bulunamadı.'}</p></main>}
      </Kabuk>
      <OnayKutusu />
      <Bildirimler />
    </>
  );
}
