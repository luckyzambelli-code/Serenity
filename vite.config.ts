import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// CONN-115: expose the package.json version to the app (shown next to the title).
// MUST read package.json from disk (NOT process.env.npm_package_version): in
// `dist:mac` the bump script rewrites package.json, but the child `npm run build`
// INHERITS npm_package_version from the parent process at its PRE-bump value, so
// the in-app version lagged one behind the DMG. Reading the file is always correct.
const PKG = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'));
const APP_VERSION = PKG.version;
// ⚠️ SERENITY HA LA SUA NUMERAZIONE, e parte da 3.0.0. Non è un capriccio: sono due
// applicazioni separate che escono dallo stesso deposito, e una versione sola vorrebbe dire
// che un ritocco all'una fa avanzare il numero dell'altra senza che nulla sia cambiato.
const SERENITY_VERSION = PKG.serenityVersion;

export default defineConfig({
  base: './', // Forza Vite a usare percorsi relativi (fondamentale per Electron)
  plugins: [
    react(), 
    tailwindcss(),
  ],
  // ⚠️ TOLTO `process.env.GEMINI_API_KEY` — segnalato nella revisione completa del codice:
  // `@google/genai` (che l'avrebbe usata) non è importato da NESSUNA parte di `src/`, quindi
  // questa riga era una trappola dormiente, non una funzione viva. `define` di Vite scrive il
  // valore IN CHIARO dentro il bundle spedito a ogni utente — il giorno in cui qualcuno avesse
  // impostato una vera `GEMINI_API_KEY` prima di una build pensando fosse lato server, quella
  // chiave sarebbe finita leggibile nel JS di ogni DMG distribuito. Se un giorno servirà
  // davvero un modello Gemini, la chiave va tenuta nel processo Electron (`main.cjs`/
  // `api-routes.cjs`) dietro una rotta locale — mai definita qui.
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __SERENITY_VERSION__: JSON.stringify(SERENITY_VERSION),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // In Electron renderer, process.release.name === 'node', so @xenova/transformers
      // picks onnxruntime-node (native module). Vite can't bundle native modules, so
      // InferenceSession is undefined → "Cannot read properties of undefined (reading 'create')".
      // Redirecting to onnxruntime-web forces the WASM backend in the renderer.
      'onnxruntime-node': 'onnxruntime-web',
    },
  },
  server: {
    // 0.0.0.0 : le dev server écoute sur le LAN → on peut tester le TÉLÉPHONE (satellite) contre lui.
    host: '0.0.0.0',
    port: 3000,
    // PAS de `hmr.host` codé en dur : Vite déduit alors l'hôte de la PAGE. Donc le HMR marche
    // partout — en local ET depuis le téléphone — sur n'importe quel réseau. (Une IP fixe cassait
    // le HMR sur un autre réseau ; mettre 'localhost' aurait cassé le test depuis le téléphone.)
  },
  optimizeDeps: {
    exclude: ['@xenova/transformers'],
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    rollupOptions: {
      // DUE PAGINE, un solo deposito e un solo motore: `index.html` è EQUILIBRIUM,
      // `serenity.html` è SERENITY. Quel che condividono — engine, session, lib — Vite lo
      // mette da sé in un pezzo comune, e quindi nel pacchetto è LO STESSO CODICE, non una
      // copia che un giorno potrà divergere.
      input: {
        index: path.resolve(__dirname, 'index.html'),
        serenity: path.resolve(__dirname, 'serenity.html'),
      },
    },
  },
});