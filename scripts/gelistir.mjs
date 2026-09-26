import { spawn } from 'node:child_process';

/**
 * Geliştirme: API sunucusu (3020) ve Vite (5173) birlikte açılır.
 * Tarayıcıda http://localhost:5173 kullanılır; değişiklikler anında görünür.
 * Biri kapanınca öbürü de kapatılır.
 */
const surecler = [
  spawn(process.execPath, ['--env-file-if-exists=.env', '--watch-path=lib', '--watch-path=routes', 'server.mjs'], { stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' }),
];
const kapat = () => { for (const s of surecler) s.kill(); process.exit(0); };
for (const s of surecler) s.on('exit', kapat);
process.on('SIGINT', kapat);
process.on('SIGTERM', kapat);
