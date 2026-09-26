import { useCallback, useEffect, useState } from 'react';
import { t, ortakAdi, ortakKisa } from '../../ortak.js';
import { onayla, bildir } from '../../bilesenler/Kutu.jsx';
import { api, SECIMLI, yanitlanabilir, sayi, damga, gunEtiketi, sirala, METIN_LISTE_SINIRI } from './yardim.jsx';

/**
 * Yanıtlar (koordinatör): özet grafikleri, tek tek tablo, bekleyenler ve
 * hatırlatma, Excel indirme.
 */
const degerMetni = deger => (Array.isArray(deger)
  ? deger.map(x => (x && typeof x === 'object' ? x.ad : x)).join(', ')
  : typeof deger === 'number' ? sayi(deger)
    : /^\d{4}-\d{2}-\d{2}$/.test(deger ?? '') ? gunEtiketi(deger)
      : String(deger ?? ''));
const kim = r => `${ortakKisa(r.partner)} · ${r.ad}`;

export default function Yanitlar({ id, basAyarla, hataGoster, uyar }) {
  const [sonuclar, setSonuclar] = useState(null);
  const [sekme, setSekme] = useState('ozet');
  const [hatirlatiliyor, setHatirlatiliyor] = useState(null);

  const yukle = useCallback(async () => {
    const s = await api(`api/formlar/${id}/yanitlar`);
    setSonuclar(s);
    basAyarla(t('form.sekme.yanitlar'), s.form.baslik);
  }, [id, basAyarla]);
  useEffect(() => { yukle().catch(hataGoster); }, [yukle, hataGoster]);
  if (!sonuclar) return null;
  const { form, yanitlar, bekleyen, hesapsiz } = sonuclar;

  const yanitSil = async r => {
    if (!(await onayla(t('form.onay.yanitSil', { kim: kim(r) }), { evet: t('genel.sil'), tehlike: true }))) return;
    try { await api(`api/formlar/${form.id}/yanitlar/${r.id}`, { method: 'DELETE' }); await yukle(); } catch (hata) { uyar(hata); }
  };

  const hatirlat = async hedef => {
    const hepsi = hedef === 'hepsi';
    if (hepsi && !(await onayla(t('form.onay.hatirlat', { n: bekleyen.length })))) return;
    setHatirlatiliyor(hedef);
    try {
      const gonderildi = await api(`api/formlar/${form.id}/hatirlat`, { method: 'POST', body: JSON.stringify(hepsi ? {} : { kisiler: [hedef] }) });
      await yukle();
      bildir(t('form.bildirim.hatirlatildi', { n: gonderildi.sayi }));
    } catch (hata) { uyar(hata); } finally { setHatirlatiliyor(null); }
  };

  return (
    <section id="yanitlar-gorunum" className="gf">
      <nav className="gf-sekme" aria-label="Form bölümleri">
        <a href={`#duzenle/${id}`}>{t('form.sekme.sorular')}</a>
        <a href={`#duzenle/${id}/ayarlar`}>{t('form.sekme.ayarlar')}</a>
        <button type="button" aria-pressed="true" aria-current="page">{t('form.sekme.yanitlar')}</button>
      </nav>
      <div className="fp-kart gf-bas gf-yanit-bas">
        <div>
          <h2 id="yanit-sayisi">{t('form.yanitSayisi', { n: yanitlar.length })}</h2>
          <p id="yanit-giris" className="soluk">{`${form.baslik} · ${t('form.bekleyenSayisi', { n: bekleyen.length })} · ${
            form.acik ? (form.sonTarih ? t('form.sonGun', { gun: gunEtiketi(form.sonTarih) }) : t('form.yanitAliyor')) : t('form.yanitKapali')}`}</p>
        </div>
        <a id="yanit-excel" className="dugme dugme-ikincil" href={`api/formlar/${id}/yanitlar?bicim=xlsx`} download="">{t('form.excel')}</a>
      </div>
      <div className="gorunum gf-altsekme" role="tablist">
        <button type="button" aria-pressed={sekme === 'ozet'} onClick={() => setSekme('ozet')}>{t('form.sekme.ozet')}</button>
        <button type="button" aria-pressed={sekme === 'tablo'} onClick={() => setSekme('tablo')}>{t('form.sekme.tablo')}</button>
        <button type="button" aria-pressed={sekme === 'bekleyen'} onClick={() => setSekme('bekleyen')}>
          <span>{t('form.sekme.bekleyen')}</span> <span id="bekleyen-sayi">{`(${bekleyen.length})`}</span>
        </button>
      </div>
      <div id="yanit-ozet" className="fp-yigin" hidden={sekme !== 'ozet'}><Ozet form={form} yanitlar={yanitlar} /></div>
      <div id="yanit-tablo" hidden={sekme !== 'tablo'}><Tablo form={form} yanitlar={yanitlar} sil={yanitSil} /></div>
      <div id="yanit-bekleyen" hidden={sekme !== 'bekleyen'}>
        <section className="fp-kart">
          <h3>{t('form.bekleyenBaslik', { n: bekleyen.length })}</h3>
          {form.acik
            ? bekleyen.length > 0 && (
              <div className="fp-satir hatirlat-cubuk">
                <button type="button" className="dugme dugme-birincil" disabled={hatirlatiliyor === 'hepsi'} onClick={() => hatirlat('hepsi')}>{t('form.hatirlat.hepsi', { n: bekleyen.length })}</button>
                <small className="soluk">{t('form.hatirlat.ipucu')}</small>
              </div>
            )
            : <p className="soluk">{t('form.bekleyen.kapali')}</p>}
          {bekleyen.length
            ? (
              <ul className="bekleyen-liste">
                {bekleyen.map(p => (
                  <li key={p.id}>
                    <span><strong>{ortakKisa(p.partner)}</strong> {p.ad}
                      {p.hatirlatildi && <small className="soluk hatirlatildi">{t('form.hatirlatildiZaman', { zaman: damga(p.hatirlatildi) })}</small>}</span>
                    {form.acik && <button type="button" className="metin-bag" disabled={hatirlatiliyor === p.id} onClick={() => hatirlat(p.id)}>{p.hatirlatildi ? t('form.hatirlat.yeniden') : t('form.hatirlat.tek')}</button>}
                  </li>
                ))}
              </ul>
            )
            : <p className="bos-durum">{t('form.herkesYanitladi')}</p>}
        </section>
        {hesapsiz.length > 0 && <p className="fp-not">{t('form.hesapsizKurum', { n: hesapsiz.length, kurumlar: hesapsiz.map(ortakAdi).join(', ') })}</p>}
      </div>
    </section>
  );
}

/* Yanıt hücresi: dosya sorusunda indirme bağlantıları, ötekilerde düz metin. */
function YanitDegeri({ q, deger, formId }) {
  if (q.type === 'dosya' && Array.isArray(deger)) {
    return deger.map((d, i) => <span key={d.id}>{i > 0 && <br />}<a className="dosya-bag" href={`api/formlar/${formId}/dosya/${d.id}`} download="">{d.ad}</a></span>);
  }
  return degerMetni(deger);
}

function Tablo({ form, yanitlar, sil }) {
  if (!yanitlar.length) return <p className="bos-durum">{t('form.yanitYok')}</p>;
  const satirlar = [...yanitlar].sort((a, b) => sirala(a.partner, b.partner));
  const sorular = form.sorular.filter(yanitlanabilir);
  return (
    <div className="tablo-kaydir">
      <table className="yanit-tablo">
        <thead>
          <tr>
            <th>{t('takvim.filtre.ortak')}</th><th>{t('form.sutun.kisi')}</th><th>{t('form.sutun.zaman')}</th>
            {sorular.map(q => <th key={q.id}>{q.title}{q.archived && <> <small>{t('form.kaldirildiEki')}</small></>}</th>)}
            <th><span className="gorsel-gizli">{t('genel.sil')}</span></th>
          </tr>
        </thead>
        <tbody>
          {satirlar.map(r => (
            <tr key={r.id}>
              <td>{ortakAdi(r.partner)}</td><td>{r.ad}</td><td className="sarmasiz">{damga(r.updated)}</td>
              {sorular.map(q => <td key={q.id}><YanitDegeri q={q} deger={r.yanitlar[q.id]} formId={form.id} /></td>)}
              <td><button type="button" className="metin-bag is-tehlike" onClick={() => sil(r)}>{t('genel.sil')}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---- Özet grafikleri -----------------------------------------------------
   Google Formlar gibi: tek seçimli soruda pasta, çok seçimlide sütun
   grafiği. Renk seçeneğe bağlıdır (formdaki sırası), sayıya göre değişmez.
   Sekiz renkten fazla seçenek pastada okunmaz: o zaman yatay çubuk listesi. */
const SERI = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
const PASTA_MAKS = SERI.length, SUTUN_MAKS = 10;
const yuzde = (n, toplam) => (toplam ? Math.round((n / toplam) * 1000) / 10 : 0);
const yuzdeMetni = deger => t('form.yuzde', { n: sayi(deger) });

function secimSayilari(q, verilenler) {
  const sayilar = new Map(q.options.map(o => [o, 0]));
  for (const r of verilenler) for (const deger of [r.yanitlar[q.id]].flat()) sayilar.set(deger, (sayilar.get(deger) || 0) + 1);
  return [...sayilar].map(([secenek, n]) => ({ secenek, n, eski: !q.options.includes(secenek) }));
}
const SecenekEtiketi = ({ satir }) => <>{satir.secenek}{satir.eski && <> <small className="soluk">{t('form.eskiSecenek')}</small></>}</>;

function PastaGrafik({ satirlar, toplam }) {
  const cx = 100, cy = 100, r = 96;
  let aci = -Math.PI / 2;
  const dilimler = satirlar.map((satir, i) => {
    const renk = SERI[i], ipucu = `${satir.secenek}: ${satir.n} (${yuzdeMetni(yuzde(satir.n, toplam))})`;
    if (!satir.n) return null;
    if (satir.n === toplam) return <circle key={i} cx={cx} cy={cy} r={r} fill={renk}><title>{ipucu}</title></circle>;
    const son = aci + (satir.n / toplam) * Math.PI * 2;
    const [x1, y1, x2, y2] = [cx + r * Math.cos(aci), cy + r * Math.sin(aci), cx + r * Math.cos(son), cy + r * Math.sin(son)];
    const d = `M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${son - aci > Math.PI ? 1 : 0} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`;
    aci = son;
    return <path key={i} d={d} fill={renk}><title>{ipucu}</title></path>;
  });
  /* Lejant aynı zamanda tablo: renk tek başına kimlik taşımasın diye ad, sayı ve yüzde yazılı. */
  return (
    <div className="pasta-grafik">
      <svg viewBox="0 0 200 200" role="img">{dilimler}</svg>
      <ul className="grafik-lejant">
        {satirlar.map((satir, i) => (
          <li key={i}><i className="renk" style={{ background: SERI[i] }} /><span><SecenekEtiketi satir={satir} /></span><b>{satir.n}</b><small>{yuzdeMetni(yuzde(satir.n, toplam))}</small></li>
        ))}
      </ul>
    </div>
  );
}

function SutunGrafik({ satirlar, toplam }) {
  const maks = Math.max(1, ...satirlar.map(s => s.n));
  return (
    <div className="sutun-grafik" data-adet={satirlar.length}>
      {satirlar.map((satir, i) => (
        <div key={i} className="sutun" title={`${satir.secenek}: ${satir.n} (${yuzdeMetni(yuzde(satir.n, toplam))})`}>
          <b>{satir.n}<small>{yuzdeMetni(yuzde(satir.n, toplam))}</small></b>
          <span className="sutun-ray"><i style={{ height: `${(satir.n / maks) * 100}%` }} /></span>
          <span className="sutun-etiket"><SecenekEtiketi satir={satir} /></span>
        </div>
      ))}
    </div>
  );
}

function CubukListe({ satirlar, toplam }) {
  const maks = Math.max(1, ...satirlar.map(s => s.n));
  return (
    <div className="cubuk-liste">
      {satirlar.map((satir, i) => (
        <div key={i} className="cubuk-satir">
          <span className="cubuk-etiket"><SecenekEtiketi satir={satir} /></span>
          <span className="cubuk"><i style={{ width: `${(satir.n / maks) * 100}%` }} /></span>
          <b>{satir.n}</b><small>{yuzdeMetni(yuzde(satir.n, toplam))}</small>
        </div>
      ))}
    </div>
  );
}

function MetinListesi({ q, verilenler, formId }) {
  const [hepsi, setHepsi] = useState(false);
  if (!verilenler.length) return null;
  const satirlar = [...verilenler].sort((a, b) => sirala(a.partner, b.partner));
  const gorunen = hepsi ? satirlar : satirlar.slice(0, METIN_LISTE_SINIRI);
  return (
    <>
      <ul className="metin-yanitlar">
        {gorunen.map(r => <li key={r.id}><small>{kim(r)}</small><YanitDegeri q={q} deger={r.yanitlar[q.id]} formId={formId} /></li>)}
      </ul>
      {!hepsi && satirlar.length > METIN_LISTE_SINIRI && (
        <button type="button" className="metin-bag" onClick={() => setHepsi(true)}>{t('form.tumunuGoster', { n: satirlar.length })}</button>
      )}
    </>
  );
}

function Ozet({ form, yanitlar }) {
  if (!yanitlar.length) return <p className="bos-durum">{t('form.yanitYok')}</p>;
  /* "Kimler yanıt verdi?": yanıt sırasıyla kurum, ad ve zaman. */
  const sirali = [...yanitlar].sort((a, b) => a.updated.localeCompare(b.updated));
  return (
    <>
      <section className="fp-kart ozet-kart">
        <h3>{t('form.kimlerYanitladi')}</h3>
        <p className="soluk">{t('form.kisiSayisi', { n: yanitlar.length })}</p>
        <ul className="metin-yanitlar yanitlayanlar">{sirali.map(r => <li key={r.id}><span>{kim(r)}</span><small>{damga(r.updated)}</small></li>)}</ul>
      </section>
      {form.sorular.filter(yanitlanabilir).map(q => {
        const verilenler = yanitlar.filter(r => r.yanitlar[q.id] !== undefined);
        let govde = null;
        if (SECIMLI.includes(q.type)) {
          const satirlar = secimSayilari(q, verilenler);
          /* Tek seçimde yüzdeler toplam seçim, çok seçimde yanıt veren kişi sayısına göre. */
          if (q.type !== 'coklu' && satirlar.length <= PASTA_MAKS && verilenler.length) govde = <PastaGrafik satirlar={satirlar} toplam={verilenler.length} />;
          else if (q.type === 'coklu' && satirlar.length <= SUTUN_MAKS) govde = <SutunGrafik satirlar={satirlar} toplam={verilenler.length} />;
          else govde = <CubukListe satirlar={satirlar} toplam={verilenler.length} />;
        } else if (q.type === 'sayi') {
          const degerler = verilenler.map(r => r.yanitlar[q.id]).filter(Number.isFinite);
          const toplam = degerler.reduce((a, b) => a + b, 0);
          if (degerler.length) {
            govde = (
              <>
                <dl className="sayi-istatistik">
                  {[[t('form.sayi.toplam'), toplam], [t('form.sayi.ortalama'), toplam / degerler.length],
                    [t('form.sayi.enAz'), Math.min(...degerler)], [t('form.sayi.enCok'), Math.max(...degerler)]]
                    .map(([etiket, deger]) => <div key={etiket}><dt>{etiket}</dt><dd>{sayi(deger)}</dd></div>)}
                </dl>
                <MetinListesi q={q} verilenler={verilenler} formId={form.id} />
              </>
            );
          }
        } else if (verilenler.length) govde = <MetinListesi q={q} verilenler={verilenler} formId={form.id} />;

        return (
          <section key={q.id} className={`fp-kart ozet-kart${q.archived ? ' is-kaldirildi' : ''}`}>
            <h3>{q.title}{q.archived && <> <small className="soluk">{t('form.kaldirildiEki')}</small></>}</h3>
            <p className="soluk">{t('form.nYanit', { n: verilenler.length })}{q.type === 'coklu' ? ' · ' + t('form.coklu.not') : ''}</p>
            {govde || <p className="soluk">{t('form.soruYanitsiz')}</p>}
          </section>
        );
      })}
    </>
  );
}
