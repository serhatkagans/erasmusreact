import { useEffect, useRef } from 'react';
import { KARA, KARA_ADIM } from './kara.js';

/* Tanıtım sayfasının girişindeki dünya: kıtaları noktalarla çizilmiş, kendi
   ekseninde dönen bir küre. Ortakların şehirleri parlayan ignelerle
   işaretlenir, koordinatörden her birine bir yay çıkar. Sürüklenerek
   çevrilebilir; hareket azaltma tercihinde Avrupa'ya dönük durur.

   Çizim tuvalde yapılır (her karede ~3000 nokta izdüşürülür); SVG'de bu kadar
   düğümü her kare güncellemek ağır kaçardı. */

/* Ortak şehirlerin enlem/boylamı. Künyede koordinat yok; yeni bir şehir
   eklenirse buraya da yazılmalı, yazılmazsa iğnesi çizilmez. */
const SEHIR = {
  Ankara: [39.93, 32.86],
  'Çankaya': [39.9, 32.86],
  Lecce: [40.35, 18.17],
  Corbeanca: [44.6, 26.03],
  Philipsburg: [18.03, -63.05],
  Braga: [41.55, -8.42],
  Copenhagen: [55.68, 12.57],
};

const EGIM = 24 * Math.PI / 180;       // küreyi biraz yukarıdan görürüz
const HIZ = 7 * Math.PI / 180 / 1000;  // radyan/ms: 7°/sn, bir tur ~51 sn
const RAD = Math.PI / 180;

const birim = (enlem, boylam) => {
  const e = enlem * RAD, b = boylam * RAD;
  return [Math.cos(e) * Math.sin(b), Math.sin(e), Math.cos(e) * Math.cos(b)];
};

/* Kara hücrelerini birim vektörlere çevirir. Kutuplara doğru boylam
   çemberleri daraldığından sütunlar seyreltilir, noktalar eşit dağılır. */
function karaNoktalari() {
  const bitler = Uint8Array.from(atob(KARA), c => c.charCodeAt(0));
  const sutun = 360 / KARA_ADIM, satir = 180 / KARA_ADIM, noktalar = [];
  for (let r = 0; r < satir; r++) {
    const enlem = 90 - (r + .5) * KARA_ADIM;
    const atla = Math.max(1, Math.round(1 / Math.cos(enlem * RAD)));
    for (let c = 0; c < sutun; c += atla) {
      const k = r * sutun + c;
      if (bitler[k >> 3] >> (k & 7) & 1) noktalar.push(birim(enlem, -180 + (c + .5) * KARA_ADIM));
    }
  }
  return noktalar;
}

/* İki nokta arasındaki büyük çember yayı, ortası yüzeyden kalkık. */
function yay(a, b, adim = 48) {
  const aci = Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const sin = Math.sin(aci), yukseklik = .06 + aci * .22, noktalar = [];
  for (let i = 0; i <= adim; i++) {
    const t = i / adim, ka = Math.sin((1 - t) * aci) / sin, kb = Math.sin(t * aci) / sin;
    const h = 1 + yukseklik * Math.sin(Math.PI * t);
    noktalar.push([0, 1, 2].map(j => (a[j] * ka + b[j] * kb) * h));
  }
  return noktalar;
}

export default function Kure({ ortaklar }) {
  const tuval = useRef(null);

  useEffect(() => {
    const el = tuval.current;
    const ctx = el.getContext('2d');
    const kara = karaNoktalari();
    const yazi = getComputedStyle(document.body).fontFamily;

    /* Aynı noktaya düşen ortaklar (Ankara ve Çankaya gibi) tek iğne olur. */
    const igneler = [];
    for (const o of ortaklar) {
      const k = SEHIR[o.city];
      if (!k) continue;
      const v = birim(...k);
      const ayni = igneler.find(p => Math.hypot(p.v[0] - v[0], p.v[1] - v[1], p.v[2] - v[2]) < .02);
      if (ayni) { ayni.merkez ||= !!o.coordinator; continue; }
      igneler.push({ v, ad: o.city === 'Çankaya' ? 'Ankara' : o.city, merkez: !!o.coordinator });
    }
    const merkez = igneler.find(p => p.merkez) ?? igneler[0];
    const yaylar = merkez ? igneler.filter(p => p !== merkez).map((p, i) => ({ n: yay(merkez.v, p.v), gecik: i * .37 })) : [];

    const azalt = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let boylam = -12 * RAD, egim = EGIM, olcek = 1, boyut = 0, kare = 0, onceki = 0, gorunur = true;
    let surukle = null;

    const boyutla = () => {
      const r = el.getBoundingClientRect();
      olcek = Math.min(window.devicePixelRatio || 1, 2);
      boyut = r.width;
      el.width = Math.round(r.width * olcek);
      el.height = Math.round(r.height * olcek);
    };

    /* Dünya koordinatındaki vektörü ekran düzlemine çevirir: önce boylamca
       döndür, sonra eğ. z > 0 olan yarım küre bize bakar. */
    const izdus = ([x, y, z]) => {
      const c = Math.cos(boylam), s = Math.sin(boylam);
      const x1 = x * c - z * s, z1 = x * s + z * c;
      const ce = Math.cos(egim), se = Math.sin(egim);
      return [x1, y * ce - z1 * se, y * se + z1 * ce];
    };

    const ciz = an => {
      const W = el.width, H = el.height;
      const cx = W / 2, cy = H / 2, R = W * .36, p = olcek * boyut / 460;
      ctx.clearRect(0, 0, W, H);

      // Atmosfer halesi
      let g = ctx.createRadialGradient(cx, cy, R * .9, cx, cy, R * 1.32);
      g.addColorStop(0, 'rgba(70,170,118,.38)');
      g.addColorStop(.35, 'rgba(16,132,194,.16)');
      g.addColorStop(1, 'rgba(16,132,194,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.32, 0, Math.PI * 2); ctx.fill();

      // Okyanus
      g = ctx.createRadialGradient(cx - R * .38, cy - R * .42, R * .05, cx, cy, R);
      g.addColorStop(0, '#2aa5dc');
      g.addColorStop(.45, '#0f6fa8');
      g.addColorStop(1, '#0a2747');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

      // Enlem/boylam ağı
      ctx.lineWidth = p;
      ctx.strokeStyle = 'rgba(255,255,255,.09)';
      ctx.beginPath();
      for (let b = -180; b < 180; b += 30) cizgi(e => birim(e, b), -90, 90);
      for (let e = -60; e <= 60; e += 30) cizgi(b => birim(e, b), -180, 180);
      ctx.stroke();
      function cizgi(nokta, bas, son) {
        let acik = false;
        for (let t = bas; t <= son; t += 4) {
          const [x, y, z] = izdus(nokta(t));
          if (z < 0) { acik = false; continue; }
          acik ? ctx.lineTo(cx + x * R, cy - y * R) : ctx.moveTo(cx + x * R, cy - y * R);
          acik = true;
        }
      }

      // Kara: kenara yaklaştıkça küçülen, solan noktalar
      for (const v of kara) {
        const [x, y, z] = izdus(v);
        if (z <= 0) continue;
        ctx.globalAlpha = .25 + .75 * z;
        ctx.fillStyle = z > .55 ? '#b9e27f' : '#8cc152';
        const r = (1.05 + .75 * z) * p;
        ctx.fillRect(cx + x * R - r, cy - y * R - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;

      // Işık ve gölge: sol üstten parıltı, sağ alttan gece
      g = ctx.createRadialGradient(cx - R * .45, cy - R * .5, 0, cx - R * .45, cy - R * .5, R * 1.1);
      g.addColorStop(0, 'rgba(255,255,255,.28)');
      g.addColorStop(.5, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      g = ctx.createRadialGradient(cx - R * .3, cy - R * .35, R * .6, cx - R * .1, cy - R * .1, R * 1.25);
      g.addColorStop(0, 'rgba(6,18,36,0)');
      g.addColorStop(1, 'rgba(6,18,36,.55)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.28)';
      ctx.lineWidth = 1.2 * p;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();

      // Yaylar: arkada kalan kısım çizilmez; üstünden bir ışık akar
      const sn = an / 1000;
      ctx.lineCap = 'round';
      for (const y of yaylar) {
        const ekran = y.n.map(v => {
          const [x, yy, z] = izdus(v);
          return [cx + x * R, cy - yy * R, z > 0 || Math.hypot(x, yy) > 1];
        });
        ctx.strokeStyle = 'rgba(255,255,255,.55)';
        ctx.lineWidth = 1.4 * p;
        ctx.beginPath();
        let acik = false;
        for (const [x, yy, gor] of ekran) {
          if (!gor) { acik = false; continue; }
          acik ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy);
          acik = true;
        }
        ctx.stroke();
        if (azalt) continue;
        const t = ((sn * .45 + y.gecik) % 1.4);
        if (t > 1) continue;
        const i = Math.round(t * (ekran.length - 1)), [x, yy, gor] = ekran[i];
        if (!gor) continue;
        g = ctx.createRadialGradient(x, yy, 0, x, yy, 7 * p);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(.35, 'rgba(185,226,127,.85)');
        g.addColorStop(1, 'rgba(185,226,127,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, yy, 7 * p, 0, Math.PI * 2); ctx.fill();
      }

      // İğneler ve şehir adları
      ctx.font = `700 ${12 * p}px ${yazi}`;
      ctx.textBaseline = 'middle';
      const sirali = igneler.map((i, n) => ({ ...i, n, e: izdus(i.v) })).filter(i => i.e[2] > 0).sort((a, b) => a.e[2] - b.e[2]);
      for (const { e: [x0, y0, z], ad, merkez: m, n } of sirali) {
        const x = cx + x0 * R, y = cy - y0 * R, a = Math.min(1, z * 2.5);
        ctx.globalAlpha = a;
        if (!azalt) {
          const t = (sn * .8 + n * .29) % 1;
          ctx.strokeStyle = `rgba(185,226,127,${(1 - t) * .9})`;
          ctx.lineWidth = 2 * p;
          ctx.beginPath(); ctx.arc(x, y, (5 + t * 14) * p, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.fillStyle = m ? '#ffffff' : '#b9e27f';
        ctx.strokeStyle = m ? '#46aa76' : '#0a2747';
        ctx.lineWidth = 2 * p;
        ctx.beginPath(); ctx.arc(x, y, (m ? 5.5 : 4.2) * p, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }

      /* Şehir adları: önce koordinatör, sonra öne yakın olanlar yer seçer.
         Her etiket iğnenin dört köşesinden boş olanına konur; hiçbiri boş
         değilse o karede yazılmaz (Avrupa'da şehirler birbirine çok yakın). */
      const kutular = [];
      const etiketler = sirali.filter(i => i.e[2] > .3).sort((a, b) => b.merkez - a.merkez || b.e[2] - a.e[2]);
      for (const { e: [x0, y0, z], ad } of etiketler) {
        const x = cx + x0 * R, y = cy - y0 * R;
        const w = ctx.measureText(ad).width + 14 * p, h = 20 * p, d = 8 * p;
        const yer = [[x + d, y - d - h], [x - d - w, y - d - h], [x + d, y + d], [x - d - w, y + d]]
          .find(([lx, ly]) => !kutular.some(k => lx < k[0] + k[2] && lx + w > k[0] && ly < k[1] + k[3] && ly + h > k[1]));
        if (!yer) continue;
        const [lx, ly] = yer;
        kutular.push([lx, ly, w, h]);
        ctx.globalAlpha = Math.min(1, (z - .3) * 4);
        ctx.fillStyle = 'rgba(10,29,53,.8)';
        ctx.beginPath(); ctx.roundRect(lx, ly, w, h, h / 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillText(ad, lx + 7 * p, ly + h / 2 + .5 * p);
      }
      ctx.globalAlpha = 1;
    };

    const dongu = an => {
      if (!surukle && !azalt) boylam -= HIZ * Math.min(an - (onceki || an), 64);
      onceki = an;
      ciz(an);
      kare = gorunur ? requestAnimationFrame(dongu) : 0;
    };

    const gozlem = new ResizeObserver(() => { boyutla(); ciz(performance.now()); });
    gozlem.observe(el);
    boyutla();
    if (azalt) ciz(0);

    /* Ekran dışındayken çizmeyi bırak. */
    const ekranda = new IntersectionObserver(([g]) => {
      gorunur = g.isIntersecting;
      if (gorunur && !azalt && !kare) { onceki = 0; kare = requestAnimationFrame(dongu); }
    });
    ekranda.observe(el);

    const bas = e => { surukle = { x: e.clientX, y: e.clientY, b: boylam, e: egim }; el.setPointerCapture(e.pointerId); };
    const tasi = e => {
      if (!surukle) return;
      const k = Math.PI / boyut;
      boylam = surukle.b - (e.clientX - surukle.x) * k;
      egim = Math.max(-.6, Math.min(1.1, surukle.e + (e.clientY - surukle.y) * k));
      if (azalt) ciz(0);
    };
    const birak = () => { surukle = null; };
    el.addEventListener('pointerdown', bas);
    el.addEventListener('pointermove', tasi);
    el.addEventListener('pointerup', birak);
    el.addEventListener('pointercancel', birak);

    return () => {
      cancelAnimationFrame(kare);
      gozlem.disconnect();
      ekranda.disconnect();
      el.removeEventListener('pointerdown', bas);
      el.removeEventListener('pointermove', tasi);
      el.removeEventListener('pointerup', birak);
      el.removeEventListener('pointercancel', birak);
    };
  }, [ortaklar]);

  return (
    <div className="tn-gezegen" aria-hidden="true">
      <div className="tn-yorunge"><span /></div>
      <canvas ref={tuval} className="tn-kure" />
      <span className="tn-logo-rozet"><img src="logo.png" alt="" width="124" height="124" /></span>
    </div>
  );
}
