import { useCallback, useEffect, useRef, useState } from 'react';
import { durum, t } from '../../ortak.js';
import { onayla, bildir } from '../../bilesenler/Kutu.jsx';
import {
  api, bolumMu, yanitlanabilir, damga, saat, gunEtiketi, boyutMetni, zenginHtml, gorselAdresi,
  MAX_DOSYA, MAX_DOSYA_MB, DOSYA_KABUL, SIMGE,
} from './yardim.jsx';

/**
 * Doldurma / önizleme ekranı. Form bölümlere göre sayfalara ayrılır; yanıt
 * yazdıkça iki saniyede bir TASLAK olarak sunucuya kaydedilir.
 *
 * Alanlar denetimsiz (uncontrolled) tutulur ve gönderirken FormData ile
 * okunur: bütün sayfalar DOM'da durur (gizli olanlar da), böylece sayfa
 * değiştirmek yanıtları kaybettirmez.
 */

/** `#doldur/12`: formu sunucudan yükler. */
export function DoldurGorunumu({ id, git, basAyarla, hataGoster, koordinator }) {
  const [f, setF] = useState(null);
  const [surum, setSurum] = useState(0);
  useEffect(() => {
    api('api/formlar/' + id).then(v => {
      /* Kaldırılmış sorular doldurma ekranında yok. */
      setF({ ...v, sorular: v.sorular.filter(q => !q.archived) });
    }).catch(hataGoster);
  }, [id, surum, hataGoster]);
  if (!f) return null;
  return <DoldurFormu key={surum} f={f} git={git} basAyarla={basAyarla} koordinator={koordinator} yenidenYukle={() => setSurum(s => s + 1)} />;
}

/* Form bölümlerden sayfalara ayrılır; bölümle başlamayan ilk kısım 1. sayfadır. */
function sayfalaraAyir(sorular) {
  const sonuc = [];
  for (const q of sorular) {
    if (bolumMu(q) || !sonuc.length) sonuc.push({ bolum: bolumMu(q) ? q : null, sorular: [] });
    if (!bolumMu(q)) sonuc.at(-1).sorular.push(q);
  }
  return sonuc.length ? sonuc : [{ bolum: null, sorular: [] }];
}

const TASLAK_GECIKME = 2000;

/**
 * `taslakOnizleme`: düzenleyicideki kaydedilmemiş taslağın önizlemesi.
 * Sunucuya bir şey gönderilmez; yanıtlar denenebilir ama kaydedilmez.
 */
export function DoldurFormu({ f, git, basAyarla, koordinator, taslakOnizleme = false, duzenlemeyeDon, yenidenYukle }) {
  const onizleme = taslakOnizleme || !f.doldurur;
  const gonderebilir = !onizleme && f.acik;
  /* Gönderilmemiş taslak, gönderilmiş yanıttan yeniyse o yüklenir. */
  const taslakKullan = gonderebilir && f.taslak && (!f.yanitladi || f.taslak.updated > f.yanitladi);
  const ilkYanitlar = (taslakKullan ? f.taslak.yanitlar : f.yanitlarim) || {};

  const formRef = useRef(null);
  const [sayfa, setSayfa] = useState(0);
  const [hatalar, setHatalar] = useState({});
  const [genelHata, setGenelHata] = useState('');
  const [taslakDurum, setTaslakDurum] = useState('');
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [dosyalar, setDosyalar] = useState(() => Object.fromEntries(f.sorular.filter(q => q.type === 'dosya')
    .map(q => [q.id, Array.isArray(ilkYanitlar[q.id]) ? ilkYanitlar[q.id].filter(d => d && d.id) : []])));
  const dosyalarRef = useRef(dosyalar);
  dosyalarRef.current = dosyalar;
  const zamanlayici = useRef(null);
  const sayfalar = sayfalaraAyir(f.sorular);

  useEffect(() => { basAyarla(onizleme ? t('form.onizleme') : t('form.sayfa.baslik'), f.baslik); }, [basAyarla, onizleme, f.baslik]);

  /**
   * Yanıtları formdan okur. `denetle` açıkken verilen sorularda zorunluluk ve
   * sayı biçimi denetlenir; hatalı kartlar işaretlenir, ilk hatalı soru döner.
   */
  const yanitlariOku = useCallback((sorular, denetle) => {
    const form = formRef.current;
    if (!form) return { yanitlar: {}, ilkHata: null };
    const veri = new FormData(form), yanitlar = {};
    let ilkHata = null;
    const yeniHatalar = {};
    for (const q of sorular.filter(yanitlanabilir)) {
      const ad = `q-${q.id}`;
      const deger = q.type === 'dosya' ? (dosyalarRef.current[q.id] || []).map(d => d.id)
        : q.type === 'coklu' ? veri.getAll(ad)
          : String(veri.get(ad) ?? '').trim();
      const bos = Array.isArray(deger) ? !deger.length : !deger;
      if (denetle) {
        let sorun = q.required && bos ? (q.type === 'dosya' ? t('form.hata.dosyaGerekli') : t('form.hata.zorunluAlan')) : '';
        if (!sorun && q.type === 'sayi' && !bos && !Number.isFinite(Number(deger.replace(',', '.')))) sorun = t('form.hata.gecerliSayi');
        yeniHatalar[q.id] = sorun;
        if (sorun && !ilkHata) ilkHata = q;
      }
      if (!bos) yanitlar[q.id] = deger;
    }
    if (denetle) setHatalar(h => ({ ...h, ...yeniHatalar }));
    return { yanitlar, ilkHata };
  }, []);

  /* ---- Taslak: yazdıkça birkaç saniyede bir sunucuya kaydedilir ---------- */
  const taslagiKaydet = useCallback(async ({ keepalive = false } = {}) => {
    clearTimeout(zamanlayici.current); zamanlayici.current = null;
    if (!gonderebilir) return;
    const { yanitlar } = yanitlariOku(f.sorular, false);
    try {
      setTaslakDurum(t('form.taslak.kaydediliyor'));
      const kayit = await api(`api/formlar/${f.id}/taslak`, { method: 'PUT', body: JSON.stringify({ yanitlar }), keepalive });
      setTaslakDurum(t('form.taslak.kaydedildi', { saat: saat(kayit.updated) }));
    } catch { setTaslakDurum(t('form.taslak.kaydedilemedi')); }
  }, [gonderebilir, f, yanitlariOku]);

  const taslagiPlanla = useCallback(() => {
    if (!gonderebilir) return;
    clearTimeout(zamanlayici.current);
    setTaslakDurum(t('form.taslak.kaydedilmemis'));
    zamanlayici.current = setTimeout(taslagiKaydet, TASLAK_GECIKME);
  }, [gonderebilir, taslagiKaydet]);

  /* Sayfadan çıkarken (sekme kapanırken ya da başka görünüme geçerken)
     bekleyen taslak kaybolmasın. */
  const kaydetRef = useRef(taslagiKaydet);
  kaydetRef.current = taslagiKaydet;
  useEffect(() => {
    const bosalt = () => { if (zamanlayici.current) kaydetRef.current({ keepalive: true }); };
    addEventListener('pagehide', bosalt);
    return () => { removeEventListener('pagehide', bosalt); bosalt(); };
  }, []);

  const sayfaGoster = (index, kaydir = true) => {
    setSayfa(index);
    setGenelHata('');
    if (kaydir) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const sorunuGoster = q => {
    setGenelHata(t('form.hata.eksikYanit'));
    requestAnimationFrame(() => {
      const kutu = formRef.current?.querySelector(`[data-id="${q.id}"]`);
      kutu?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      kutu?.querySelector('input, textarea, select')?.focus({ preventScroll: true });
    });
  };

  /* İleri: yalnızca bu sayfanın soruları denetlenir. */
  const adim = fark => {
    if (fark > 0) {
      const { ilkHata } = yanitlariOku(sayfalar[sayfa].sorular, gonderebilir);
      if (ilkHata) return sorunuGoster(ilkHata);
    }
    sayfaGoster(Math.min(Math.max(sayfa + fark, 0), sayfalar.length - 1));
  };

  const gonder = async olay => {
    olay.preventDefault();
    /* Ara sayfada Enter "İleri" demektir. */
    if (sayfa < sayfalar.length - 1) return adim(1);
    if (!gonderebilir) return;
    const { yanitlar, ilkHata } = yanitlariOku(f.sorular, true);
    if (ilkHata) {
      /* Hatalı soru başka sayfadaysa oraya dönülür. */
      sayfaGoster(sayfalar.findIndex(p => p.sorular.includes(ilkHata)), false);
      return sorunuGoster(ilkHata);
    }
    setGenelHata('');
    setGonderiliyor(true);
    clearTimeout(zamanlayici.current); zamanlayici.current = null;
    try {
      await api(`api/formlar/${f.id}/yanit`, { method: 'PUT', body: JSON.stringify({ yanitlar }) });
      bildir(t('form.bildirim.yanitKaydedildi', { baslik: f.baslik }));
      git('#');
    } catch (hata) { setGenelHata(hata.message); setGonderiliyor(false); }
  };

  const dosyaYukle = async (q, girdi) => {
    const secilenler = [...girdi.files];
    girdi.value = '';
    setHatalar(h => ({ ...h, [q.id]: '' }));
    const etiket = girdi.closest('.dosya-sec').querySelector('span');
    for (const dosya of secilenler) {
      if (dosyalarRef.current[q.id].length >= MAX_DOSYA) { setHatalar(h => ({ ...h, [q.id]: t('form.hata.cokDosya2', { n: MAX_DOSYA }) })); break; }
      if (dosya.size > MAX_DOSYA_MB * 1024 * 1024) { setHatalar(h => ({ ...h, [q.id]: t('form.hata.dosyaBuyuk', { ad: dosya.name, mb: MAX_DOSYA_MB }) })); continue; }
      etiket.textContent = t('form.dosya.yukleniyor', { ad: dosya.name });
      try {
        const yanit = await fetch(`api/formlar/${f.id}/dosya?soru=${encodeURIComponent(q.id)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(dosya.name) },
          body: dosya,
        });
        const veri = await yanit.json().catch(() => ({}));
        if (!yanit.ok) throw Error(durum.sozluk[veri.error] || veri.error || t('form.hata.dosyaYuklenemedi'));
        const yeni = { ...dosyalarRef.current, [q.id]: [...dosyalarRef.current[q.id], veri] };
        dosyalarRef.current = yeni;
        setDosyalar(yeni);
      } catch (hata) { setHatalar(h => ({ ...h, [q.id]: hata.message })); }
    }
    etiket.textContent = t('form.dosya.ekle');
    taslagiPlanla();
  };

  const dosyaKaldir = (qid, i) => {
    const yeni = { ...dosyalarRef.current, [qid]: dosyalarRef.current[qid].filter((_, j) => j !== i) };
    dosyalarRef.current = yeni;
    setDosyalar(yeni);
    taslagiPlanla();
  };

  const taslagiSil = async () => {
    if (!(await onayla(t('form.onay.taslakSil'), { evet: t('genel.sil'), tehlike: true }))) return;
    clearTimeout(zamanlayici.current); zamanlayici.current = null;
    try { await api(`api/formlar/${f.id}/taslak`, { method: 'DELETE' }); yenidenYukle?.(); } catch (hata) { setGenelHata(hata.message); }
  };

  const hepsiniTemizle = async () => {
    if (!(await onayla(t('form.onay.formuTemizle'), { tehlike: true }))) return;
    for (const girdi of formRef.current.querySelectorAll('input, textarea, select')) {
      if (girdi.type === 'checkbox' || girdi.type === 'radio') girdi.checked = false;
      else if (girdi.type !== 'file') girdi.value = '';
    }
    const bos = Object.fromEntries(Object.keys(dosyalarRef.current).map(id => [id, []]));
    dosyalarRef.current = bos;
    setDosyalar(bos);
    sayfaGoster(0);
    taslagiPlanla();
  };

  const notlar = [];
  if (taslakOnizleme) notlar.push(t('form.not.onizlemeTaslak'));
  else if (f.hal === 'taslak') notlar.push(t('form.not.taslakForm'));
  else if (onizleme) notlar.push(t('form.not.doldurulamaz'));
  else if (f.yanitladi) notlar.push(t('form.not.yanitKaydedildi', { zaman: damga(f.yanitladi) }) + ' ' + t(f.acik ? 'form.not.degistirebilirsiniz' : 'form.not.degistirilemez'));
  else if (!f.acik) notlar.push(t('form.not.kapali'));
  if (f.acik && f.sonTarih) notlar.push(t('form.not.sonTarih', { gun: gunEtiketi(f.sonTarih) }));
  const zorunluVar = f.sorular.some(q => q.required);
  const son = sayfa === sayfalar.length - 1, coklu = sayfalar.length > 1;
  const gorselKaynak = f.gorselKaynak || (f.gorsel ? gorselAdresi(f.id, f.gorsel) : '');

  return (
    <section id="doldur-gorunum" className="gf">
      <form id="doldur-form" ref={formRef} className="fp-yigin" noValidate onSubmit={gonder}
        onInput={taslagiPlanla} onChange={o => { if (o.target.type !== 'file') taslagiPlanla(); }}>
        {taslakOnizleme
          ? <p className="fp-not">{t('form.not.onizlemeBicim')} <button type="button" className="metin-bag" onClick={duzenlemeyeDon}>{t('form.duzenlemeyeDon')}</button></p>
          : koordinator && <p className="fp-not">{onizleme ? t('form.not.onizlemeBicim') : t('form.not.koordinatorDolduruyor')} <a className="metin-bag" href={`#duzenle/${f.id}`}>{t('form.formuDuzenle')}</a></p>}
        {taslakKullan && (
          <p className="fp-not fp-bildirim">{t('form.not.taslakVar', { zaman: damga(f.taslak.updated) })} <button type="button" className="metin-bag" onClick={taslagiSil}>{t('form.taslagiSil')}</button></p>
        )}
        {gorselKaynak && <div className="gf-kapak"><img src={gorselKaynak} alt={t('form.kapak.alt')} /></div>}
        <header className="fp-kart gf-bas">
          <h1 className="gf-form-baslik" dangerouslySetInnerHTML={{ __html: zenginHtml(f.baslikRich, f.baslik, true) }} />
          {f.aciklama && <div className="gf-form-aciklama" dangerouslySetInnerHTML={{ __html: zenginHtml(f.aciklamaRich, f.aciklama) }} />}
          {(notlar.length > 0 || zorunluVar) && (
            <div className="gf-bas-alt">
              {notlar.map((n, i) => <p key={i}>{n}</p>)}
              {zorunluVar && <p className="zorunlu">{t('form.zorunluIsaret')}</p>}
            </div>
          )}
        </header>
        {sayfalar.map((p, i) => (
          <div key={i} className="doldur-sayfa" data-sayfa={i} hidden={i !== sayfa}>
            {p.bolum && (
              <div className="fp-kart doldur-bolum">
                {coklu && <span className="bolum-etiket">{t('form.bolum.no', { n: i + 1, toplam: sayfalar.length })}</span>}
                {p.bolum.title && <h2>{p.bolum.title}</h2>}
                {p.bolum.help && <p className="doldur-yardim">{p.bolum.help}</p>}
              </div>
            )}
            {p.sorular.map(q => (
              <DoldurSorusu key={q.id} q={q} yanit={ilkYanitlar[q.id]} hata={hatalar[q.id]}
                kapali={taslakOnizleme ? q.type === 'dosya' : !gonderebilir}
                dosyalar={dosyalar[q.id]} formId={f.id} gonderebilir={gonderebilir}
                dosyaYukle={dosyaYukle} dosyaKaldir={dosyaKaldir}
                temizle={() => {
                  for (const girdi of formRef.current.querySelectorAll(`[name="q-${q.id}"]`)) girdi.checked = false;
                  taslagiPlanla();
                }} />
            ))}
          </div>
        ))}
        <div className="fp-eylem gf-doldur-eylem">
          <p className="hata" role="alert">{genelHata}</p>
          <button type="button" className="dugme dugme-ikincil" hidden={sayfa === 0} onClick={() => adim(-1)}>{t('form.geri')}</button>
          <button type="button" className="dugme dugme-birincil" hidden={son} onClick={() => adim(1)}>{t('form.ileri')}</button>
          {gonderebilir && <button className="dugme dugme-birincil" type="submit" hidden={!son} disabled={gonderiliyor}>{f.yanitladi ? t('form.guncelle') : t('form.gonder')}</button>}
          <span className="sayfa-ilerleme" hidden={!coklu}>
            <span className="sayfa-cubuk"><i style={{ width: `${((sayfa + 1) / sayfalar.length) * 100}%` }} /></span>
            <small>{t('form.sayfaNo', { n: sayfa + 1, toplam: sayfalar.length })}</small>
          </span>
          <span className="doldur-son">
            {taslakOnizleme
              ? <button type="button" className="dugme dugme-ikincil" onClick={duzenlemeyeDon}>{t('form.duzenlemeyeDon')}</button>
              : gonderebilir
                ? <><small className="taslak-durum" aria-live="polite">{taslakDurum}</small><button type="button" className="metin-bag" onClick={hepsiniTemizle}>{t('form.formuTemizle')}</button></>
                : <a className="metin-bag" href="#">{t('form.formlaraDon')}</a>}
          </span>
        </div>
      </form>
    </section>
  );
}

function DoldurSorusu({ q, yanit, hata, kapali, dosyalar, formId, gonderebilir, dosyaYukle, dosyaKaldir, temizle }) {
  const ad = `q-${q.id}`;
  let alan;
  if (q.type === 'kisa') alan = <input name={ad} maxLength={500} placeholder={t('form.yanitiniz.placeholder')} defaultValue={yanit ?? ''} disabled={kapali} />;
  else if (q.type === 'paragraf') alan = <textarea name={ad} rows={2} maxLength={5000} placeholder={t('form.yanitiniz.placeholder')} defaultValue={yanit ?? ''} disabled={kapali} />;
  else if (q.type === 'sayi') alan = <input name={ad} inputMode="decimal" placeholder={t('form.yanitiniz.placeholder')} defaultValue={yanit ?? ''} disabled={kapali} className="doldur-dar" />;
  else if (q.type === 'tarih') alan = <input name={ad} type="date" min="1900-01-01" max="2099-12-31" defaultValue={yanit ?? ''} disabled={kapali} className="doldur-dar" />;
  else if (q.type === 'liste') {
    alan = (
      <select name={ad} disabled={kapali} className="doldur-dar" defaultValue={q.options.includes(yanit) ? yanit : ''}>
        <option value="">{t('form.secin')}</option>
        {q.options.map(o => <option key={o}>{o}</option>)}
      </select>
    );
  } else if (q.type === 'dosya') {
    const liste = dosyalar || [];
    alan = (
      <div className="dosya-alan" data-dosya={q.id}>
        <ul className="dosya-liste">
          {liste.map((d, i) => (
            <li key={d.id}>
              {SIMGE.dosya}<a href={`api/formlar/${formId}/dosya/${d.id}`} download="">{d.ad}</a><small>{boyutMetni(d.boyut)}</small>
              {gonderebilir && <button type="button" className="simge-dugme" aria-label={t('form.dosya.kaldir')} onClick={() => dosyaKaldir(q.id, i)}>{SIMGE.kapat}</button>}
            </li>
          ))}
        </ul>
        {kapali
          ? (!liste.length && <small className="soluk">{t('form.dosya.alan')}</small>)
          : (
            <>
              <label className="dugme dugme-ikincil dosya-sec" hidden={liste.length >= MAX_DOSYA}>
                {SIMGE.dosya}<span>{t('form.dosya.ekle')}</span>
                <input type="file" multiple accept={DOSYA_KABUL} className="gorsel-gizli" onChange={o => dosyaYukle(q, o.target)} />
              </label>
              <small className="soluk">{t('form.dosya.ipucu', { n: MAX_DOSYA, mb: MAX_DOSYA_MB })}</small>
            </>
          )}
      </div>
    );
  } else {
    const secili = q.type === 'coklu' ? (Array.isArray(yanit) ? yanit : []) : [yanit];
    alan = (
      <>
        <div className="doldur-secenekler">
          {q.options.map(o => (
            <label key={o} className="doldur-secenek">
              <input type={q.type === 'coklu' ? 'checkbox' : 'radio'} name={ad} value={o} defaultChecked={secili.includes(o)} disabled={kapali} /> <span>{o}</span>
            </label>
          ))}
        </div>
        {q.type === 'tekli' && !q.required && !kapali && <button type="button" className="metin-bag" onClick={temizle}>{t('form.secimiTemizle')}</button>}
      </>
    );
  }

  return (
    <fieldset className={`fp-kart doldur-soru is-${q.type}${hata ? ' hatali' : ''}`} data-id={q.id}>
      <legend>{q.title}{q.required && <> <b className="zorunlu" title={t('form.soru.zorunlu')}>*</b></>}</legend>
      {q.help && <p className="doldur-yardim">{q.help}</p>}
      {alan}
      <p className="doldur-hata" role="alert" hidden={!hata}>{hata}</p>
    </fieldset>
  );
}
