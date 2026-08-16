/// <reference types="vite/client" />

// CONN-113: injected at build time from package.json (see vite.config.ts).
declare const __APP_VERSION__: string;
/** SERENITY ha la SUA numerazione (parte da 3.0.0): due applicazioni separate dallo stesso
 *  deposito, e un numero solo farebbe avanzare l'una quando si tocca l'altra. */
declare const __SERENITY_VERSION__: string;

// ── WebHID ──────────────────────────────────────────────────────────────────────────────────
// L'API non è nella libreria standard di TypeScript. Si dichiara QUI il minimo indispensabile
// invece di aggiungere una dipendenza di soli tipi (@types/w3c-web-hid) per quattro simboli.
// Serve al Theta-Meter, l'e-meter USB — vedi lib/thetaMeterHid.ts.
interface HIDInputReportEvent extends Event {
  readonly data: DataView;
  readonly reportId: number;
  readonly device: HIDDevice;
}

interface HIDDevice extends EventTarget {
  readonly opened: boolean;
  readonly vendorId: number;
  readonly productId: number;
  readonly productName: string;
  open(): Promise<void>;
  close(): Promise<void>;
  sendReport(reportId: number, data: BufferSource): Promise<void>;
  addEventListener(type: 'inputreport', listener: (e: HIDInputReportEvent) => void): void;
  removeEventListener(type: 'inputreport', listener: (e: HIDInputReportEvent) => void): void;
}

interface HIDDeviceFilter { vendorId?: number; productId?: number; usagePage?: number; usage?: number }

interface HID extends EventTarget {
  getDevices(): Promise<HIDDevice[]>;
  requestDevice(options: { filters: HIDDeviceFilter[] }): Promise<HIDDevice[]>;
}

interface Navigator { readonly hid: HID }
