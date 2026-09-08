// preload.cjs — Electron preload script
// Exposes only the IPC methods the renderer needs via contextBridge.
// nodeIntegration is OFF in the renderer; all Electron access goes through window.electronAPI.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /** Save a PDF blob (base64) to the app's userData folder and return the path. */
  savePdfToDisk: (args) => ipcRenderer.invoke('save-pdf-to-disk', args),

  /** Return the sessions folder path (e.g. ~/Library/Application Support/Static Meter/appdata/session-pdfs) */
  getSessionsFolder: () => ipcRenderer.invoke('get-sessions-folder'),

  /** CONN-76: read the OS clipboard (navigator.clipboard is blocked in Electron). */
  readClipboard: () => ipcRenderer.invoke('clipboard-read'),
  // FIX SEC-1: il token che prova al server locale « sono l'app stessa » — v. la nota
  // grande su LOCAL_AUTH_TOKEN in server-core.cjs. Canale IPC puro, mai visto dal tunnel.
  getLocalAuthToken: () => ipcRenderer.invoke('get-local-auth-token'),
  // CORPUS — una riga in aggiunta all'archivio delle esperienze.
  corpusAppend: (args) => ipcRenderer.invoke('corpus-append', args),
  corpusFolder: () => ipcRenderer.invoke('corpus-folder'),
  // PROCEDIMENTI — la lista dei procedimenti trovati in ~/EQUILIBRIUM/COMANDI/Procedimenti,
  // e un modo per aprire (creandola se manca) quella cartella in Finder.
  listProcedimenti: () => ipcRenderer.invoke('procedimenti-list'),
  openProcedimentiFolder: () => ipcRenderer.invoke('procedimenti-folder-open'),
  // CHIUSURA — il processo principale ferma l'uscita e chiede; il renderer risponde.
  setSessionActive: (attiva) => ipcRenderer.invoke('session-active', attiva),
  confirmClose: () => ipcRenderer.invoke('close-confirmed'),
  onCloseRequest: (cb) => {
    const h = () => cb();
    ipcRenderer.on('app-close-request', h);
    return () => ipcRenderer.removeListener('app-close-request', h);
  },

  /** FIX MUSE-RECONNECT: annulla una ricerca Bluetooth pendente nel main (callback appesa). */
  bleCancel: () => ipcRenderer.invoke('ble-cancel'),

  // CONN-71: native macOS speech-to-text (SFSpeechRecognizer sidecar).
  stt: {
    /** Start the native recognizer for a BCP-47 locale (e.g. 'fr-FR'). */
    start: (locale) => ipcRenderer.invoke('stt-start', locale),
    /** Stop the native recognizer. */
    stop:  () => ipcRenderer.invoke('stt-stop'),
    /** Subscribe to recognizer events ({type:'partial'|'final'|'status', …}). Returns an unsubscribe fn. */
    onData: (cb) => {
      const handler = (_e, payload) => cb(payload);
      ipcRenderer.on('stt-data', handler);
      return () => ipcRenderer.removeListener('stt-data', handler);
    },
  },


  /**
   * Subscribe to SM window-move events.
   * Returns an unsubscribe function.
   */
  onWindowMoved: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('window-moved', handler);
    return () => ipcRenderer.removeListener('window-moved', handler);
  },

  /**
   * Subscribe to SM window-resize events.
   * Returns an unsubscribe function.
   */
  onWindowResized: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('window-resized', handler);
    return () => ipcRenderer.removeListener('window-resized', handler);
  },
});
