import { useEffect } from 'react';
import sablon from './drive/drive.html?raw';
import { baslat } from './drive/drive.js';
import '../styles/drive.css';

/**
 * Drive — GençTek takviminin Drive'ı (Google Drive düzeni), birebir aynı
 * yapıyla: aynı işaretleme (drive/drive.html), aynı betik (drive/drive.js,
 * drive/office.js), aynı sunucu uçları (routes/drive.mjs, lib/drive.mjs).
 *
 * Ekran React ile yeniden yazılmadı: Drive kendi durumunu, seçimini,
 * sürükle-bırakını ve pencerelerini doğrudan DOM üzerinde yönetir ve
 * görünümü adres çubuğundaki `#` ile seçer (`#klasor/12`, `#cop`, `#ara?q=`).
 * Bu bileşen yalnızca şablonu bir kez çizer, betiği başlatır ve sayfadan
 * çıkınca betiğin dinleyicilerini kaldırır. Şablon sabit bir dizge olduğu
 * için React onu yeniden çizmez; adres çubuğundaki `#` değişse de içerik
 * yerinde kalır.
 */
export default function Drive() {
  useEffect(() => {
    document.body.classList.add('is-drive');
    /* Drive pencere yüksekliğini doldurur (Google Drive gibi); üst bandın
       yüksekliği menünün satır sayısıyla değiştiği için ölçülür. */
    const ust = document.querySelector('header.ust');
    const olc = () => document.body.style.setProperty('--ust-yukseklik', `${ust ? ust.offsetHeight : 0}px`);
    olc();
    const gozcu = ust ? new ResizeObserver(olc) : null;
    gozcu?.observe(ust);
    const bitir = baslat();
    return () => {
      bitir();
      gozcu?.disconnect();
      document.body.classList.remove('is-drive');
      document.body.style.removeProperty('--ust-yukseklik');
    };
  }, []);

  return <div className="gd-kok" dangerouslySetInnerHTML={{ __html: sablon }} />;
}
