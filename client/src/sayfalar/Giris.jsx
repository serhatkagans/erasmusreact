import { useRef, useState } from 'react';
import { t, iste } from '../ortak.js';
import { useBaslik } from '../bilesenler/Kabuk.jsx';

/**
 * Giriş. Platform dışarıya kapalı: oturumsuz her sayfa isteği buraya
 * `?geri=<sayfa>` ile yönlenir, girişten sonra o sayfaya dönülür.
 */
export default function Giris() {
  useBaslik('giris.baslik');
  const [hata, setHata] = useState('');
  const [bekliyor, setBekliyor] = useState(false);
  const parola = useRef(null);

  const gonder = async olay => {
    olay.preventDefault();
    const f = olay.currentTarget;
    setHata('');
    setBekliyor(true);
    try {
      await iste('api/giris', {
        method: 'POST',
        body: JSON.stringify({ kullanici: f.kullanici.value, parola: f.parola.value }),
      });
      /* Yalnızca bu sitenin sayfa adı kabul edilir; `geri=https://...` ile
         dışarı yönlendirme (açık yönlendirme) mümkün olmasın. Sayfa baştan
         yüklenir: oturum ve menü açılış verisiyle birlikte gelir. */
      const geri = new URLSearchParams(location.search).get('geri') || '';
      location.href = /^[a-z]+\.html(\?[\w=&%.-]*)?$/.test(geri) ? geri : 'pano.html';
    } catch (err) {
      setHata(err.message);
      f.parola.value = '';
      parola.current.focus();
      setBekliyor(false);
    }
  };

  return (
    <main className="giris-sayfa">
      <form id="giris-form" className="giris-kart" onSubmit={gonder}>
        <h1>{t('giris.baslik')}</h1>
        <p className="giris-aciklama">{t('giris.aciklama')}</p>
        <label className="alan"><span>{t('giris.kullanici')}</span>
          <input name="kullanici" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck="false" required maxLength={100} /></label>
        <label className="alan"><span>{t('giris.parola')}</span>
          <input ref={parola} name="parola" type="password" autoComplete="current-password" required /></label>
        <p className="hata" id="giris-hata" role="alert">{hata}</p>
        <button className="dugme dugme-birincil" type="submit" disabled={bekliyor}>{t('giris.gonder')}</button>
      </form>
    </main>
  );
}
