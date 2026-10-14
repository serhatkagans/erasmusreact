import { useState, useEffect } from 'react';
import { durum, t, ortakAdi, ortakKisa, etkinlikBaslik, tamTarih, tarihAraligi, bugun, gunFarki } from '../ortak.js';
import { useVeri } from '../kancalar.js';
import { useBaslik } from '../bilesenler/Kabuk.jsx';

/**
 * Panom: girişten sonra açılan kişisel çalışma ekranı (GET /api/pano).
 * Kurumun yaklaşan işleri, geciken görevler, yanıt bekleyen formlar, eksik
 * faaliyet dosyaları, sorumlu olunan çıktılar ve son eklenen dosyalar.
 * Koordinatör üstte kurumlar arası genel durumu da görür.
 */

/** Bir pano kutusu: başlık, sayı, satırlar; boşsa olumlu bir cümle. */
function PanoKutu({ baslik, satirlar, bos, tumu, tumuMetin, vurgu = false, id }) {
  return (
    <section id={id} className={`pano-kutu${vurgu && satirlar.length ? ' pano-kutu-vurgu' : ''}`}>
      <div className="pano-kutu-bas">
        <h2>{t(baslik)}</h2>
        <span className="pano-sayi">{String(satirlar.length)}</span>
      </div>
      {!satirlar.length
        ? <p className="pano-bos">{t(bos)}</p>
        : <ul className="pano-liste">{satirlar.map((s, i) => <Satir key={i} {...s} />)}</ul>}
      {tumu && <a className="metin-bag pano-tumu" href={tumu}>{`${t(tumuMetin)} →`}</a>}
    </section>
  );
}

function Satir({ href, baslik, alt, rozet, rozetSinif = '' }) {
  return (
    <li>
      <a className="pano-satir" href={href}>
        <span className="pano-satir-govde">
          <strong>{baslik}</strong>
          {alt && <span className="pano-satir-alt">{alt}</span>}
        </span>
        {rozet && <span className={`pano-rozet ${rozetSinif}`}>{rozet}</span>}
      </a>
    </li>
  );
}

const kalanMetni = gun => {
  const n = gunFarki(bugun(), gun);
  return n < 0 ? t('pano.gecikti', { n: -n }) : n === 0 ? t('pano.bugun') : t('pano.kalan', { n });
};

/* Her sayı (sıfır da) kaynağına götürür; üzerine gelince nereden
   geldiği yazar. Durumu bekleyen ve eksik dosya aşağıdaki kutulara iner:
   orada kurum adıyla tek tek listelenir. */
function Hucre({ n, href, sutun, uyari = false, metin = String(n) }) {
  return (
    <td className={uyari && n ? 'pano-uyari' : ''}>
      <a className="pano-tablo-bag" href={href} data-ipucu={t(`pano.g.${sutun}.kaynak`)}>{metin}</a>
    </td>
  );
}

/* Sütun başlığı ve sayı üzerine gelince (klavyede odakta, dokunmatikte
   başlığa dokununca) kaynağını anlatan ipucu. Tablo yatay kaydırılan bir
   kutuda olduğu için ipucu sabit konumla tablonun dışına çizilir; yoksa
   kutunun kenarında kesilirdi. */
function useIpucu() {
  const [ipucu, setIpucu] = useState(null);
  const goster = o => {
    const h = o.target.closest?.('[data-ipucu]');
    if (!h) return;
    const r = h.getBoundingClientRect();
    const x = Math.min(Math.max(r.left + r.width / 2, 150), innerWidth - 150);
    setIpucu({ metin: h.dataset.ipucu, x, y: r.bottom + 8 });
  };
  const gizle = o => { if (o.target.closest?.('[data-ipucu]')) setIpucu(null); };
  useEffect(() => {
    if (!ipucu) return;
    const kapat = () => setIpucu(null);
    addEventListener('scroll', kapat, true);
    return () => removeEventListener('scroll', kapat, true);
  }, [ipucu]);
  const olaylar = { onMouseOver: goster, onMouseOut: gizle, onFocus: goster, onBlur: gizle, onClick: goster };
  const kutu = ipucu && <div className="pano-ipucu" role="tooltip" style={{ left: ipucu.x, top: ipucu.y }}>{ipucu.metin}</div>;
  return [olaylar, kutu];
}

function Genel({ genel }) {
  const [ipucuOlaylari, ipucuKutusu] = useIpucu();
  return (
    <section id="pano-genel" className="pano-kutu pano-genel">
      <div className="pano-kutu-bas"><h2>{t('pano.genel')}</h2></div>
      <p className="pano-bos">{t('pano.genelNot')}</p>
      <div className="tablo-kaydir">
        <table className="pano-tablo" {...ipucuOlaylari}>
          <thead>
            <tr>
              {['pano.g.kurum', 'pano.g.acikGorev', 'pano.g.geciken', 'pano.g.bekleyenYanit', 'pano.g.durum', 'pano.g.eksikFaaliyet', 'pano.g.cikti']
                .map(a => (a === 'pano.g.kurum'
                  ? <th key={a} scope="col">{t(a)}</th>
                  : <th key={a} scope="col"><span className="pano-ipucu-bas" tabIndex={0} data-ipucu={t(`${a}.kaynak`)}>{t(a)}</span></th>))}
            </tr>
          </thead>
          <tbody>
            {genel.map(g => (
              <tr key={g.partner}>
                <th scope="row" title={ortakAdi(g.partner)}>{ortakKisa(g.partner)}</th>
                <Hucre n={g.acikGorev} href="ekip.html" sutun="acikGorev" />
                <Hucre n={g.gecikenGorev} href="ekip.html" sutun="geciken" uyari />
                <Hucre n={g.bekleyenYanit} href="formlar.html" sutun="bekleyenYanit" uyari />
                <Hucre n={g.durumBekleyen} href="#pano-durum" sutun="durum" uyari />
                <Hucre n={g.eksikFaaliyet} href="#pano-eksik" sutun="eksikFaaliyet" uyari />
                <Hucre n={g.ciktiToplam} href="ciktilar.html" sutun="cikti" metin={g.ciktiToplam ? `${g.ciktiTeslim}/${g.ciktiToplam}` : '—'} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ipucuKutusu}
    </section>
  );
}

export default function Pano() {
  useBaslik('pano.baslik');
  const k = durum.kullanici;
  const { veri: p } = useVeri('api/pano');

  let kutular = null;
  if (p) {
    const genelMi = !!p.genel;
    const durumlar = p.durumGuncelle.map(x => (x.tur === 'etkinlik'
      ? { href: `takvim.html#etkinlik-${x.id}`, baslik: etkinlikBaslik(x),
        alt: `${t('pano.durum.bitti', { tarih: tamTarih(x.bitis) })}${genelMi ? ' · ' + ortakKisa(x.lider) : ''}`,
        rozet: t(`durum.${x.durum}`), rozetSinif: 'pano-rozet-amber' }
      : { href: `ciktilar.html#${x.slug}`, baslik: t(`${x.anahtar}.baslik`),
        alt: `${t('pano.durum.teslim', { tarih: tamTarih(x.teslim) })}${genelMi && x.sorumlu ? ' · ' + ortakKisa(x.sorumlu) : ''}`,
        rozet: t(`cikti.durum.${x.durum}`), rozetSinif: 'pano-rozet-amber' }));

    const gecikenler = p.geciken.map(g => ({ href: 'ekip.html', baslik: g.baslik,
      alt: `${genelMi ? ortakKisa(g.partner) + ' · ' : ''}${tamTarih(g.son_tarih)}`, rozet: kalanMetni(g.son_tarih), rozetSinif: 'pano-rozet-kirmizi' }));

    const formlar = p.bekleyenForm.map(f => ({ href: `formlar.html#form-${f.id}`, baslik: f.baslik,
      alt: f.sonTarih ? tamTarih(f.sonTarih) : t('pano.sonTarihYok'), rozet: f.sonTarih ? kalanMetni(f.sonTarih) : '', rozetSinif: 'pano-rozet-amber' }));

    const yaklasan = [
      ...p.yaklasan.map(e => ({ gun: e.baslangic, s: { href: `takvim.html#etkinlik-${e.id}`, baslik: etkinlikBaslik(e),
        alt: `${tarihAraligi(e.baslangic, e.bitis)} · ${t(e.rol === 'lider' ? 'pano.rol.lider' : 'pano.rol.katilimci')}`,
        rozet: e.baslangic <= bugun() ? t('pano.suruyor') : kalanMetni(e.baslangic) } })),
      ...p.yaklasanGorev.map(g => ({ gun: g.son_tarih, s: { href: 'ekip.html', baslik: g.baslik,
        alt: `${t('pano.gorev')} · %${g.ilerleme}`, rozet: kalanMetni(g.son_tarih) } })),
    ].sort((a, b) => a.gun.localeCompare(b.gun)).map(x => x.s);

    const eksik = p.eksikDosya.map(e => ({ href: `takvim.html#etkinlik-${e.id}`, baslik: etkinlikBaslik(e),
      alt: e.dosya.eksik.map(x => t(`faaliyet.parca.${x}`)).join(', '),
      rozet: t('faaliyet.rozet', { n: e.dosya.tamam, toplam: e.dosya.toplam }), rozetSinif: 'pano-rozet-amber' }));

    const ciktilar = p.ciktilar.map(c => ({ href: `ciktilar.html#${c.slug}`, baslik: t(`${c.anahtar}.baslik`),
      alt: c.teslim ? tamTarih(c.teslim) : t('cikti.teslimYok'), rozet: t(`cikti.durum.${c.durum}`) }));

    const dosyalar = p.dosyalar.map(d => ({ href: `klasorler.html#${d.klasor}`, baslik: d.ad,
      alt: `${d.klasor} · ${tamTarih(d.updated.slice(0, 10))}${d.yukleyen ? ' · ' + d.yukleyen : ''}` }));

    kutular = (
      <>
        {/* En üstte: ilerleme çubukları elle ilerlediği için unutulanlar. */}
        <PanoKutu baslik="pano.durum" satirlar={durumlar} bos="pano.durum.bos" vurgu id="pano-durum" />
        <PanoKutu baslik="pano.geciken" satirlar={gecikenler} bos="pano.geciken.bos" tumu="ekip.html" tumuMetin="pano.tumGorevler" vurgu />
        <PanoKutu baslik="pano.formlar" satirlar={formlar} bos="pano.formlar.bos" tumu="formlar.html" tumuMetin="pano.tumFormlar" vurgu />
        <PanoKutu baslik="pano.yaklasan" satirlar={yaklasan} bos="pano.yaklasan.bos" tumu="takvim.html" tumuMetin="pano.takvim" />
        <PanoKutu baslik="pano.eksikDosya" satirlar={eksik} bos="pano.eksikDosya.bos" vurgu id="pano-eksik" />
        <PanoKutu baslik="pano.ciktilar" satirlar={ciktilar} bos="pano.ciktilar.bos" tumu="ciktilar.html" tumuMetin="pano.tumCiktilar" />
        <PanoKutu baslik="pano.dosyalar" satirlar={dosyalar} bos="pano.dosyalar.bos" tumu="klasorler.html" tumuMetin="pano.klasorler" />
      </>
    );
  }

  return (
    <main id="icerik">
      <section className="kapsayici sayfa-bas">
        <span className="ustbaslik" id="pano-ust">{`${ortakAdi(k.partner)}${k.koordinator ? ` · ${t('kullanicilar.yetki.tam')}` : ''}`}</span>
        <h1 id="pano-merhaba">{t('pano.merhaba', { ad: (k.ad || k.kullanici).split(/\s+/)[0] })}</h1>
        <p>{t('pano.giris')}</p>
      </section>
      <div className="kapsayici">
        {p?.genel && <Genel genel={p.genel} />}
        <div id="pano-izgara" className="pano-izgara">{kutular}</div>
      </div>
    </main>
  );
}
