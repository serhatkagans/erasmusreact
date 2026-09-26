import { useEffect, useRef, useState } from 'react';
import { durum, t, iste, hataMetni, ortakAdi, ortakKisa, tamTarih, bugun, gunFarki, boyutYaz } from '../ortak.js';
import { useVeri } from '../kancalar.js';
import { useKonum } from '../yonlendirme.js';
import { useBaslik } from '../bilesenler/Kabuk.jsx';
import Kutu, { onayla, bildir } from '../bilesenler/Kutu.jsx';

/**
 * Çıktı kütüphanesi (iç): kartlar ve `#<slug>` ile açılan ayrıntı.
 *
 * Kamuya açık sürüm platformda değil, dış adreste yayımlanır (bkz.
 * lib/cikti.mjs). Sorumlu ve tarih takvimdeki çıktı üretim döneminden
 * geliyorsa burada değiştirilmez; takvimde değişir.
 */
const baslik = c => t(`${c.anahtar}.baslik`);
const dilAdi = kod => t(`dil.${kod}`);

/** Teslim tarihi ve kalan/geçen gün. Teslim edilmişse gecikme söylenmez. */
function teslimMetni(c) {
  if (!c.teslim) return t('cikti.teslimYok');
  const kalan = gunFarki(bugun(), c.teslim);
  const tarih = tamTarih(c.teslim);
  if (c.durum === 'teslim') return tarih;
  if (kalan < 0) return `${tarih} · ${t('cikti.gecikti', { n: -kalan })}`;
  return `${tarih} · ${t('cikti.kalan', { n: kalan })}`;
}
const gecikti = c => c.teslim && c.durum !== 'teslim' && gunFarki(bugun(), c.teslim) < 0;

const DurumEtiketi = ({ c }) => <span className={`cikti-durum cikti-durum-${c.durum}`}>{t(`cikti.durum.${c.durum}`)}</span>;

export default function Ciktilar() {
  useBaslik('cikti.baslik');
  const { hash } = useKonum();
  const { veri, yenile } = useVeri('api/ciktilar');
  const [duzenlenen, setDuzenlenen] = useState(null);

  const slug = decodeURIComponent(hash.slice(1));
  const secili = veri?.ciktilar.find(x => x.slug === slug);
  useEffect(() => { if (secili) scrollTo({ top: 0 }); }, [secili?.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main id="icerik">
      <section className="kapsayici sayfa-bas">
        <span className="ustbaslik">{t('cikti.ustbaslik')}</span>
        <h1>{t('cikti.baslik')}</h1>
        <p>{t('cikti.giris')}</p>
      </section>
      <div className="kapsayici">
        {veri && !secili && <Liste ciktilar={veri.ciktilar} />}
        {veri && secili && <Ayrinti c={secili} diller={veri.diller} yenile={yenile} duzenle={() => setDuzenlenen(secili)} />}
      </div>
      {veri && <DuzenKutusu c={duzenlenen} durumlar={veri.durumlar} kapat={() => setDuzenlenen(null)} yenile={yenile} />}
    </main>
  );
}

function Liste({ ciktilar }) {
  return (
    <div id="cikti-liste" className="cikti-izgara">
      {ciktilar.map(c => (
        <a key={c.slug} className={`cikti-kart${gecikti(c) ? ' cikti-kart-gecikti' : ''}`} href={`#${c.slug}`}>
          <div className="cikti-kart-ust"><span className="cikti-kod">{c.kod || t('cikti.kodYok')}</span><DurumEtiketi c={c} /></div>
          <h3>{baslik(c)}</h3>
          {c.araUrun && <span className="cikti-ara">{t('cikti.araUrun')}</span>}
          <dl className="cikti-bilgi">
            {[
              [t('cikti.sorumlu'), c.sorumlu ? ortakKisa(c.sorumlu) : t('cikti.sorumluYok')],
              [t('cikti.teslim'), teslimMetni(c)],
              [t('cikti.dosyalar'), c.diller.length ? c.diller.map(d => d.dil.toUpperCase()).join(' · ') : t('cikti.dosyaYok')],
            ].map(([a, d]) => <div key={a}><dt>{a}</dt><dd>{d}</dd></div>)}
          </dl>
        </a>
      ))}
    </div>
  );
}

function Ayrinti({ c, diller, yenile, duzenle }) {
  const [yukleDil, setYukleDil] = useState(durum.dil === 'tr' ? 'en' : durum.dil);
  const girdi = useRef(null);

  const satirlar = [
    [t('cikti.sorumlu'), c.sorumlu ? ortakAdi(c.sorumlu) : t('cikti.sorumluYok')],
    [t('cikti.teslim'), teslimMetni(c)],
    c.etkinlikId && [t('cikti.uretim'), <a className="metin-bag" href={`takvim.html#etkinlik-${c.etkinlikId}`}>{t('cikti.takvimdeGor')}</a>],
    [t('cikti.disUrl'), c.disUrl ? <a className="metin-bag" href={c.disUrl} target="_blank" rel="noopener noreferrer">{c.disUrl}</a> : t('cikti.disUrlYok')],
    [t('cikti.klasor'), <a className="metin-bag" href={`klasorler.html#${c.klasor}`}>{c.klasor}</a>],
    c.not && [t('cikti.not'), c.not],
  ].filter(Boolean);

  const surumSil = async s => {
    if (!(await onayla(t('klasor.silOnay', { ad: s.ad }), { evet: t('genel.sil'), tehlike: true }))) return;
    try {
      await iste(`api/ciktilar/dosya/${s.id}`, { method: 'DELETE' });
      bildir(t('genel.silindi'));
      yenile();
    } catch (err) { bildir(err.message, 'hata'); }
  };

  const yukle = async () => {
    const f = girdi.current.files[0];
    girdi.current.value = '';
    if (!f) return;
    const yanit = await fetch(`api/ciktilar/${c.slug}/dosya?dil=${yukleDil}`, {
      method: 'POST', body: f, headers: { 'X-File-Name': encodeURIComponent(f.name) },
    });
    const g = await yanit.json().catch(() => ({}));
    if (!yanit.ok) { bildir(hataMetni(g), 'hata'); return; }
    bildir(t('cikti.yuklendi', { dil: dilAdi(yukleDil), no: g.no }));
    yenile();
  };

  return (
    <article id="cikti-ayrinti" className="cikti-ayrinti">
      <a className="metin-bag cikti-geri" href="#">{`← ${t('cikti.tumu')}`}</a>
      <div className="cikti-ayrinti-ust">
        <span className="cikti-kod">{c.kod || t('cikti.kodYok')}</span><DurumEtiketi c={c} />
        {c.araUrun && <span className="cikti-ara">{t('cikti.araUrun')}</span>}
      </div>
      <h2>{baslik(c)}</h2>
      <p className="cikti-metin">{t(`${c.anahtar}.metin`)}</p>
      {c.araUrun && <p className="cikti-not">{t('cikti.araUrunNot')}</p>}
      <dl className="kutu-satirlar">
        {satirlar.map(([a, d]) => <div key={a} className="kutu-satir"><dt>{a}</dt><dd>{d}</dd></div>)}
      </dl>
      {c.yetkili && <button type="button" className="dugme dugme-ikincil" onClick={duzenle}>{t('genel.duzenle')}</button>}

      {/* Dil dil son sürüm. */}
      <section className="cikti-dosyalar">
        <h3>{t('cikti.dosyalar')}</h3>
        {!c.diller.length && <p className="cikti-not">{t('cikti.dosyaYokUzun')}</p>}
        {c.diller.map(d => {
          const [son, ...eski] = d.surumler;
          return (
            <div key={d.dil} className="cikti-dil">
              <div className="cikti-dil-bas">
                <strong>{dilAdi(d.dil)}</strong>
                <span className="etiket">{t('klasor.surum', { no: son.no })}</span>
                <a className="dugme dugme-ikincil dugme-kucuk" href={`api/ciktilar/dosya/${son.id}`} download="">{t('cikti.indir')}</a>
              </div>
              <p className="cikti-dosya-meta">{`${son.ad} · ${boyutYaz(son.boyut)} · ${tamTarih(son.created.slice(0, 10))}${son.yukleyen ? ' · ' + son.yukleyen : ''}`}</p>
              {eski.length > 0 && (
                <details className="cikti-eski">
                  <summary>{t('cikti.eskiSurumler', { n: eski.length })}</summary>
                  <ul>
                    {eski.map(s => (
                      <li key={s.id}>
                        <a className="metin-bag" href={`api/ciktilar/dosya/${s.id}`} download="">{`${t('klasor.surum', { no: s.no })} · ${s.ad}`}</a>
                        <span className="cikti-dosya-meta">{` · ${tamTarih(s.created.slice(0, 10))}`}</span>
                        {c.yetkili && <button type="button" className="fd-sil" aria-label={`${t('genel.sil')}: ${s.ad}`} onClick={() => surumSil(s)}>×</button>}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          );
        })}
        {c.yetkili && (
          <>
            <div className="cikti-yukle">
              <span className="cikti-yukle-etiket">{t('cikti.dil')}</span>
              <select aria-label={t('cikti.dil')} value={yukleDil} onChange={o => setYukleDil(o.target.value)}>
                {diller.map(kod => <option key={kod} value={kod}>{dilAdi(kod)}</option>)}
              </select>
              <label className="dugme dugme-birincil">{t('cikti.surumYukle')}
                <input ref={girdi} className="gorsel-gizli" type="file" onChange={yukle} />
              </label>
            </div>
            <p className="cikti-not">{t('cikti.yukleNot')}</p>
          </>
        )}
      </section>
    </article>
  );
}

function DuzenKutusu({ c, durumlar, kapat, yenile }) {
  const [hata, setHata] = useState('');
  useEffect(() => { setHata(''); }, [c]);
  /* Sorumlu ve tarih: takvimden geliyorsa gizli; değilse yalnızca koordinatör. */
  const serbest = c && !c.etkinlikId && durum.kullanici.koordinator;

  return (
    <Kutu acik={!!c} onKapat={kapat} koru id="cikti-kutu">
      {c && (
        <form id="cikti-form" className="kutu-ic" onSubmit={async o => {
          o.preventDefault();
          const f = o.currentTarget;
          setHata('');
          try {
            await iste(`api/ciktilar/${c.slug}`, {
              method: 'PUT',
              body: JSON.stringify({
                durum: f.durum.value, disUrl: f.disUrl.value.trim(), not: f.not.value,
                sorumlu: f.sorumlu.value, teslim: f.teslim.value,
              }),
            });
            kapat();
            bildir(t('genel.kaydedildi'));
            yenile();
          } catch (err) { setHata(err.message); }
        }}>
          <div className="kutu-ust">
            <h2 id="cikti-form-baslik">{baslik(c)}</h2>
            <button type="button" className="kapat" data-kapat aria-label={t('genel.kapat')}>×</button>
          </div>
          <div className="form-izgara">
            <label className="alan"><span>{t('cikti.durum')}</span>
              <select name="durum" defaultValue={c.durum}>{durumlar.map(d => <option key={d} value={d}>{t(`cikti.durum.${d}`)}</option>)}</select></label>
            <label className="alan" hidden={!serbest}><span>{t('cikti.sorumlu')}</span>
              <select name="sorumlu" defaultValue={c.sorumlu || ''}>
                <option value="">{t('cikti.sorumluYok')}</option>
                {durum.ortaklar.map(o => <option key={o.id} value={o.id}>{`${o.short} — ${o.name}`}</option>)}
              </select></label>
            <label className="alan" hidden={!serbest}><span>{t('cikti.teslim')}</span>
              <input name="teslim" type="date" defaultValue={c.teslim || ''} min={durum.proje.start} max={durum.proje.end} /></label>
            <p className="form-tam alan-ipucu" hidden={!c.etkinlikId}>{t('cikti.takvimden')}</p>
            <label className="alan form-tam"><span>{t('cikti.disUrl')}</span>
              <input name="disUrl" type="url" maxLength={500} placeholder="https://" defaultValue={c.disUrl || ''} /></label>
            <label className="alan form-tam"><span>{t('cikti.not')}</span>
              <textarea name="not" maxLength={1000} rows={3} defaultValue={c.not || ''} /></label>
          </div>
          <p className="hata" role="alert">{hata}</p>
          <div className="kutu-eylem">
            <button type="submit" className="dugme dugme-birincil">{t('genel.kaydet')}</button>
            <button type="button" className="dugme dugme-ikincil" data-kapat>{t('genel.vazgec')}</button>
          </div>
        </form>
      )}
    </Kutu>
  );
}
