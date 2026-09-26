import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { durum, t } from '../../ortak.js';
import { onayla, bildir } from '../../bilesenler/Kutu.jsx';
import {
  api, TURLER, SECIMLI, bolumMu, yanitlanabilir, yeniId, zenginOku, zenginHtml, gorselAdresi, gorseliKucult, gorselYukle,
  hedefMetni, SIMGE, SecenekIsareti,
} from './yardim.jsx';
import { DoldurFormu } from './Doldur.jsx';

/**
 * Form oluşturma / düzenleme (koordinatör). Google Formlar düzeni: dar
 * sütun, üstte başlık kartı, altında soru kartları; seçili kart düzenlenir,
 * ötekiler ortağın göreceği biçimde önizlenir.
 *
 * İki kural (bkz. README · Formlar):
 *   · Soru kimliği kalıcıdır; yanıtlar kimlikle saklanır.
 *   · Yanıt almış sorunun TÜRÜ değişmez; silinirse "kaldırıldı" işaretlenir.
 *
 * `kokler`: seçeneklerin formun açıldığı andaki adları (yeni seçenekte null).
 * Kaydederken adı değişen seçenek sunucuya bildirilir; eski yanıtlar yeni
 * ada taşınır (bkz. lib/forms.mjs · renameAnswers).
 */
const bosSoru = (type = 'tekli') => ({
  id: yeniId(), type, title: '', help: '', required: false,
  options: SECIMLI.includes(type) ? [''] : [], kokler: SECIMLI.includes(type) ? [null] : [],
});

/* Seçenek adı düzeltmeleri: { soru: { eskiAd: yeniAd } }. */
function adDegisimleri(sorular) {
  const sonuc = {};
  for (const q of sorular) {
    if (!SECIMLI.includes(q.type) || !q.kokler) continue;
    const ciftler = {};
    q.options.forEach((secenek, j) => {
      const eski = q.kokler[j], yeni = secenek.trim();
      if (eski && yeni && eski !== yeni) ciftler[eski] = yeni;
    });
    if (Object.keys(ciftler).length) sonuc[q.id] = ciftler;
  }
  return sonuc;
}

export default function Duzenleyici({ id, sekme: ilkSekme, git, basAyarla, hataGoster, kirli, adresiDegistir }) {
  const [hazir, setHazir] = useState(!id);
  const [taslak, setTaslak] = useState(() => ({
    id: null, updated: null, yanitSayisi: 0, hal: 'taslak', yanitlanan: new Set(),
  }));
  const [sorular, setSorular] = useState(() => (id ? [] : [bosSoru()]));
  const [etkin, setEtkin] = useState(0);
  const [ayar, setAyar] = useState({ sonTarih: '', kapali: false, koordinatorDoldurur: false, hedefKip: 'hepsi', hedef: [] });
  const [gorsel, setGorsel] = useState({ surum: null, blob: null, url: null, kaldirildi: false });
  const [sekme, setSekme] = useState(ilkSekme === 'ayarlar' ? 'ayarlar' : 'sorular');
  const [hata, setHata] = useState('');
  const [bekliyor, setBekliyor] = useState(false);
  const [onizleme, setOnizleme] = useState(null);
  const [odak, setOdak] = useState(null);   // [soru sırası, seçici, sayaç]
  const baslikRef = useRef(null);
  const aciklamaRef = useRef(null);
  const gorselGirdi = useRef(null);
  const ilkIcerik = useRef({ baslik: '', aciklama: '' });

  const degisti = () => { kirli.current = true; };

  /* Yükleme */
  useEffect(() => {
    kirli.current = false;
    if (!id) { basAyarla(t('form.yeni.ustbaslik'), t('form.yeni')); return; }
    api('api/formlar/' + id).then(f => {
      setTaslak({ id, updated: f.updated, yanitSayisi: f.yanitSayisi, hal: f.hal, yanitlanan: new Set(f.yanitAlanSorular || []) });
      const liste = f.sorular.map(q => ({ ...q, options: q.options || [], kokler: [...(q.options || [])] }));
      setSorular(liste);
      setEtkin(Math.max(0, liste.findIndex(q => !q.archived)));
      setAyar({ sonTarih: f.sonTarih, kapali: f.kapali, koordinatorDoldurur: f.koordinatorDoldurur, hedefKip: f.hedef.length ? 'secili' : 'hepsi', hedef: f.hedef });
      setGorsel({ surum: f.gorsel, blob: null, url: null, kaldirildi: false });
      ilkIcerik.current = { baslik: zenginHtml(f.baslikRich, f.baslik, true), aciklama: zenginHtml(f.aciklamaRich, f.aciklama) };
      basAyarla(t('form.duzenle.ustbaslik'), f.baslik);
      setHazir(true);
    }).catch(hataGoster);
    return () => { kirli.current = false; };
  }, [id, basAyarla, hataGoster, kirli]);

  /* Biçimli alanların ilk içeriği bir kez yazılır; sonrasını tarayıcı yönetir
     (contenteditable). React bu alanların içine hiç dokunmaz. */
  useLayoutEffect(() => {
    if (!hazir) return;
    baslikRef.current.innerHTML = ilkIcerik.current.baslik;
    aciklamaRef.current.innerHTML = ilkIcerik.current.aciklama;
    if (!id) baslikRef.current.focus();
  }, [hazir, id]);

  /* Yeniden çizimden sonra seçilecek alan. */
  useEffect(() => {
    if (!odak) return;
    document.querySelector(`#soru-listesi [data-q="${odak[0]}"] ${odak[1]}`)?.focus();
  }, [odak]);

  /* İmlecin olduğu yerdeki biçim düğmeleri basılı görünür. */
  useEffect(() => {
    const esitle = () => {
      const alan = document.activeElement?.closest?.('.zengin-duzenleyici');
      if (!alan) return;
      for (const dugme of alan.parentElement.querySelectorAll('[data-cmd][aria-pressed]')) {
        let acik = false;
        try { acik = document.queryCommandState(dugme.dataset.cmd); } catch { /* desteklenmiyor */ }
        dugme.setAttribute('aria-pressed', String(acik));
      }
    };
    document.addEventListener('selectionchange', esitle);
    return () => document.removeEventListener('selectionchange', esitle);
  }, []);

  useEffect(() => () => { if (gorsel.url) URL.revokeObjectURL(gorsel.url); }, [gorsel.url]);

  if (!hazir) return null;

  /** Yapı değişince seçili kart ve imlecin gideceği alan. */
  const odakla = (index, secici) => { setEtkin(index); setOdak([index, secici, Date.now()]); };
  const yanitAldiMi = q => taslak.yanitlanan.has(q.id);
  const guncelle = (index, degisim) => {
    degisti();
    setSorular(l => l.map((q, i) => (i === index ? { ...q, ...(typeof degisim === 'function' ? degisim(q) : degisim) } : q)));
  };

  /* Bölüm numarası: form bölümle başlamıyorsa ilk sayfa 1. bölümdür. */
  const bolumEtiketi = index => {
    const onceki = sorular.slice(0, index + 1).filter(bolumMu).length;
    const toplam = sorular.filter(bolumMu).length + (bolumMu(sorular[0]) ? 0 : 1);
    return t('form.bolum.no', { n: onceki + (bolumMu(sorular[0]) ? 0 : 1), toplam });
  };

  const eylem = async (act, index, ek) => {
    const q = sorular[index];
    degisti();
    if (act === 'geri-al') { guncelle(index, { archived: false }); return odakla(index, '[data-field="title"]'); }
    if (act === 'secenek-ekle') { guncelle(index, x => ({ options: [...x.options, ''], kokler: [...x.kokler, null] })); return odakla(index, `[data-option="${q.options.length}"]`); }
    if (act === 'secenek-sil') {
      guncelle(index, x => ({ options: x.options.filter((_, j) => j !== ek), kokler: x.kokler.filter((_, j) => j !== ek) }));
      return odakla(index, `[data-option="${Math.max(0, ek - 1)}"]`);
    }
    if (act === 'yukari' || act === 'asagi') {
      const hedef = act === 'yukari' ? index - 1 : index + 1;
      setSorular(l => { const y = [...l]; [y[index], y[hedef]] = [y[hedef], y[index]]; return y; });
      return odakla(hedef, `[data-act="${act}"]:not(:disabled)`);
    }
    const araya = yeni => { setSorular(l => [...l.slice(0, index + 1), yeni, ...l.slice(index + 1)]); odakla(index + 1, '[data-field="title"]'); };
    if (act === 'araya-soru') return araya(bosSoru(bolumMu(q) ? 'tekli' : q.type));
    if (act === 'araya-bolum') return araya(bosSoru('bolum'));
    if (act === 'cogalt') return araya({ ...q, id: yeniId(), options: [...q.options], kokler: q.options.map(() => null) });
    if (act === 'sil') {
      /* Yanıt almış soru silinmez, kaldırılır: yanıtları raporda kalır, geri alınabilir. */
      if (yanitAldiMi(q)) {
        if (!(await onayla(t('form.onay.soruKaldir', { soru: q.title })))) return;
        const yeni = sorular.map((x, i) => (i === index ? { ...x, archived: true, required: false } : x));
        setSorular(yeni);
        const sonraki = yeni.findIndex((x, i) => i > index && !x.archived);
        return odakla(sonraki >= 0 ? sonraki : Math.max(0, yeni.findIndex(x => !x.archived)), '[data-field="title"]');
      }
      if (q.title && !(await onayla(t(bolumMu(q) ? 'form.onay.bolumSil' : 'form.onay.soruSil', { soru: q.title }), { evet: t('genel.sil'), tehlike: true }))) return;
      const yeni = sorular.filter((_, i) => i !== index);
      setSorular(yeni);
      return odakla(Math.min(index, yeni.length - 1), '[data-field="title"]');
    }
  };

  const turDegistir = (index, tur) => {
    /* Seçenekler tür değişince saklanır: yanlışlıkla "Kısa yanıt"a çevirip geri dönen kaybetmesin. */
    guncelle(index, x => (SECIMLI.includes(tur) && !x.options.length ? { type: tur, options: [''], kokler: [null] } : { type: tur }));
    odakla(index, '[data-field="type"]');
  };

  /* Seçenek alanında Enter bir sonraki seçeneği açar. */
  const secenekTus = (olay, index, j) => {
    if (olay.key !== 'Enter') return;
    olay.preventDefault();
    const at = j + 1;
    guncelle(index, x => ({ options: [...x.options.slice(0, at), '', ...x.options.slice(at)], kokler: [...x.kokler.slice(0, at), null, ...x.kokler.slice(at)] }));
    odakla(index, `[data-option="${at}"]`);
  };

  /* Çok satırlı yapıştırma her satırı ayrı seçenek yapar (Excel'den ya da listeden kopyalama). */
  const secenekYapistir = (olay, index, j) => {
    const satirlar = olay.clipboardData.getData('text').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (satirlar.length < 2) return;
    olay.preventDefault();
    guncelle(index, x => {
      const degistir = x.options[j] ? 0 : 1;
      const options = [...x.options], kokler = [...x.kokler];
      options.splice(j, degistir, ...satirlar);
      kokler.splice(j, degistir, ...satirlar.map(() => null));
      return { options, kokler };
    });
    odakla(index, `[data-option="${j + satirlar.length - 1}"]`);
  };

  const soruEkle = tur => {
    degisti();
    /* Yeni soru bir öncekinin türünü alır: art arda aynı tür sorular hızlı girilsin. */
    const son = sorular.findLast(yanitlanabilir);
    const yeni = [...sorular, bosSoru(tur || (son ? son.type : 'tekli'))];
    setSorular(yeni);
    odakla(yeni.length - 1, '[data-field="title"]');
  };

  /* ---- Kapak görseli ---- */
  const kapakKaynak = gorsel.url || (gorsel.surum && !gorsel.kaldirildi ? gorselAdresi(taslak.id, gorsel.surum) : '');
  const kapakSec = async olay => {
    const [dosya] = olay.target.files;
    olay.target.value = '';
    if (!dosya) return;
    setHata('');
    try {
      const blob = await gorseliKucult(dosya);
      setGorsel(g => ({ ...g, blob, url: URL.createObjectURL(blob), kaldirildi: false }));
      degisti();
    } catch (err) { setHata(err.message); }
  };
  const kapakKaldir = () => { setGorsel(g => ({ ...g, blob: null, url: null, kaldirildi: true })); degisti(); };

  async function kapagiKaydet(formId) {
    if (gorsel.blob) {
      const surum = await gorselYukle(formId, gorsel.blob);
      setGorsel({ surum, blob: null, url: null, kaldirildi: false });
    } else if (gorsel.kaldirildi && gorsel.surum) {
      await api(`api/formlar/${formId}/gorsel`, { method: 'DELETE' });
      setGorsel({ surum: null, blob: null, url: null, kaldirildi: false });
    }
  }

  /* Kaydet: taslakta "Taslağı kaydet", yayında "Değişiklikleri kaydet".
     `yayimla` kaydedip formu ortaklara açar. */
  const kaydet = async ({ yayimla = false } = {}) => {
    setHata('');
    const secili = ayar.hedefKip === 'secili';
    const hedef = secili ? ayar.hedef : [];
    const baslikRich = zenginOku(baslikRef.current, true);
    const aciklamaRich = zenginOku(aciklamaRef.current);
    if (!baslikRich) { setHata(t('form.hata.baslikBos')); setSekme('sorular'); return baslikRef.current.focus(); }
    if (secili && !hedef.length) { setHata(t('form.hata.hedefBos')); return setSekme('ayarlar'); }
    const bos = sorular.findIndex(q => yanitlanabilir(q) && !q.archived && !q.title.trim());
    if (bos >= 0) { setHata(t('form.hata.soruBos', { n: bos + 1 })); setSekme('sorular'); return odakla(bos, '[data-field="title"]'); }

    const govde = {
      baslik: baslikRef.current.textContent, baslikRich,
      aciklama: aciklamaRef.current.innerText, aciklamaRich,
      sonTarih: ayar.sonTarih, kapali: ayar.kapali, koordinatorDoldurur: ayar.koordinatorDoldurur,
      hedef, updated: taslak.updated,
      sorular: sorular.map(q => ({
        id: q.id, type: q.type, title: q.title, help: q.help, required: q.required,
        ...(q.archived ? { archived: true } : {}),
        ...(SECIMLI.includes(q.type) ? { options: q.options } : {}),
      })),
      renames: adDegisimleri(sorular),
    };
    if (yayimla && !(await onayla(t('form.onay.yayimla', {
      baslik: govde.baslik.trim(), hedef: hedefMetni({ hedef, koordinatorDoldurur: govde.koordinatorDoldurur }),
    }), { evet: t('form.yayimla') }))) return;

    setBekliyor(yayimla ? 'yayimla' : 'kaydet');
    try {
      const yeniMi = !taslak.id;
      const kayit = await api(yeniMi ? 'api/formlar' : 'api/formlar/' + taslak.id,
        { method: yeniMi ? 'POST' : 'PUT', body: JSON.stringify(govde) });
      /* Form kaydedildi; görsel yüklemesi başarısız olursa ikinci "Kaydet"
         aynı formu günceller, kopyasını oluşturmaz. */
      setTaslak(x => ({ ...x, id: kayit.id, updated: kayit.updated }));
      if (yeniMi) adresiDegistir(`#duzenle/${kayit.id}`);
      await kapagiKaydet(kayit.id);
      if (yayimla) await api(`api/formlar/${kayit.id}/durum`, { method: 'PUT', body: JSON.stringify({ durum: 'yayinda' }) });
      kirli.current = false;
      const baslik = baslikRef.current.textContent.trim();
      bildir(yayimla ? t('form.bildirim.yayimlandi', { baslik })
        : taslak.hal === 'taslak' ? t('form.bildirim.taslakKaydedildi', { baslik })
          : t('form.bildirim.guncellendi', { baslik }));
      git('#');
    } catch (err) { setHata(err.message); } finally { setBekliyor(false); }
  };

  const formuSil = async () => {
    const baslik = baslikRef.current.textContent.trim();
    if (!(await onayla(t('form.onay.formSil', { baslik }) + (taslak.yanitSayisi ? ' ' + t('form.onay.formSilYanit', { n: taslak.yanitSayisi }) : ''), { evet: t('genel.sil'), tehlike: true }))) return;
    try {
      await api('api/formlar/' + taslak.id, { method: 'DELETE' });
      kirli.current = false;
      bildir(t('form.bildirim.silindi', { baslik }));
      git('#');
    } catch (err) { setHata(err.message); }
  };

  const taslagaAl = async () => {
    if (kirli.current && !(await onayla(t('form.onay.kaydedilmemis'), { evet: t('genel.vazgecKapat'), tehlike: true }))) return;
    if (!(await onayla(t('form.onay.taslagaAl')))) return;
    try {
      await api(`api/formlar/${taslak.id}/durum`, { method: 'PUT', body: JSON.stringify({ durum: 'taslak' }) });
      kirli.current = false;
      git(`#duzenle/${taslak.id}`);
    } catch (err) { setHata(err.message); }
  };

  /* Önizle: düzenleyicideki hâli (kaydedilmemiş olsa da) ortağın göreceği
     biçimde gösterir. Adres değişmez; düzenleyici gizlenir ama yerinde durur. */
  const onizle = () => {
    setOnizleme({
      id: taslak.id,
      baslik: baslikRef.current.textContent.trim() || t('form.basliksiz'),
      baslikRich: zenginOku(baslikRef.current, true),
      aciklama: aciklamaRef.current.innerText.trim(),
      aciklamaRich: zenginOku(aciklamaRef.current),
      sonTarih: ayar.sonTarih,
      acik: true, yanitlarim: {}, gorsel: null, doldurur: false,
      gorselKaynak: kapakKaynak,
      sorular: sorular.filter(q => !q.archived && (bolumMu(q) || q.title.trim()))
        .map(q => ({ ...q, options: (q.options || []).filter(o => o.trim()) })),
    });
    scrollTo(0, 0);
  };
  const onizlemeyiKapat = () => {
    setOnizleme(null);
    basAyarla(taslak.id ? t('form.duzenle.ustbaslik') : t('form.yeni.ustbaslik'), baslikRef.current.textContent.trim() || t('form.yeni'));
    scrollTo(0, 0);
  };

  const hal = taslak.hal;
  const aktifSoruSayisi = sorular.filter(x => yanitlanabilir(x) && !x.archived).length;

  return (
    <>
      <section id="duzenle-gorunum" className="gf" hidden={!!onizleme}>
        <nav className="gf-sekme" aria-label="Form bölümleri">
          <button type="button" aria-pressed={sekme === 'sorular'} onClick={() => setSekme('sorular')}>{t('form.sekme.sorular')}</button>
          <button type="button" aria-pressed={sekme === 'ayarlar'} onClick={() => setSekme('ayarlar')}>{t('form.sekme.ayarlar')}</button>
          {taslak.id && <a id="duzenle-yanitlar" href={`#yanitlar/${taslak.id}`}>{taslak.yanitSayisi ? t('form.sekme.yanitlarN', { n: taslak.yanitSayisi }) : t('form.sekme.yanitlar')}</a>}
        </nav>

        {/* Durum şeridi: taslak / yayında / kapalı ve o duruma uygun eylem. */}
        <div id="duzenle-durum" className={`durum-serit is-${hal}`}>
          <span className={`form-rozet is-${hal}`}>{{ taslak: t('form.hal.taslak'), acik: t('form.hal.acik'), kapali: t('form.hal.kapali') }[hal]}</span>
          <span>{{ taslak: taslak.id ? t('form.durum.taslak') : t('form.durum.yeni'), acik: t('form.durum.acik'), kapali: t('form.durum.kapali') }[hal]}</span>
          {taslak.id && hal !== 'taslak' && !taslak.yanitSayisi && <button type="button" className="metin-bag" onClick={taslagaAl}>{t('form.taslagaAl')}</button>}
        </div>
        {taslak.yanitSayisi > 0 && <p id="duzenle-uyari" className="fp-not">{t('form.uyari.yanitli', { n: taslak.yanitSayisi })}</p>}

        <form id="duzenle-form" className="fp-yigin" noValidate onSubmit={o => o.preventDefault()}>
          {/* Kapak görseli: formun tepesinde, ortak formu açınca ilk bunu görür. */}
          <div className="gf-kapak" id="duzenle-kapak" hidden={!kapakKaynak || sekme !== 'sorular'}>
            {kapakKaynak && <img src={kapakKaynak} aria-label={t('form.kapak.alt')} alt="" />}
            <div className="gf-kapak-arac">
              <button type="button" className="dugme dugme-ikincil" onClick={() => gorselGirdi.current.click()}>{t('form.kapak.degistir')}</button>
              <button type="button" className="dugme dugme-ikincil" onClick={kapakKaldir}>{t('form.kapak.kaldir')}</button>
            </div>
          </div>
          <input type="file" ref={gorselGirdi} accept="image/jpeg,image/png,image/webp" hidden onChange={kapakSec} />

          <div className="fp-kart gf-bas" hidden={sekme !== 'sorular'}>
            {/* Başlık ve açıklama biçimli metin: seçilince altında araç çubuğu açılır. */}
            <ZenginAlan ref={baslikRef} satirIci className="gf-baslik-girdi" yerTutucu={t('form.baslik.yerTutucu')} degisti={degisti} />
            <ZenginAlan ref={aciklamaRef} className="gf-aciklama-girdi" yerTutucu={t('form.aciklama.yerTutucu')} degisti={degisti} />
            {!kapakKaynak && <button type="button" className="metin-bag gf-kapak-ekle" id="kapak-ekle" onClick={() => gorselGirdi.current.click()}>{t('form.kapak.ekle')}</button>}
          </div>

          <div className="fp-kart gf-ayar" hidden={sekme !== 'ayarlar'}>
            <h3>{t('form.ayar.yanitlar')}</h3>
            <label className="gf-secenek">
              <span><span>{t('form.ayar.kapali')}</span> <small>{t('form.ayar.kapali.ipucu')}</small></span>
              <input name="kapali" type="checkbox" role="switch" className="gf-anahtar" checked={ayar.kapali}
                onChange={o => { degisti(); setAyar(a => ({ ...a, kapali: o.target.checked })); }} />
            </label>
            <label className="gf-secenek">
              <span><span>{t('form.ayar.sontarih')}</span> <small>{t('form.ayar.sontarih.ipucu')}</small></span>
              <input name="sonTarih" type="date" className="gf-tarih" value={ayar.sonTarih}
                onChange={o => { degisti(); setAyar(a => ({ ...a, sonTarih: o.target.value })); }} />
            </label>
          </div>

          <fieldset className="fp-kart gf-ayar" hidden={sekme !== 'ayarlar'}>
            <legend className="gorsel-gizli">{t('form.ayar.kimler')}</legend>
            <h3 aria-hidden="true">{t('form.ayar.kimler')}</h3>
            <div className="secim-kartlari">
              {['hepsi', 'secili'].map(kip => (
                <label key={kip} className="secim-kart">
                  <input type="radio" name="hedef-kip" value={kip} checked={ayar.hedefKip === kip}
                    onChange={() => { degisti(); setAyar(a => ({ ...a, hedefKip: kip })); }} /> <span>{t(`form.hedef.${kip}`)}</span>
                </label>
              ))}
            </div>
            <label className="gf-secenek">
              <span><span>{t('form.ayar.koordinator')}</span> <small>{t('form.ayar.koordinator.ipucu')}</small></span>
              <input name="koordinatorDoldurur" type="checkbox" role="switch" className="gf-anahtar" checked={ayar.koordinatorDoldurur}
                onChange={o => { degisti(); setAyar(a => ({ ...a, koordinatorDoldurur: o.target.checked })); }} />
            </label>
            <div id="hedef-alan" hidden={ayar.hedefKip !== 'secili'}>
              <div className="fp-satir">
                <button type="button" className="metin-bag" onClick={() => { degisti(); setAyar(a => ({ ...a, hedef: durum.ortaklar.map(o => o.id) })); }}>{t('form.hedef.tumunuSec')}</button>
                <button type="button" className="metin-bag" onClick={() => { degisti(); setAyar(a => ({ ...a, hedef: [] })); }}>{t('form.hedef.temizle')}</button>
                <small id="hedef-sayi">{t('form.hedef.sayi', { n: ayar.hedef.length })}</small>
              </div>
              <div className="onay-izgara" id="hedef-kutular">
                {durum.ortaklar.map(o => (
                  <label key={o.id} className="onay">
                    <input type="checkbox" value={o.id} checked={ayar.hedef.includes(o.id)} onChange={olay => {
                      degisti();
                      setAyar(a => ({ ...a, hedef: olay.target.checked ? [...a.hedef, o.id] : a.hedef.filter(x => x !== o.id) }));
                    }} /> <span>{o.name} <small>{o.short}</small></span>
                  </label>
                ))}
              </div>
            </div>
          </fieldset>
        </form>

        <div id="soru-listesi" className="soru-listesi" hidden={sekme !== 'sorular'}>
          {sorular.map((q, index) => (
            <SoruKarti key={q.id} q={q} index={index} etkin={index === etkin} toplam={sorular.length}
              kilitli={yanitAldiMi(q)} silinemez={aktifSoruSayisi < 2} bolumEtiketi={bolumEtiketi}
              etkinlestir={() => odakla(index, '[data-field="title"]')}
              eylem={(act, ek) => eylem(act, index, ek)} guncelle={d => guncelle(index, d)}
              turDegistir={tur => turDegistir(index, tur)}
              secenekTus={(o, j) => secenekTus(o, index, j)} secenekYapistir={(o, j) => secenekYapistir(o, index, j)} />
          ))}
        </div>
        <div className="fp-ekle-satir" hidden={sekme !== 'sorular'}>
          <button type="button" id="soru-ekle" className="dugme dugme-ikincil" onClick={() => soruEkle()}>{t('form.soru.ekle')}</button>
          <button type="button" id="bolum-ekle" className="dugme dugme-ikincil" onClick={() => soruEkle('bolum')}>{t('form.bolum.ekle')}</button>
        </div>

        <div className="fp-eylem fp-yapiskan">
          <p id="duzenle-hata" className="hata" role="alert">{hata}</p>
          {hal === 'taslak' && <button type="button" id="yayimla-form" className="dugme dugme-birincil" disabled={!!bekliyor} onClick={() => kaydet({ yayimla: true })}>{t('form.kaydetYayimla')}</button>}
          <button type="button" id="kaydet-form" className={`dugme ${hal === 'taslak' ? 'dugme-ikincil' : 'dugme-birincil'}`} disabled={!!bekliyor} onClick={() => kaydet()}>
            {hal === 'taslak' ? t('form.kaydet.taslak') : t('form.kaydet.degisiklik')}
          </button>
          <a className="dugme dugme-ikincil" href="#">{t('genel.vazgec')}</a>
          <button type="button" id="onizle-form" className="dugme dugme-ikincil" onClick={onizle}>{t('form.onizle')}</button>
          {taslak.id && <button type="button" id="sil-form" className="dugme dugme-tehlike" onClick={formuSil}>{t('form.sil')}</button>}
        </div>
      </section>

      {onizleme && <DoldurFormu f={onizleme} git={git} basAyarla={basAyarla} taslakOnizleme duzenlemeyeDon={onizlemeyiKapat} />}
    </>
  );
}

/* --- Biçimli metin alanı --------------------------------------------------
   Başlıkta Enter yok; yapıştırılan metin biçimsiz girer. Araç çubuğundaki
   düğmeye basınca odak metinden kaçmasın, seçim korunsun. */
function ZenginAlan({ ref, satirIci = false, className, yerTutucu, degisti }) {
  const komut = (olay, cmd) => {
    const alan = olay.currentTarget.closest('.gf-zengin').querySelector('.zengin-duzenleyici');
    if (document.activeElement !== alan) alan.focus();
    document.execCommand('styleWithCSS', false, false);
    document.execCommand(cmd);
    if (cmd === 'removeFormat' && !satirIci) {
      /* removeFormat listeyi kaldırmaz; açıksa o da kapatılır. */
      for (const liste of ['insertUnorderedList', 'insertOrderedList']) if (document.queryCommandState(liste)) document.execCommand(liste);
    }
    for (const dugme of alan.parentElement.querySelectorAll('[data-cmd][aria-pressed]')) {
      let acik = false;
      try { acik = document.queryCommandState(dugme.dataset.cmd); } catch { /* desteklenmiyor */ }
      dugme.setAttribute('aria-pressed', String(acik));
    }
    degisti();
  };
  return (
    <div className="gf-zengin">
      <div ref={ref} className={`${className} zengin-duzenleyici`} contentEditable role="textbox" suppressContentEditableWarning
        aria-required={satirIci || undefined} aria-multiline={!satirIci || undefined} data-satir-ici={satirIci ? '' : undefined}
        data-yer-tutucu={yerTutucu}
        onKeyDown={o => { if (satirIci && o.key === 'Enter') o.preventDefault(); }}
        onPaste={o => {
          o.preventDefault();
          const metin = o.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, satirIci ? metin.replace(/\s*\n\s*/g, ' ') : metin);
        }}
        onInput={o => {
          /* Boşaltılan alanda tarayıcının bıraktığı <br> yer tutucuyu gizlemesin. */
          const alan = o.currentTarget;
          if (!alan.textContent.trim() && !alan.querySelector('li')) alan.innerHTML = '';
          degisti();
        }} />
      <div className="zengin-arac" role="toolbar">
        <AracDugmesi komut={komut} cmd="bold"><b>B</b></AracDugmesi>
        <AracDugmesi komut={komut} cmd="italic"><i>I</i></AracDugmesi>
        <AracDugmesi komut={komut} cmd="underline"><u>U</u></AracDugmesi>
        <span className="zengin-ayirac" aria-hidden="true" />
        {!satirIci && (
          <>
            <AracDugmesi komut={komut} cmd="insertUnorderedList"><span aria-hidden="true">•≡</span></AracDugmesi>
            <AracDugmesi komut={komut} cmd="insertOrderedList"><span aria-hidden="true">1≡</span></AracDugmesi>
            <span className="zengin-ayirac" aria-hidden="true" />
          </>
        )}
        <AracDugmesi komut={komut} cmd="removeFormat" basili={false}><s>T</s></AracDugmesi>
      </div>
    </div>
  );
}

const AracDugmesi = ({ komut, cmd, basili = true, children }) => (
  <button type="button" data-cmd={cmd} aria-pressed={basili ? 'false' : undefined}
    onMouseDown={o => o.preventDefault()} onClick={o => komut(o, cmd)}>{children}</button>
);

/* --- Soru kartları ---------------------------------------------------------- */
function SoruKarti(p) {
  const { q, index, etkin } = p;
  if (q.archived) {
    /* Kaldırılmış soru: doldurma ekranında yok, raporda duruyor; geri alınabilir. */
    return (
      <article className="soru-kart fp-kart is-kaldirildi" data-q={index}>
        <p className="soru-onizleme-baslik">{q.title}</p>
        <p className="soluk">{t('form.soru.kaldirildiNot')}</p>
        <button type="button" className="metin-bag" onClick={() => p.eylem('geri-al')}>{t('form.soru.geriAl')}</button>
      </article>
    );
  }
  const onizlemeOzellik = {
    tabIndex: 0, role: 'button', onClick: p.etkinlestir,
    onKeyDown: o => { if (o.target === o.currentTarget && (o.key === 'Enter' || o.key === ' ')) { o.preventDefault(); p.etkinlestir(); } },
  };
  if (bolumMu(q)) {
    return (
      <article className={`soru-kart fp-kart bolum-kart${etkin ? ' is-etkin' : ' is-onizleme'}`} data-q={index} {...(etkin ? {} : onizlemeOzellik)}>
        <span className="bolum-etiket">{p.bolumEtiketi(index)}</span>
        {etkin
          ? (
            <>
              <input data-field="title" value={q.title} maxLength={500} placeholder={t('form.bolum.baslik')} className="bolum-baslik-girdi" onChange={o => p.guncelle({ title: o.target.value })} onKeyDown={girisiEngelle} />
              <input data-field="help" value={q.help} maxLength={1000} placeholder={t('form.soru.aciklama')} className="soru-yardim" onChange={o => p.guncelle({ help: o.target.value })} onKeyDown={girisiEngelle} />
            </>
          )
          : (
            <>
              <p className="soru-onizleme-baslik">{q.title || <span className="soluk">{t('form.bolum.basliksiz')}</span>}</p>
              {q.help && <p className="doldur-yardim">{q.help}</p>}
            </>
          )}
        {etkin && (
          <>
            <div className="soru-alt">
              <TasimaAraclari {...p} />
              <span className="soru-araclar">
                <button type="button" className="simge-dugme" aria-label={t('form.bolum.sil')} data-act="sil" onClick={() => p.eylem('sil')}>{SIMGE.cop}</button>
              </span>
            </div>
            <AraEkle eylem={p.eylem} />
          </>
        )}
      </article>
    );
  }

  const secimli = SECIMLI.includes(q.type);
  if (!etkin) {
    /* Seçili olmayan soru, ortağın göreceği biçimde önizlenir; tıklanınca düzenlenir. */
    return (
      <article className="soru-kart fp-kart is-onizleme" data-q={index} {...onizlemeOzellik}>
        <p className="soru-onizleme-baslik">{q.title || <span className="soluk">{t('form.soru.basliksiz')}</span>}{q.required && <> <b className="zorunlu">*</b></>}</p>
        {q.help && <p className="doldur-yardim">{q.help}</p>}
        {secimli
          ? <ul className="secenek-liste is-onizleme">{q.options.map((s, j) => <li key={j}><SecenekIsareti type={q.type} j={j} /><span>{s || <span className="soluk">{t('form.secenek.no', { n: j + 1 })}</span>}</span></li>)}</ul>
          : <p className="soru-onizleme">{t(`form.onizleme.${q.type}`)}</p>}
      </article>
    );
  }

  return (
    <article className="soru-kart fp-kart is-etkin" data-q={index}>
      <div className="soru-ust">
        <input data-field="title" value={q.title} maxLength={500} placeholder={t('form.soru.metin')} onChange={o => p.guncelle({ title: o.target.value })} onKeyDown={girisiEngelle} />
        <select data-field="type" value={q.type} disabled={p.kilitli} onChange={o => p.turDegistir(o.target.value)}>
          {TURLER.map(tur => <option key={tur} value={tur}>{t(`form.tur.${tur}`)}</option>)}
        </select>
      </div>
      {p.kilitli && <p className="soru-kilit">{t('form.soru.kilit')}{secimli ? ' ' + t('form.soru.kilitSecenek') : ''}</p>}
      <input data-field="help" value={q.help} maxLength={1000} placeholder={t('form.soru.aciklama')} className="soru-yardim" onChange={o => p.guncelle({ help: o.target.value })} onKeyDown={girisiEngelle} />
      {secimli
        ? (
          <ol className="secenek-liste">
            {q.options.map((s, j) => (
              <li key={j}>
                <SecenekIsareti type={q.type} j={j} />
                <input data-option={j} value={s} maxLength={300} placeholder={t('form.secenek.no', { n: j + 1 })}
                  onChange={o => p.guncelle(x => ({ options: x.options.map((y, k) => (k === j ? o.target.value : y)) }))}
                  onKeyDown={o => p.secenekTus(o, j)} onPaste={o => p.secenekYapistir(o, j)} />
                <button type="button" className="simge-dugme" aria-label={t('form.secenek.sil')} disabled={q.options.length < 2} onClick={() => p.eylem('secenek-sil', j)}>{SIMGE.kapat}</button>
              </li>
            ))}
            <li className="secenek-ekle"><SecenekIsareti type={q.type} j={q.options.length} /><button type="button" onClick={() => p.eylem('secenek-ekle')}>{t('form.secenek.ekle')}</button></li>
          </ol>
        )
        : <><p className="soru-onizleme">{t(`form.onizleme.${q.type}`)}</p><p className="soru-onizleme-not">{t('form.onizleme.not')}</p></>}
      <div className="soru-alt">
        <TasimaAraclari {...p} />
        <span className="soru-araclar">
          <button type="button" className="simge-dugme" aria-label={t('form.soru.cogalt')} onClick={() => p.eylem('cogalt')}>{SIMGE.kopya}</button>
          <button type="button" className="simge-dugme" aria-label={t('form.soru.sil')} disabled={p.silinemez} onClick={() => p.eylem('sil')}>{SIMGE.cop}</button>
          <span className="soru-ayirac" aria-hidden="true" />
          <label className="gf-secenek is-satir"><span>{t('form.soru.zorunlu')}</span>
            <input type="checkbox" role="switch" className="gf-anahtar" data-field="required" checked={!!q.required} onChange={o => p.guncelle({ required: o.target.checked })} /></label>
        </span>
      </div>
      <AraEkle eylem={p.eylem} />
    </article>
  );
}

/* Tek satırlık alanda Enter formu göndermesin. */
const girisiEngelle = o => { if (o.key === 'Enter') o.preventDefault(); };

const TasimaAraclari = ({ index, toplam, eylem }) => (
  <span className="soru-araclar">
    <button type="button" className="simge-dugme" data-act="yukari" aria-label={t('form.tasi.yukari')} disabled={index === 0} onClick={() => eylem('yukari')}>{SIMGE.yukari}</button>
    <button type="button" className="simge-dugme" data-act="asagi" aria-label={t('form.tasi.asagi')} disabled={index === toplam - 1} onClick={() => eylem('asagi')}>{SIMGE.asagi}</button>
  </span>
);

const AraEkle = ({ eylem }) => (
  <div className="soru-fab">
    <button type="button" className="simge-dugme" aria-label={t('form.soru.ekle')} onClick={() => eylem('araya-soru')}>{SIMGE.arti}</button>
    <button type="button" className="simge-dugme" aria-label={t('form.bolum.ekle')} onClick={() => eylem('araya-bolum')}>{SIMGE.bolum}</button>
  </div>
);
