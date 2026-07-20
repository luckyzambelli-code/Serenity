/**
 * CONN-109 (#4): boost remote WebRTC audio above the element's native max (1.0).
 * An <audio>/<video> element caps at volume 1.0, which the testers found too
 * quiet for a remote auditing session. We route the stream's audio through a
 * WebAudio GainNode (gain > 1) and mute the element so the sound is not doubled.
 *
 * Returns a cleanup function. Safe to call with a stream that has no audio track
 * (it no-ops) and falls back to the element's own audio if WebAudio fails.
 */
export function attachAudioBoost(
  el: HTMLMediaElement,
  stream: MediaStream | null,
  gain = 4.0,
): () => void {
  if (!stream || stream.getAudioTracks().length === 0) return () => {};

  let ctx: AudioContext | null = null;
  let src: MediaStreamAudioSourceNode | null = null;
  let g: GainNode | null = null;
  let muted = false;

  try {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    src = ctx.createMediaStreamSource(stream);
    g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(ctx.destination);
    // Only mute the element once WebAudio is actually wired, so we never end up
    // with NO audio if the context creation throws.
    el.muted = true;
    muted = true;
    // Autoplay policy: resume (we are always called from a user-gesture-driven
    // connection flow, so this succeeds).
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch {
    // WebAudio unavailable → leave the element audible at native volume.
    if (muted) { try { el.muted = false; } catch {} }
    try { ctx?.close(); } catch {}
    return () => {};
  }

  return () => {
    try { src?.disconnect(); } catch {}
    try { g?.disconnect(); } catch {}
    try { ctx?.close(); } catch {}
    try { el.muted = false; } catch {}
  };
}
