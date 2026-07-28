import { useEffect } from 'react';
import { networkManager } from '../lib/networkManager';
import { useNetworkStore } from '../store/networkStore';

/**
 * useMediaRelayFallback — MEDIA DI RIPIEGO sul relay WebSocket (CONN-33 / CONN-39).
 *
 * Quando WebRTC non riesce a stabilire il media (5G, NAT simmetrico, niente TURN), video e
 * audio passano dallo STESSO canale WS che porta l'EEG: fotogrammi JPEG e PCM16 a 16 kHz.
 * Funziona ovunque e senza account, che era il vincolo posto dall'utente.
 *
 * Estratto da App.tsx TALE E QUALE: due effetti che dipendono SOLO da `videoFallbackActive`
 * e `isConnected` (entrambi dal networkStore) e dal singleton `networkManager`. Nessun
 * legame con il resto dello stato dell'applicazione — per questo era il primo blocco da
 * staccare. Nessun parametro: legge da sé quel che gli serve.
 */
export function useMediaRelayFallback(): void {
  const videoFallbackActive = useNetworkStore(s => s.videoFallbackActive);
  const isConnected = useNetworkStore(s => s.isConnected);

  // ── CONN-33: WebSocket video fallback — capture & send local camera frames ──
  // Active only when WebRTC media failed (onVideoFallbackNeeded set the flag).
  // Each side captures its own camera, downscales to 320×240, encodes JPEG at
  // low quality, and sends ~6 fps over the relay WS (same channel as EEG —
  // works on any network, no TURN). The peer renders the frames as an <img>.
  useEffect(() => {
    if (!videoFallbackActive || !isConnected) return;
    const stream = (networkManager as unknown as { localStream: MediaStream | null }).localStream;
    if (!stream || stream.getVideoTracks().length === 0) return;

    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    // FIX CONN-37: ATTACH the capture <video> to the DOM. A detached or
    // display:none video is NOT rendered by mobile Chrome (power saving), so
    // drawImage() pulls empty frames → the participant (Galaxy) sent nothing
    // and the auditor saw black while the reverse worked (desktop renders
    // detached videos fine). We append it 1×1, near-invisible but still
    // "displayed" so the browser keeps producing frames.
    video.style.cssText = 'position:fixed;width:2px;height:2px;opacity:0.01;pointer-events:none;left:0;bottom:0;z-index:-1;';
    document.body.appendChild(video);
    video.play().catch(() => {});
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');

    const id = setInterval(() => {
      if (!ctx || video.readyState < 2 || video.videoWidth === 0) return;
      // Cover-fit the source frame into the 320×240 canvas.
      const sAR = video.videoWidth / video.videoHeight;
      const dAR = canvas.width / canvas.height;
      let sw = video.videoWidth, sh = video.videoHeight, sx = 0, sy = 0;
      if (sAR > dAR) { sw = video.videoHeight * dAR; sx = (video.videoWidth - sw) / 2; }
      else           { sh = video.videoWidth / dAR; sy = (video.videoHeight - sh) / 2; }
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      try {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.4);
        networkManager.sendVideoFrame(dataUrl);
      } catch (_) { /* canvas not ready */ }
    }, 160); // ~6 fps

    return () => {
      clearInterval(id);
      video.srcObject = null;
      try { video.remove(); } catch (_) {}
    };
  }, [videoFallbackActive, isConnected]);

  // ── CONN-39: WebSocket AUDIO fallback — capture & send local mic audio ──
  // WebRTC carries audio normally, but the JPEG-frame relay does NOT. So when
  // we fall back to the relay (5G/NAT) the auditor would see the preclear but
  // hear nothing. Here we tap the local stream's audio track, downsample to
  // 16 kHz mono PCM16, and ship ~12 chunks/s over the same WS channel as the
  // video frames and EEG. The peer plays it via the onAudioChunk handler above.
  useEffect(() => {
    if (!videoFallbackActive || !isConnected) return;
    const stream = (networkManager as unknown as { localStream: MediaStream | null }).localStream;
    if (!stream || stream.getAudioTracks().length === 0) return;

    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const source = ctx.createMediaStreamSource(stream);
    // FIX CONN-44: 2048 frames ≈ 43 ms at 48 kHz (was 4096 ≈ 85 ms) to halve
    // the capture buffering latency → ~23 packets/s, still cheap bandwidth.
    const node = ctx.createScriptProcessor(2048, 1, 1);
    const TARGET_SR = 16000;
    const ratio = ctx.sampleRate / TARGET_SR;

    node.onaudioprocess = (e) => {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const input = e.inputBuffer.getChannelData(0);
      const outLen = Math.floor(input.length / ratio);
      // Downsample (linear pick) + convert Float32 → Int16 little-endian bytes.
      const bytes = new Uint8Array(outLen * 2);
      for (let i = 0; i < outLen; i++) {
        const s = Math.max(-1, Math.min(1, input[Math.floor(i * ratio)]));
        const v = s < 0 ? s * 0x8000 : s * 0x7fff;
        const iv = v | 0;
        bytes[i * 2] = iv & 0xff;
        bytes[i * 2 + 1] = (iv >> 8) & 0xff;
      }
      // Bytes → base64 (chunked to avoid call-stack limits on big arrays).
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) {
        bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
      }
      networkManager.sendAudioChunk(btoa(bin), TARGET_SR);
    };

    source.connect(node);
    // Must connect to destination for onaudioprocess to fire; route through a
    // muted gain so we don't echo our own mic locally.
    const mute = ctx.createGain();
    mute.gain.value = 0;
    node.connect(mute);
    mute.connect(ctx.destination);

    return () => {
      try { node.disconnect(); } catch (_) {}
      try { source.disconnect(); } catch (_) {}
      try { mute.disconnect(); } catch (_) {}
      ctx.close().catch(() => {});
    };
  }, [videoFallbackActive, isConnected]);
}
