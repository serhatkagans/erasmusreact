import { useRef, useState } from 'react';
import { durum, t, iste, ortakAdi, ortakKisa } from '../ortak.js';
import { useVeri } from '../kancalar.js';
import { useBaslik } from '../bilesenler/Kabuk.jsx';
import Kutu, { onayla, bildir } from '../bilesenler/Kutu.jsx';

/**
 * Kullanıcılar: proje yöneticisi hesapları görür, açar, düzenler, siler.
 * Sunucu da yalnızca koordinatöre izin verir; buradaki gizleme kolaylıktır,
 * kural değil.
 */

/* Ad soyaddan kullanıcı adı önerisi: "Serhat Kağan Şahin" → "serhatkagansahin".
   Aksanlar düşer (ş→s, ğ→g, ș→s, ã→a); ayrışmayan harfler elle eşlenir. */
const ELLE = { ı: 'i', ø: 'o', æ: 'ae', å: 'a', ß: 'ss', đ: 'd', ł: 'l' };
const oner = ad => ad.toLocaleLowerCase('tr').normalize('NFD').replace(/\p{M}/gu, '')
  .replace(/[ıøæåßđł]/g, h => ELLE[h]).replace(/[^a-z0-9]/g, '').slice(0, 40);

/* Okunaklı rastgele parola: karışan harfler (0/O, 1/l/I) yok. 16 karakter,
   ~95 bit; kişi ilk girişte kendi parolasına geçer. */
const ABECE = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const parolaUret = () => [...crypto.getRandomValues(new Uint32Array(16))]
  .map(n => ABECE[n % ABECE.length]).join('').replace(/(.{4})(?!$)/g, '$1-');

export default function Kullanicilar() {
  useBaslik('kullanicilar.baslik');
  const yetkili = !!durum.kullanici?.koordinator;
  const { veri, yenile } = useVeri(yetkili ? 'api/kullanicilar' : null);
  /* Ekleme ve düzenleme aynı kutuyu kullanır: `{ k: null }` ekleme. */
  const [duzen, setDuzen] = useState(null);
  const [sifirlanan, setSifirlanan] = useState(null);

  const hesapSil = async k => {
    if (!(await onayla(t('kullanicilar.silOnay', { ad: k.ad || k.kullanici, kullanici: k.kullanici }), { evet: t('genel.sil'), tehlike: true }))) return;
    try {
      await iste(`api/kullanicilar/${k.id}`, { method: 'DELETE' });
      yenile();
      bildir(t('genel.silindi'));
    } catch (err) { bildir(err.message, 'hata'); }
  };

  return (
    <main id="icerik">
      <section className="kapsayici sayfa-bas">
        <span className="ustbaslik">{t('kullanicilar.ustbaslik')}</span>
        <h1>{t('kullanicilar.baslik')}</h1>
        <p>{t('kullanicilar.giris')}</p>
        {yetkili && (
          <div className="kahraman-dugmeler">
            <button id="kullanici-ekle" className="dugme dugme-birincil" onClick={() => setDuzen({ k: null })}>{t('kullanicilar.ekle')}</button>
          </div>
        )}
      </section>

      <div className="kapsayici">
        {!yetkili && <p className="kullanicilar-uyari" role="alert">{t(durum.kullanici ? 'kullanicilar.hata.yetki' : 'kullanicilar.hata.giris')}</p>}
        {yetkili && (
          <div className="kullanicilar-kart">
            <table className="kullanicilar-tablo">
              <thead>
                <tr>
                  <th scope="col">{t('kullanicilar.ad')}</th>
                  <th scope="col">{t('kullanicilar.kullaniciAdi')}</th>
                  <th scope="col">{t('kullanicilar.kurum')}</th>
                  <th scope="col">{t('kullanicilar.yetki')}</th>
                  <th scope="col">{t('kullanicilar.profil')}</th>
                  <th scope="col"><span className="gorsel-gizli">{t('kullanicilar.islem')}</span></th>
                </tr>
              </thead>
              <tbody>
                {veri?.kullanicilar.map(k => (
                  <tr key={k.id}>
                    <td>{k.ad || '—'}</td>
                    <td className="kullanicilar-kod">{k.kullanici}</td>
                    <td title={ortakAdi(k.partner)}>{ortakKisa(k.partner)}</td>
                    <td><span className={k.koordinator ? 'yetki-rozet yetki-tam' : 'yetki-rozet'}>
                      {t(k.koordinator ? 'kullanicilar.yetki.tam' : 'kullanicilar.yetki.kurum')}</span></td>
                    <td><a className="metin-bag" href={`profil.html?u=${encodeURIComponent(k.kullanici)}`}>{t('kullanicilar.profilAc')}</a></td>
                    <td className="kullanicilar-islem">
                      <button type="button" className="dugme dugme-hayalet dugme-kucuk" onClick={() => setDuzen({ k })}>{t('kullanicilar.duzenle')}</button>
                      <button type="button" className="dugme dugme-hayalet dugme-kucuk" onClick={() => setSifirlanan(k)}>{t('kullanicilar.sifirla')}</button>
                      {/* Kendi hesabını silme düğmesi yok; sunucu da reddeder. */}
                      {k.id !== durum.kullanici.id && (
                        <button type="button" className="dugme dugme-hayalet dugme-kucuk dugme-tehlike" onClick={() => hesapSil(k)}>{t('kullanicilar.sil')}</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {yetkili && <SifirlaKutusu k={sifirlanan} kapat={() => setSifirlanan(null)} />}
      {yetkili && <HesapKutusu duzen={duzen} kapat={() => setDuzen(null)} yenile={yenile} />}
    </main>
  );
}

/* --- Parola sıfırlama kutusu ----------------------------------------------- */
function SifirlaKutusu({ k, kapat }) {
  return (
    <Kutu acik={!!k} onKapat={kapat} id="sifirla-kutu">
      {k && <SifirlaForm key={k.id} k={k} />}
    </Kutu>
  );
}

function SifirlaForm({ k }) {
  const [parola, setParola] = useState(parolaUret);
  const [hata, setHata] = useState('');
  const [tamam, setTamam] = useState(false);
  const [bekliyor, setBekliyor] = useState(false);
  const girdi = useRef(null);
  const sec = el => { if (el && !girdi.current) { girdi.current = el; el.select(); } };

  return (
    <form id="sifirla-form" className="kutu-ic" onSubmit={async o => {
      o.preventDefault();
      setHata('');
      setBekliyor(true);
      try {
        await iste(`api/kullanicilar/${k.id}/parola`, { method: 'POST', body: JSON.stringify({ parola }) });
        /* Kutu kapanmaz: yönetici parolayı kopyalayıp kişiye iletecek. */
        setTamam(true);
        setTimeout(() => girdi.current?.select());
      } catch (err) { setHata(err.message); } finally { setBekliyor(false); }
    }}>
      <div className="kutu-ust">
        <h2>{t('kullanicilar.sifirla')}</h2>
        <button type="button" className="kapat" data-kapat aria-label={t('genel.kapat')}>×</button>
      </div>
      <p className="kutu-aciklama">{`${k.ad || k.kullanici} (${k.kullanici})`}</p>
      <label className="alan"><span>{t('kullanicilar.yeniParola')}</span>
        <span className="sifirla-satir">
          <input ref={sec} name="parola" type="text" required autoComplete="off" spellCheck="false" minLength={durum.minParola}
            value={parola} readOnly={tamam} onChange={o => setParola(o.target.value)} />
          {!tamam && <button type="button" className="dugme dugme-ikincil" onClick={() => setParola(parolaUret())}>{t('kullanicilar.uret')}</button>}
        </span>
      </label>
      <p className="kutu-aciklama">{t('kullanicilar.sifirlaIpucu')}</p>
      <p className="hata" role="alert">{hata}</p>
      {tamam && <p className="sifirla-tamam" role="status">{t('kullanicilar.sifirlandi', { kullanici: k.kullanici })}</p>}
      <div className="kutu-eylem">
        {!tamam && <button type="submit" className="dugme dugme-birincil" disabled={bekliyor}>{t('kullanicilar.sifirla')}</button>}
        <button type="button" className="dugme dugme-ikincil" data-kapat>{t(tamam ? 'genel.kapat' : 'genel.vazgec')}</button>
      </div>
    </form>
  );
}

/* --- Ekleme / düzenleme kutusu ---------------------------------------------- */
function HesapKutusu({ duzen, kapat, yenile }) {
  return (
    <Kutu acik={!!duzen} onKapat={kapat} koru id="kullanici-kutu">
      {duzen && <HesapForm k={duzen.k} kapat={kapat} yenile={yenile} />}
    </Kutu>
  );
}

function HesapForm({ k, kapat, yenile }) {
  const [hata, setHata] = useState('');
  const [bekliyor, setBekliyor] = useState(false);
  const [kullaniciAdi, setKullaniciAdi] = useState(k?.kullanici || '');
  /* Kullanıcı adı elle değiştirilene kadar addan önerilir. */
  const elle = useRef(!!k);

  return (
    <form id="kullanici-form" className="kutu-ic" onSubmit={async o => {
      o.preventDefault();
      const f = o.currentTarget;
      setHata('');
      setBekliyor(true);
      try {
        const govde = { ad: f.ad.value, kullanici: kullaniciAdi, partner: f.partner.value, koordinator: f.koordinator.checked };
        if (k) {
          await iste(`api/kullanicilar/${k.id}`, { method: 'PUT', body: JSON.stringify(govde) });
          /* Kendi adını ya da kurumunu değiştirdiyse üst banttaki rozet de güncellensin. */
          if (k.id === durum.kullanici.id) { location.reload(); return; }
        } else {
          await iste('api/kullanicilar', { method: 'POST', body: JSON.stringify({ ...govde, parola: f.parola.value }) });
        }
        kapat();
        yenile();
        bildir(t('genel.kaydedildi'));
      } catch (err) { setHata(err.message); } finally { setBekliyor(false); }
    }}>
      <div className="kutu-ust">
        <h2>{t(k ? 'kullanicilar.duzenle' : 'kullanicilar.ekle')}</h2>
        <button type="button" className="kapat" data-kapat aria-label={t('genel.kapat')}>×</button>
      </div>
      <div className="form-izgara">
        <label className="alan form-tam"><span>{t('kullanicilar.ad')}</span>
          <input name="ad" maxLength={120} required autoComplete="off" defaultValue={k?.ad || ''}
            onChange={o => { if (!elle.current) setKullaniciAdi(oner(o.target.value)); }} /></label>
        <label className="alan"><span>{t('kullanicilar.kullaniciAdi')}</span>
          <input name="kullanici" maxLength={40} required pattern="[a-z0-9._\-]{3,40}" autoCapitalize="none" autoCorrect="off" spellCheck="false" autoComplete="off"
            value={kullaniciAdi} onChange={o => { elle.current = o.target.value !== ''; setKullaniciAdi(o.target.value.toLowerCase()); }} /></label>
        <label className="alan"><span>{t('kullanicilar.kurum')}</span>
          <select name="partner" required defaultValue={k ? k.partner : durum.kullanici.partner}>
            {durum.ortaklar.map(o => <option key={o.id} value={o.id}>{`${o.short} — ${o.name}`}</option>)}
          </select></label>
        <p className="form-tam alan-ipucu">{t('kullanicilar.kullaniciIpucu')}</p>
        {/* Kullanıcı adı değişirse NFC etiketindeki profil adresi de değişir. */}
        {k && <p className="form-tam alan-uyari">{t('kullanicilar.nfcUyari')}</p>}
        {/* Parola yalnızca eklemede; düzenlemede "Parolayı sıfırla" kullanılır. */}
        {!k && <label className="alan form-tam"><span>{t('kullanicilar.parola')}</span>
          <input name="parola" type="text" required autoComplete="off" spellCheck="false" minLength={durum.minParola} /></label>}
        <label className="onay form-tam">
          {/* Kendi yetkisini kaldıramaz; sunucu da reddeder. */}
          <input name="koordinator" type="checkbox" defaultChecked={!!k?.koordinator} disabled={!!k && k.id === durum.kullanici.id} />
          {' '}<span>{t('kullanicilar.tamYetki')}</span>
        </label>
      </div>
      <p className="hata" role="alert">{hata}</p>
      <div className="kutu-eylem">
        <button type="submit" className="dugme dugme-birincil" disabled={bekliyor}>{t('genel.kaydet')}</button>
        <button type="button" className="dugme dugme-ikincil" data-kapat>{t('genel.vazgec')}</button>
      </div>
    </form>
  );
}
