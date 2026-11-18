// "Qué es Rollo" Reel: 22 s at 30 fps over a 120 BPM track, so one beat is exactly 15 frames
// and one 4/4 bar is 60 frames. Every cut, line of text and sound effect lands on these numbers.
// Shared by the composition (src/reel/Reel.tsx) and the audio generator (scripts/reel-audio.mjs).

export const FPS = 30;
export const BPM = 120;
export const BEAT = (FPS * 60) / BPM; // 15
export const BAR = BEAT * 4; // 60
export const BARS = 11;
export const TOTAL = BAR * BARS; // 660

export const bar = (n: number) => (n - 1) * BAR;

/** Section starts, in frames. */
export const AT = {
  hook: bar(1), // blurred grid scrolling: "Sacamos 200 fotos en el viaje."
  stop: bar(2), // the grid stops dead, the music cuts: "Ninguno vio ni una."
  logo: bar(3), // the three circles pop on the beat: "Así funciona Rollo:"
  camera: bar(4), // phone: shutter, blurred caption screen, "Mandar al rollo"
  map: bar(6), // phone: pins popping: "Tus amigos tampoco."
  darkroom: bar(7), // red safelight, the photos develop slowly: "Hasta el revelado."
  hit: bar(9), // flash, every photo in color, the full track comes back
  montage: bar(10), // "Viajes." "Fiestas." "Casamientos." one per beat
  end: bar(11), // logo, line and "Gratis en la App Store"
} as const;

/** The camera scene (src/scenes/CameraScene.tsx) fires its shutter 40 frames in: start it so the shutter lands on a beat. */
export const CAMERA_SHUTTER_LOCAL = 40;
export const CAMERA_START = AT.camera + 3 * BEAT - CAMERA_SHUTTER_LOCAL; // shutter at bar 4, beat 4
export const SHUTTER = CAMERA_START + CAMERA_SHUTTER_LOCAL;
/** "Mandar al rollo" is pressed 90 frames in and the photo flies away from 100. */
export const SEND_PRESS = CAMERA_START + 90;
export const FLY = CAMERA_START + 100;

/** Map pins pop every `step` frames from the start of the map scene (same formula as MapScene). */
export const pinStep = (pins: number) => Math.min(3, 54 / Math.max(1, pins));

/** Montage words, one per beat. */
export const MONTAGE = [
  { word: "Viajes.", at: AT.montage },
  { word: "Fiestas.", at: AT.montage + BEAT },
  { word: "Casamientos.", at: AT.montage + 2 * BEAT },
] as const;
