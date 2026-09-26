# erasmus → erasmusreact: React'e taşıma görevleri

Amaç: `../erasmus` projesinin AYNISI, arayüzü tamamen React ile.
Sunucu (server.mjs, lib/, routes/, locales/, scripts/, tests/) aynen
kopyalandı; yalnızca statik dosya sunumu `dist/` (React derlemesi) için
değişti. Veritabanı (`data/`) da kopyalandı — iki proje AYRI veri kullanır.

## Kararlar

- **Vite + React 19**, `client/` altında. `npm run build` → `dist/`.
  `npm start` dist'i 3020'de sunar. `npm run dev` → Vite 5173 + API 3020.
- **Adresler aynı**: `takvim.html`, `profil.html?u=…`, `formlar.html#form-3`.
  Sunucu bütün sayfa adreslerine `dist/index.html` verir, React adresin son
  parçasına bakıp sayfayı seçer (`client/src/yonlendirme.js`). NFC etiketleri,
  hatırlatıcı bağlantıları ve `giris.html?geri=` bozulmaz. BASE_PATH (alt
  dizin) önek bilinmeden çalışır: bütün adresler göreli.
- **CSS aynen alındı** (`client/src/styles/`), sınıf adları ve DOM yapısı
  eski sayfalarla aynı tutulur → görünüm birebir. Tek fark: `body > main`
  → `#kok > main` ve `#kok { display: contents }`.
- **CSP değişmedi** (`style-src 'self'`): React `style={{}}` CSSOM ile
  yazdığı için engellenmez; `dangerouslySetInnerHTML` ile style özniteliği
  yazılmaz.
- Açılış verisi (`/api/acilis`) çizimden önce bir kez çekilir; dil/oturum
  değişince sayfa baştan yüklenir (eskisi gibi).
- `onayla()` / `bildir()` aynı imzayla React bileşeni olarak
  (`bilesenler/Kutu.jsx`); kaydedilmemiş değişiklik koruması `<Kutu koru>`.

## Görevler

- [x] Proje iskeleti, bağımlılıklar, vite.config.js, scripts/gelistir.mjs
- [x] server.mjs: dist/ sunumu, sayfa adresleri → index.html, KAPI aynı
- [x] Ortak katman: ortak.js, yonlendirme.js, kancalar.js
- [x] Kabuk: üst bant, menü, telefon menüsü, zil, tema, dil, hesap menüsü,
      parola kutusu, alt bant (ana sayfada logolar)
- [x] Onay kutusu, bildirimler, Kutu (dialog + koruma)
- [x] Ana sayfa (Anasayfa.jsx)
- [x] Giriş (Giris.jsx)
- [x] Panom (Pano.jsx)
- [x] Çıktılar (Ciktilar.jsx)
- [x] Profil kartı (Profil.jsx)
- [x] Kullanıcılar (Kullanicilar.jsx)
- [x] Takvim (Takvim.jsx) — gün ızgarası, zaman çizelgesi, liste, filtreler,
      ayrıntı, ekleme/düzenleme, fotoğraf, faaliyet dosyası, rapor kutusu
- [x] Ekip (Ekip.jsx) — kurum kartları, üye, görev, ilerleme çubuğu
- [x] Formlar (Formlar.jsx) — liste / düzenle / doldur / yanıtlar
- [x] Belgeler (Belge.jsx) — seçim, kâğıt, yazdırma
- [x] Proje klasörleri (Klasorler.jsx) — ağaç, ızgara, arama, yükleme, sürüm
- [x] Testler: yetki.test.mjs (statik dosya yolları), klasor.test.mjs
      (public/klasorler.js kaynağını okuyor) → yeni yapıya uyarlanacak
- [x] Tarayıcıda uçtan uca gözden geçirme (TR/EN, iki tema; telefon genişliği denenmedi)
- [x] README / baslat.bat güncellemesi

## Durum (25 Eylül 2026)

Bütün sayfalar React'e taşındı. `npm test` 101/101. Tarayıcıda denendi:
her sayfa açılıyor, konsol hatası yok; takvim (üç görünüm, ayrıntı,
faaliyet dosyası, form, kaydedilmemiş değişiklik uyarısı), formlar (yeni
form → önizleme → taslak kaydet → düzenle → sil; doldur; yanıt sil),
klasörler (ağaç, ızgara, Geri tuşu, arama), belgeler (4 kâğıt), ekip,
kullanıcılar, çıktılar, profil, ana sayfa; İngilizce ve yeşil tema.
Veritabanı (`data/`) özgün projeden kopyalandı: 4 hesap parola özetleri
dahil birebir aynı.

~~Denenmeyenler: yazdırma önizlemesi, dosya yükleme~~ — 26 Eylül 2026'da
denendi (aşağıya bakın).

## Durum (26 Eylül 2026)

- **Telefon genişliği (390 px) denendi**: 10 sayfanın hiçbiri yana
  taşmıyor. Panom ve Kullanıcılar tablolarındaki taşma düzeltildi
  (`style.css` · `.tablo-kaydir`, `.kullanicilar-kart`). Açık bulgu:
  takvimin gün ızgarası telefonda okunmuyor (bkz. DURUM.md).
- Dört dil açıldı (it, ro, pt, da); profil kartına unvan, diller, LinkedIn,
  WhatsApp/ara/e-posta, rehbere kaydet ve karekod eklendi. `npm test` 102/102.
- **Dosya yükleme denendi** (gerçek veri kopyasıyla geçici sunucuda, 3031):
  sekiz giriş noktasının hepsi çalışıyor — profil fotoğrafı; klasöre çoklu
  yükleme (PDF + DOCX), klasörde yeni sürüm (v2), "Dosya yükle" kutusuyla
  klasör seçerek yükleme; `.exe` "Bu dosya türü kabul edilmiyor." ile
  reddedildi; takvimde faaliyet dosyası (Gündem) ve iki fotoğraf; çıktıya
  dilli sürüm (durum kendiliğinden "Hazırlanıyor"); form kapak görseli ve
  form doldururken dosya sorusu. Her dosya indirilip boyutu karşılaştırıldı.
- **Yazdırma denendi**: belge sayfası headless Chrome ile gerçekten PDF'e
  basıldı (`Page.printToPDF`, CSS sayfa boyutu). Türkçe ve İtalyanca iki
  belge: A4 yatay (841,9 × 595 pt), belge başına tam bir sayfa, arada boş
  sayfa yok; arka plan grafikleri kapalıyken de bozulmuyor.
- Yeni geliştirme bağımlılığı: `qrcode-generator` (MIT, bağımlılıksız;
  derlemeye gömülür).
- Bu klasör hâlâ Git deposu DEĞİL; `../erasmus` Git'te. Sürüm kaydı için
  depo kurulmalı.
