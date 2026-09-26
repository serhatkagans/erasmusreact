import { createRoot } from 'react-dom/client';
import './styles/style.css';
import './styles/form.css';
import './styles/belge.css';
import './styles/klasorler.css';
import { durum, iste } from './ortak.js';
import { temaOku, temaUygula } from './bilesenler/Kabuk.jsx';
import Uygulama from './Uygulama.jsx';

/* Tema çizimden önce: sayfa önce öbür temayla boyanıp sonra değişmesin. */
temaUygula(temaOku());

/* Açılış verisi (sözlük, künye, listeler, oturum) tek istekte ve çizimden
   ÖNCE: her bileşen `t()` ile sözlüğü doğrudan okuyabilsin. */
const veri = await iste('api/acilis');
Object.assign(durum, veri);
document.documentElement.lang = durum.dil;

createRoot(document.getElementById('kok')).render(<Uygulama />);
