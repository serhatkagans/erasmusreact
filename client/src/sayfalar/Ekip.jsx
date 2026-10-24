import { useCallback, useEffect, useState } from 'react';
import { durum, t, iste, ortakAdi, etkinlikBaslik, tamTarih, bugun, gunFarki } from '../ortak.js';
import { useBaslik } from '../bilesenler/Kabuk.jsx';
import Kutu, { onayla, bildir } from '../bilesenler/Kutu.jsx';

/**
 * Ülke ekipleri ve görev panosu.
 *
 * Sayfa KURUM KURUM düzenlenir: her ortak kendi başlığı altında ekibini ve
 * görevlerini görür — proje ortaklığında iş bölümü kurum eksenlidir.
 */

const yetkili = partner => !!durum.kullanici && (durum.kullanici.koordinator || durum.kullanici.partner === partner);
/** Görevi yalnızca tanımlayan ya da koordinatör siler/düzenler (sunucudaki kural). */
const gorevSahibi = g => !!durum.kullanici && (durum.kullanici.koordinator || g.olusturan === durum.kullanici.id);
/** Kullanıcının adına işlem yapabildiği kurumlar: koordinatör hepsi, ortak yalnızca kendisi. */
const yetkiliKurumlar = () => (durum.kullanici.koordinator ? durum.ortaklar.map(o => o.id) : [durum.kullanici.partner]);

const bayrak = kod => kod.length === 2
  ? String.fromCodePoint(...[...kod.toUpperCase()].map(c => 0x1f1e6 + c.charCodeAt(0) - 65))
  : '🌐';

/** Yüzdeyi çubuk olarak çizer; ekran okuyucular için `progressbar` rolü. */
function IlerlemeCubugu({ yuzde, ekSinif = '' }) {
  return (
    <div className={`gorev-ilerleme ${ekSinif}`.trim()}>
      <div className="gorev-ray" role="progressbar" aria-valuenow={yuzde} aria-valuemin={0} aria-valuemax={100} aria-label={t('gorev.ilerleme')}>
        <div className="gorev-dolu" style={{ width: `${yuzde}%` }} />
      </div>
      <span className="gorev-yuzde">{`%${yuzde}`}</span>
    </div>
  );
}

export default function Ekip() {
  useBaslik('ekip.baslik');
  const [veri, setVeri] = useState(null);
  const [etkinlikler, setEtkinlikler] = useState([]);
  const [hata, setHata] = useState('');
  const [uyeKutu, setUyeKutu] = useState(null);     // { mevcut, partner }
  const [gorevKutu, setGorevKutu] = useState(null); // { mevcut, partner }

  const yenile = useCallback(async () => setVeri(await iste('api/ekip')), []);
  useEffect(() => {
    (async () => {
      try {
        setEtkinlikler((await iste('api/etkinlikler')).etkinlikler);
        await yenile();
      } catch (err) { setHata(err.message); }
    })();
  }, [yenile]);

  const k = durum.kullanici;
  return (
    <main id="icerik">
      <section className="kapsayici sayfa-bas">
        <span className="ustbaslik">{t('ekip.ustbaslik')}</span>
        <h1>{t('ekip.baslik')}</h1>
        <p>{t('ekip.giris')}</p>
        {veri && (
          <div className="kahraman-dugmeler">
            <button id="gorev-ekle" className="dugme dugme-birincil" onClick={() => setGorevKutu({ mevcut: null, partner: k.partner })}>{t('gorev.ekle')}</button>
            <button id="uye-ekle" className="dugme dugme-ikincil" onClick={() => setUyeKutu({ mevcut: null, partner: k.partner })}>{t('ekip.uye.ekle')}</button>
          </div>
        )}
      </section>

      <div className="kapsayici">
        <div id="kurumlar" className="kurum-listesi">
          {hata && <p className="bos-durum">{hata}</p>}
          {veri && durum.ortaklar.map(o => (
            <KurumKarti key={o.id} o={o} veri={veri} etkinlikler={etkinlikler} yenile={yenile}
              uyeAc={(mevcut, partner) => setUyeKutu({ mevcut, partner })}
              gorevAc={(mevcut, partner) => setGorevKutu({ mevcut, partner })} />
          ))}
        </div>
      </div>

      {veri && (
        <>
          <Kutu acik={!!uyeKutu} onKapat={() => setUyeKutu(null)} koru id="uye-kutu">
            {uyeKutu && <UyeFormu {...uyeKutu} veri={veri} kapat={() => setUyeKutu(null)} yenile={yenile} />}
          </Kutu>
          <Kutu acik={!!gorevKutu} onKapat={() => setGorevKutu(null)} koru id="gorev-kutu">
            {gorevKutu && <GorevFormu {...gorevKutu} veri={veri} etkinlikler={etkinlikler} kapat={() => setGorevKutu(null)} yenile={yenile} />}
          </Kutu>
        </>
      )}
    </main>
  );
}

function KurumKarti({ o, veri, etkinlikler, yenile, uyeAc, gorevAc }) {
  const kurumUyeleri = veri.uyeler.filter(u => u.partner === o.id);
  const kurumGorevleri = veri.gorevler.filter(g => g.partner === o.id);
  const tamam = kurumGorevleri.filter(g => g.durum === 'tamamlandi').length;
  /* Kurumun genel ilerlemesi görevlerin ortalamasıdır: sayılan görev değil
     yapılan iş. */
  const ortalama = kurumGorevleri.length
    ? Math.round(kurumGorevleri.reduce((a, g) => a + g.ilerleme, 0) / kurumGorevleri.length) : 0;

  return (
    <section className="kurum-kart">
      <div className="kurum-bas">
        <div className="kurum-isim">
          <span className="bayrak" aria-hidden="true">{bayrak(o.country)}</span>
          <h2>{o.name}</h2>
        </div>
        <span className={`rozet ${o.coordinator ? 'rozet-koordinator' : 'rozet-ortak'}`}>
          {t(o.coordinator ? 'anasayfa.ortaklar.koordinator' : 'anasayfa.ortaklar.ortak')}
        </span>
        {kurumGorevleri.length > 0 && (
          <div className="kurum-sayac">
            <span>{t('gorev.sayi', { tamam, toplam: kurumGorevleri.length })}</span>
            <IlerlemeCubugu yuzde={ortalama} ekSinif="kurum-ilerleme" />
          </div>
        )}
      </div>
      <div className="kurum-govde">
        <div className="kurum-sutun">
          <h3 className="sutun-bas">{t('ekip.uyeler')}</h3>
          {!kurumUyeleri.length
            ? <p className="ipucu">{t('ekip.uye.yok')}</p>
            : <ul className="uye-liste">{kurumUyeleri.map(u => <UyeSatiri key={u.id} u={u} duzenle={() => uyeAc(u, u.partner)} />)}</ul>}
          {yetkili(o.id) && <button type="button" className="metin-bag" onClick={() => uyeAc(null, o.id)}>{t('ekip.uye.ekle')}</button>}
        </div>
        <div className="kurum-sutun kurum-sutun-genis">
          <h3 className="sutun-bas">{t('gorev.baslik')}</h3>
          {!kurumGorevleri.length
            ? <p className="ipucu">{t('gorev.yok')}</p>
            : <div className="gorev-liste">{kurumGorevleri.map(g => (
              <GorevKarti key={g.id} g={g} veri={veri} etkinlikler={etkinlikler} yenile={yenile} duzenle={() => gorevAc(g, g.partner)} />
            ))}</div>}
          {yetkili(o.id) && <button type="button" className="metin-bag" onClick={() => gorevAc(null, o.id)}>{t('gorev.ekle')}</button>}
        </div>
      </div>
    </section>
  );
}

function UyeSatiri({ u, duzenle }) {
  return (
    <li className="uye-satir">
      <div>
        <strong>{u.ad}</strong>
        {u.rol && <small>{u.rol}</small>}
        {u.eposta && <a className="uye-posta" href={`mailto:${u.eposta}`}>{u.eposta}</a>}
      </div>
      {/* Ekipten çıkarma düğmesi YOK (kullanıcı kararı, 23 Eylül 2026): kişi
          ekipten yalnızca hesabı silinince çıkar. */}
      {yetkili(u.partner) && (
        <div className="satir-eylem">
          <button type="button" className="satir-dugme" title={t('genel.duzenle')} aria-label={`${t('genel.duzenle')}: ${u.ad}`} onClick={duzenle}>✎</button>
        </div>
      )}
    </li>
  );
}

function GorevKarti({ g, veri, etkinlikler, yenile, duzenle }) {
  const [kaydirma, setKaydirma] = useState(null);   // sürüklenirken gösterilen değer
  const guncelle = async alanlar => {
    /* Tam kayıt gönderilir; sunucu görevi tanımlamayandan yalnızca durum ve
       ilerlemeyi alır. */
    await iste(`api/gorevler/${g.id}`, { method: 'PUT', body: JSON.stringify({ ...g, ...alanlar }) });
    await yenile();
  };

  const kisi = veri.uyeler.find(u => u.id === g.uyeId);
  const etkinlik = g.etkinlikId && etkinlikler.find(e => e.id === g.etkinlikId);
  let tarih = null;
  if (g.sonTarih) {
    const kalan = gunFarki(bugun(), g.sonTarih);
    const bitmis = g.durum === 'tamamlandi' || g.durum === 'iptal';
    tarih = (
      <span className={kalan < 0 && !bitmis ? 'gorev-gecikti' : 'gorev-sure'}>
        {kalan < 0 && !bitmis
          ? `${tamTarih(g.sonTarih)} · ${t('gorev.gecikti')}`
          : `${tamTarih(g.sonTarih)}${bitmis ? '' : ` · ${t('gorev.kalan', { n: kalan })}`}`}
      </span>
    );
  }

  const sil = async () => {
    if (!(await onayla(t('gorev.sil.onay'), { evet: t('genel.sil'), tehlike: true }))) return;
    try { await iste(`api/gorevler/${g.id}`, { method: 'DELETE' }); await yenile(); bildir(t('genel.silindi')); } catch (err) { bildir(err.message, 'hata'); }
  };

  const deger = kaydirma ?? g.ilerleme;
  return (
    <article className="gorev-kart" data-durum={g.durum}>
      <div className="gorev-ust">
        <strong className="gorev-ad">{g.baslik}</strong>
        {/* Durum, yetkisi olan için açılır liste; olmayan için etiket. */}
        {yetkili(g.partner)
          ? (
            <select className="gorev-durum-secim" aria-label={t('etkinlik.durum')} value={g.durum}
              onChange={o => guncelle({ durum: o.target.value }).catch(err => bildir(err.message, 'hata'))}>
              {veri.gorevDurumlari.map(d => <option key={d} value={d}>{t(`gorevdurum.${d}`)}</option>)}
            </select>
          )
          : <span className="etiket etiket-gorev">{t(`gorevdurum.${g.durum}`)}</span>}
      </div>
      {g.aciklama && <p className="gorev-aciklama">{g.aciklama}</p>}
      {yetkili(g.partner)
        ? (
          /* Yetkili kişi çubuğu doğrudan sürükler. Sürüklerken yalnızca
             etiket güncellenir; sunucuya bırakınca tek istek gider. */
          <div className="gorev-ilerleme">
            <input className="gorev-kaydirici" type="range" min="0" max="100" step={veri.ilerlemeAdimi ?? 10} value={deger}
              aria-label={t('gorev.ilerleme')}
              onChange={o => setKaydirma(Number(o.target.value))}
              onPointerUp={o => birak(Number(o.currentTarget.value))}
              onKeyUp={o => birak(Number(o.currentTarget.value))} />
            <span className="gorev-yuzde">{`%${deger}`}</span>
          </div>
        )
        : <IlerlemeCubugu yuzde={g.ilerleme} />}
      <div className="gorev-alt">
        <span>{kisi ? kisi.ad : t('gorev.kisi.yok')}</span>
        {g.wp && <span className="etiket etiket-wp">{t(`wp.${g.wp}.ad`)}</span>}
        {etkinlik && <span>{etkinlikBaslik(etkinlik)}</span>}
        {tarih}
      </div>
      {gorevSahibi(g) && (
        <div className="satir-eylem gorev-eylem">
          <button type="button" className="satir-dugme" title={t('genel.duzenle')} aria-label={`${t('genel.duzenle')}: ${g.baslik}`} onClick={duzenle}>✎</button>
          <button type="button" className="satir-dugme satir-dugme-sil" title={t('genel.sil')} aria-label={`${t('genel.sil')}: ${g.baslik}`} onClick={sil}>×</button>
        </div>
      )}
    </article>
  );

  async function birak(yeni) {
    if (kaydirma == null) return;
    if (yeni === g.ilerleme) { setKaydirma(null); return; }
    try { await guncelle({ ilerleme: yeni }); } catch (err) { bildir(err.message, 'hata'); }
    setKaydirma(null);
  }
}

/* --- Formlar ---------------------------------------------------------------- */
async function kaydet({ yol, id, govde, setHata, setBekliyor, kapat, yenile }) {
  setHata('');
  setBekliyor(true);
  try {
    await iste(id ? `${yol}/${id}` : yol, { method: id ? 'PUT' : 'POST', body: JSON.stringify(govde) });
    kapat();
    await yenile();
    bildir(t('genel.kaydedildi'));
  } catch (err) { setHata(err.message); } finally { setBekliyor(false); }
}

/**
 * Üye formu. Kişi seçimi: yalnızca SEÇİLİ KURUMUN hesapları, ekipte
 * olmayanlar (sunucu da reddeder). Düzenlemede kişi ve kurum değişmez.
 */
function UyeFormu({ mevcut, partner, veri, kapat, yenile }) {
  const [kurum, setKurum] = useState(mevcut?.partner ?? partner ?? durum.kullanici.partner);
  const [hata, setHata] = useState('');
  const [bekliyor, setBekliyor] = useState(false);
  const ekipte = new Set(veri.uyeler.map(u => u.userId).filter(Boolean));
  const adaylar = (veri.adaylar || []).filter(a => a.partner === kurum && !ekipte.has(a.id));

  return (
    <form id="uye-form" className="kutu-ic" onSubmit={o => {
      o.preventDefault();
      const f = o.currentTarget;
      kaydet({
        yol: 'api/ekip/uye', id: mevcut?.id, setHata, setBekliyor, kapat, yenile,
        govde: { partner: kurum, userId: f.userId.value ? Number(f.userId.value) : null, ad: mevcut ? f.ad.value : undefined, rol: f.rol.value, eposta: f.eposta.value },
      });
    }}>
      <div className="kutu-ust">
        <h2>{t(mevcut ? 'ekip.uye.baslik.duzenle' : 'ekip.uye.baslik.yeni')}</h2>
        <button type="button" className="kapat" data-kapat aria-label={t('genel.kapat')}>×</button>
      </div>
      <div className="form-izgara">
        <label className="alan"><span>{t('gorev.kurum')}</span>
          <select name="partner" value={kurum} disabled={!!mevcut} onChange={o => setKurum(o.target.value)}>
            {yetkiliKurumlar().map(id => <option key={id} value={id}>{ortakAdi(id)}</option>)}
          </select></label>
        {/* Düzenlemede kişi değişmez ama ADI düzeltilebilir: ad hesaptan
            kopyalanır ve hesapta ad yoksa kullanıcı adı görünüyordu. Sunucu
            düzeltmeyi hesaba da yazar. */}
        <label className="alan"><span>{t(mevcut ? 'ekip.uye.ad' : 'ekip.uye.kisi')}</span>
          {mevcut
            ? <><input name="ad" maxLength={120} required defaultValue={mevcut.ad} /><input type="hidden" name="userId" value={mevcut.userId ?? ''} /></>
            : (
              <select name="userId" required key={kurum} defaultValue="">
                {adaylar.length
                  ? [<option key="" value="">{t('ekip.uye.aday.sec')}</option>, ...adaylar.map(a => <option key={a.id} value={a.id}>{a.ad}</option>)]
                  : <option value="" disabled>{t('ekip.uye.aday.yok')}</option>}
              </select>
            )}
        </label>
        <p className="form-tam alan-ipucu" id="uye-kisi-ipucu">{t('ekip.uye.kisiIpucu')}</p>
        <label className="alan"><span>{t('ekip.uye.rol')}</span><input name="rol" maxLength={120} defaultValue={mevcut?.rol ?? ''} /></label>
        <label className="alan form-tam"><span>{t('ekip.uye.eposta')}</span><input name="eposta" type="email" maxLength={200} defaultValue={mevcut?.eposta ?? ''} /></label>
      </div>
      <p className="hata" id="uye-hata" role="alert">{hata}</p>
      <div className="kutu-eylem">
        <button type="submit" className="dugme dugme-birincil" disabled={bekliyor}>{t('genel.kaydet')}</button>
        <button type="button" className="dugme dugme-ikincil" data-kapat>{t('genel.vazgec')}</button>
      </div>
    </form>
  );
}

function GorevFormu({ mevcut, partner, veri, etkinlikler, kapat, yenile }) {
  const [kurum, setKurum] = useState(mevcut?.partner ?? partner ?? durum.kullanici.partner);
  const [ilerleme, setIlerleme] = useState(mevcut?.ilerleme ?? 0);
  const [hata, setHata] = useState('');
  const [bekliyor, setBekliyor] = useState(false);
  /* Sorumlu kişi listesi seçili kuruma bağlıdır: kurum değişince yenilenir. */
  const kisiler = veri.uyeler.filter(u => u.partner === kurum);

  return (
    <form id="gorev-form" className="kutu-ic" onSubmit={o => {
      o.preventDefault();
      const f = o.currentTarget;
      kaydet({
        yol: 'api/gorevler', id: mevcut?.id, setHata, setBekliyor, kapat, yenile,
        govde: {
          partner: kurum, uyeId: f.uyeId.value || null, wp: f.wp.value, etkinlikId: f.etkinlikId.value || null,
          baslik: f.baslik.value, aciklama: f.aciklama.value, sonTarih: f.sonTarih.value, durum: f.durum.value, ilerleme,
        },
      });
    }}>
      <div className="kutu-ust">
        <h2>{t(mevcut ? 'gorev.duzenle' : 'gorev.yeni')}</h2>
        <button type="button" className="kapat" data-kapat aria-label={t('genel.kapat')}>×</button>
      </div>
      <div className="form-izgara">
        <label className="alan form-tam"><span>{t('gorev.ad')}</span><input name="baslik" maxLength={200} required defaultValue={mevcut?.baslik ?? ''} /></label>
        <label className="alan"><span>{t('gorev.kurum')}</span>
          <select name="partner" value={kurum} disabled={!!mevcut} onChange={o => setKurum(o.target.value)}>
            {yetkiliKurumlar().map(id => <option key={id} value={id}>{ortakAdi(id)}</option>)}
          </select></label>
        <label className="alan"><span>{t('gorev.kisi')}</span>
          <select name="uyeId" key={kurum} defaultValue={mevcut?.uyeId ? String(mevcut.uyeId) : ''}>
            <option value="">{t('gorev.kisi.yok')}</option>
            {kisiler.map(u => <option key={u.id} value={String(u.id)}>{u.ad}</option>)}
          </select></label>
        <label className="alan"><span>{t('takvim.filtre.ispaketi')}</span>
          <select name="wp" defaultValue={mevcut?.wp ?? ''}>
            <option value="">{t('takvim.filtre.hepsi')}</option>
            {durum.ispaketleri.map(wp => <option key={wp} value={wp}>{t(`wp.${wp}.ad`)}</option>)}
          </select></label>
        <label className="alan"><span>{t('gorev.sontarih')}</span>
          <input name="sonTarih" type="date" min={durum.proje.start} max={durum.proje.end} defaultValue={mevcut?.sonTarih ?? ''} /></label>
        <label className="alan"><span>{t('etkinlik.durum')}</span>
          <select name="durum" defaultValue={mevcut?.durum ?? 'bekliyor'}>
            {veri.gorevDurumlari.map(d => <option key={d} value={d}>{t(`gorevdurum.${d}`)}</option>)}
          </select></label>
        <label className="alan"><span>{t('gorev.ilerleme')}</span>
          <span className="gorev-ilerleme">
            <input name="ilerleme" type="range" min="0" max="100" step={veri.ilerlemeAdimi ?? 10} value={ilerleme} className="gorev-kaydirici"
              onChange={o => setIlerleme(Number(o.target.value))} />
            <output id="gorev-ilerleme-cikti" className="gorev-yuzde">{`%${ilerleme}`}</output>
          </span>
        </label>
        <label className="alan form-tam"><span>{t('gorev.etkinlik')}</span>
          <select name="etkinlikId" defaultValue={mevcut?.etkinlikId ? String(mevcut.etkinlikId) : ''}>
            <option value="">{t('gorev.etkinlik.yok')}</option>
            {etkinlikler.map(e => <option key={e.id} value={String(e.id)}>{etkinlikBaslik(e)}</option>)}
          </select></label>
        <label className="alan form-tam"><span>{t('gorev.aciklama')}</span><textarea name="aciklama" maxLength={4000} defaultValue={mevcut?.aciklama ?? ''} /></label>
      </div>
      <p className="hata" id="gorev-hata" role="alert">{hata}</p>
      <div className="kutu-eylem">
        <button type="submit" className="dugme dugme-birincil" disabled={bekliyor}>{t('genel.kaydet')}</button>
        <button type="button" className="dugme dugme-ikincil" data-kapat>{t('genel.vazgec')}</button>
      </div>
    </form>
  );
}
