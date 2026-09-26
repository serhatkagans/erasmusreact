import { useEffect, useState } from 'react';
import { durum, t } from '../../ortak.js';
import { onayla, bildir } from '../../bilesenler/Kutu.jsx';
import { api, kacis, damga, gunEtiketi, gorselAdresi, gorselYukle, hedefMetni } from './yardim.jsx';

/** Form listesi: koordinatör hepsini ve durum süzgecini, ortak kendisine gönderilenleri görür. */
function halBilgisi(form, koordinator) {
  if (koordinator) {
    if (form.hal === 'taslak') return [t('form.hal.taslak'), 'taslak'];
    return form.acik
      ? [t('form.hal.acikUzun'), 'acik']
      : [form.kapali ? t('form.hal.durduruldu') : t('form.hal.suresiDoldu'), 'kapali'];
  }
  if (form.yanitladi) return [t('form.hal.yanitlandi'), 'bitti'];
  return form.acik ? [t('form.hal.bekleniyor'), 'acik'] : [t('form.hal.kapandi'), 'kapali'];
}

/* Yayımlama: taslak form ortaklara açılır. */
export async function formYayimla(form) {
  if (!(await onayla(t('form.onay.yayimla', { baslik: form.baslik, hedef: hedefMetni(form) }), { evet: t('form.yayimla') }))) return false;
  await api(`api/formlar/${form.id}/durum`, { method: 'PUT', body: JSON.stringify({ durum: 'yayinda' }) });
  return true;
}

export default function FormListesi({ git, basAyarla, hataGoster, uyar, koordinator }) {
  const [formlar, setFormlar] = useState(null);
  const [arama, setArama] = useState('');
  const [hal, setHal] = useState('hepsi');
  const [kopyalanan, setKopyalanan] = useState(null);
  const [yenile, setYenile] = useState(0);

  useEffect(() => {
    basAyarla(t('form.sayfa.ustbaslik'), t('form.sayfa.baslik'), koordinator ? t('form.giris.koordinator') : t('form.giris.ortak'));
    api('api/formlar').then(setFormlar).catch(hataGoster);
  }, [basAyarla, hataGoster, koordinator, yenile]);

  const yayimla = async form => {
    try {
      if (!await formYayimla(form)) return;
      bildir(t('form.bildirim.yayimlandi', { baslik: form.baslik }));
      setYenile(x => x + 1);
    } catch (hata) { uyar(hata); }
  };

  /* Kopya: aynı sorular (kaldırılmışlar hariç), yanıtsız yeni bir taslak. */
  const kopyala = async id => {
    setKopyalanan(id);
    try {
      const kaynak = await api('api/formlar/' + id);
      const yeni = await api('api/formlar', {
        method: 'POST',
        body: JSON.stringify({
          baslik: t('form.kopyaAdi', { baslik: kaynak.baslik }).slice(0, 200),
          baslikRich: kaynak.baslikRich && `${kaynak.baslikRich} ${kacis(t('form.kopyaEki'))}`,
          aciklama: kaynak.aciklama, aciklamaRich: kaynak.aciklamaRich,
          sonTarih: '', hedef: kaynak.hedef, koordinatorDoldurur: kaynak.koordinatorDoldurur,
          kapali: false, sorular: kaynak.sorular.filter(q => !q.archived),
        }),
      });
      if (kaynak.gorsel) {
        const gorsel = await fetch(gorselAdresi(kaynak.id, kaynak.gorsel));
        if (gorsel.ok) await gorselYukle(yeni.id, await gorsel.blob());
      }
      git('#duzenle/' + yeni.id);
    } catch (hata) { uyar(hata); setKopyalanan(null); }
  };

  const aranan = arama.trim().toLocaleLowerCase(durum.dil);
  const satirlar = (formlar || []).filter(f => f.baslik.toLocaleLowerCase(durum.dil).includes(aranan)
    && (!koordinator || hal === 'hepsi' || f.hal === hal));
  /* Koordinatörün hatırlattığı, henüz gönderilmemiş formlar listenin başında. */
  const hatirlatilan = (formlar || []).filter(f => f.hatirlatildi && !f.yanitladi && f.acik);

  let icerik;
  if (!formlar) icerik = <p className="bos-durum">{t('genel.yukleniyor')}</p>;
  else if (!satirlar.length) {
    icerik = (
      <p className="bos-durum">{aranan ? t('form.bos.arama')
        : koordinator ? (hal === 'hepsi' ? t('form.bos.koordinator') : t('form.bos.suzgec'))
          : t('form.bos.ortak')}</p>
    );
  } else {
    icerik = (
      <>
        {hatirlatilan.length > 0 && (
          <div className="hatirlatma-serit" role="status">
            <strong>{t('form.hatirlatma.geldi')}</strong>
            <ul>{hatirlatilan.map(f => (
              <li key={f.id}><a href={`#doldur/${f.id}`}>{f.baslik}</a>{f.sonTarih ? ` · ${t('form.sonGun', { gun: gunEtiketi(f.sonTarih) })}` : ''}</li>
            ))}</ul>
          </div>
        )}
        {satirlar.map(f => <FormKarti key={f.id} f={f} koordinator={koordinator} yayimla={yayimla} kopyala={kopyala} kopyalaniyor={kopyalanan === f.id} />)}
      </>
    );
  }

  return (
    <section id="liste-gorunum">
      <div className="fp-arac">
        <label className="alan alan-genis">
          <span>{t('form.ara')}</span>
          <input id="liste-arama" type="search" maxLength={100} placeholder={t('form.ara.ipucu')} value={arama} onChange={o => setArama(o.target.value)} />
        </label>
        {koordinator && <button id="yeni-form" className="dugme dugme-birincil" onClick={() => git('#yeni')}>{t('form.yeni')}</button>}
      </div>
      {koordinator && (
        <div id="hal-suzgec" className="gorunum hal-suzgec" role="group">
          {['hepsi', 'taslak', 'acik', 'kapali'].map(h => (
            <button key={h} type="button" aria-pressed={hal === h} onClick={() => setHal(h)}>
              <span>{t(h === 'hepsi' ? 'form.suzgec.hepsi' : `form.hal.${h}`)}</span>{' '}
              <small>{formlar ? (h === 'hepsi' ? formlar.length : formlar.filter(f => f.hal === h).length) : ''}</small>
            </button>
          ))}
        </div>
      )}
      <div id="form-listesi" className="form-listesi">{icerik}</div>
    </section>
  );
}

function FormKarti({ f, koordinator, yayimla, kopyala, kopyalaniyor }) {
  const [etiket, sinif] = halBilgisi(f, koordinator);
  const ayrinti = [
    t('form.soru.sayi', { n: f.soruSayisi }),
    f.sonTarih && t('form.sonGun', { gun: gunEtiketi(f.sonTarih) }),
    koordinator && hedefMetni(f),
    koordinator && f.acanAd && t('form.acan', { ad: f.acanAd }),
    f.yanitladi && t('form.yanitiniz', { zaman: damga(f.yanitladi) }),
  ].filter(Boolean).join(' · ');

  const bag = koordinator ? (f.hal === 'taslak' ? `#duzenle/${f.id}` : `#yanitlar/${f.id}`) : `#doldur/${f.id}`;
  const doldur = (
    <a className={`dugme ${f.acik && !f.yanitladi ? 'dugme-birincil' : 'dugme-ikincil'}`} href={`#doldur/${f.id}`}>
      {f.yanitladi ? (f.acik ? t('form.eylem.duzelt') : t('form.eylem.gor')) : f.acik ? t('form.eylem.doldur') : t('form.eylem.gorFormu')}
    </a>
  );
  const kopya = <button type="button" className="metin-bag" disabled={kopyalaniyor} onClick={() => kopyala(f.id)}>{t('form.eylem.kopya')}</button>;

  let eylemler;
  if (!koordinator) eylemler = doldur;
  else if (f.hal === 'taslak') {
    eylemler = (
      <>
        <button type="button" className="dugme dugme-birincil" onClick={() => yayimla(f)}>{t('form.eylem.yayimla')}</button>
        <a className="dugme dugme-ikincil" href={`#duzenle/${f.id}`}>{t('genel.duzenle')}</a>
        <a className="metin-bag" href={`#doldur/${f.id}`}>{t('form.onizle')}</a>
        {kopya}
      </>
    );
  } else {
    eylemler = (
      <>
        {f.koordinatorDoldurur && doldur}
        <a className="dugme dugme-ikincil" href={`#yanitlar/${f.id}`}>{t('form.sekme.yanitlar')}</a>
        <a className="metin-bag" href={`#duzenle/${f.id}`}>{t('genel.duzenle')}</a>
        {!f.koordinatorDoldurur && <a className="metin-bag" href={`#doldur/${f.id}`}>{t('form.onizle')}</a>}
        {kopya}
      </>
    );
  }

  return (
    <article className={`form-kart${f.gorsel ? ' kapakli' : ''}`}>
      {f.gorsel && <img className="form-kapak" src={gorselAdresi(f.id, f.gorsel)} alt="" loading="lazy" />}
      <div className="form-kart-govde">
        <span className="form-rozetler">
          <span className={`form-rozet is-${sinif}`}>{etiket}</span>
          {f.hatirlatildi && !f.yanitladi && f.acik && <span className="form-rozet is-hatirlatildi">{t('form.rozet.hatirlatildi')}</span>}
        </span>
        <h2><a href={bag}>{f.baslik}</a></h2>
        <p className="form-kart-ust">{ayrinti}</p>
        {koordinator && f.hal !== 'taslak' && (
          <div className="form-ilerleme">
            <progress max={Math.max(f.beklenen, 1)} value={Math.min(f.yanitSayisi, f.beklenen || f.yanitSayisi)} />
            <small>{t('form.ilerleme', { n: f.yanitSayisi, toplam: f.beklenen })}</small>
          </div>
        )}
      </div>
      <div className="form-kart-eylem">{eylemler}</div>
    </article>
  );
}
