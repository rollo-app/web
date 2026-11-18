import type { ReactNode } from "react";
import { AbsoluteFill, Audio, Easing, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { PhotosProvider, usePhotos } from "../data/photos-context.tsx";
import type { PhotoRecord } from "../data/load-photos.ts";
import { CameraScene } from "../scenes/CameraScene.tsx";
import { MapScene } from "../scenes/MapScene.tsx";
import { Grain } from "../ui/Grain.tsx";
import { Photo } from "../ui/Photo.tsx";
import { fonts } from "../ui/theme.ts";
import { AT, BAR, BEAT, CAMERA_START, MONTAGE, SHUTTER, TOTAL } from "./beats.ts";
import { REEL_CAMERA, REEL_MONTAGE, REEL_REVEAL } from "./selection.ts";

const W = 1080;
const H = 1920;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const EXIT = Easing.bezier(0.23, 1, 0.32, 1);
const BG = "#0B0B10";
const TINT = "#5C7CFF";
const SAFELIGHT = "rgb(255, 52, 36)";

/** Text that pops in on its frame (and leaves on `until`, if given). */
const Line = ({ at, until, children, size = 86, style }: { at: number; until?: number; children: ReactNode; size?: number; style?: React.CSSProperties }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < at || (until !== undefined && frame >= until)) return null;
  const pop = spring({ frame: frame - at, fps, config: { damping: 18, stiffness: 260 }, durationInFrames: 10 });
  return (
    <div
      style={{
        fontFamily: fonts.sans, fontSize: size, lineHeight: 1.08, fontWeight: 800, letterSpacing: -1.5, color: "#fff",
        textAlign: "center", textShadow: "0 4px 24px rgba(0,0,0,0.55)", opacity: Math.min(1, pop * 1.4),
        transform: `translateY(${(1 - pop) * 24}px) scale(${0.94 + 0.06 * pop})`, ...style,
      }}
    >
      {children}
    </div>
  );
};

/** Upper text band, clear of the Reels/TikTok buttons. */
const TopBand = ({ children }: { children: ReactNode }) => (
  <div style={{ position: "absolute", top: 230, left: 70, right: 70, display: "flex", flexDirection: "column", justifyContent: "flex-start", gap: 6 }}>
    {children}
  </div>
);

const Centered = ({ children, top = 0 }: { children: ReactNode; top?: number }) => (
  <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: "0 80px", top }}>{children}</AbsoluteFill>
);

/** "Revelado" logo: three circles that concentrate toward the top right. `pops` are the frames each circle appears. */
const Logo = ({ size, pops }: { size: number; pops?: [number, number, number] }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const circles = [
    { cx: 60, cy: 60, r: 34, o: 0.22 },
    { cx: 66, cy: 54, r: 24, o: 0.45 },
    { cx: 71, cy: 49, r: 14, o: 1 },
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 120 120">
      {circles.map((c, i) => {
        const p = pops ? spring({ frame: frame - pops[i]!, fps, config: { damping: 11, stiffness: 220 } }) : 1;
        if (pops && frame < pops[i]!) return null;
        return <circle key={i} cx={c.cx} cy={c.cy} r={c.r * p} fill={TINT} fillOpacity={c.o} />;
      })}
    </svg>
  );
};

// ── Bars 1–2: the blurred contact sheet ────────────────────────────────────────────────────────────
const COLS = 4;
const GAP = 12;
const SIDE = 24;
const CELL_W = (W - SIDE * 2 - GAP * (COLS - 1)) / COLS;
const CELL_H = Math.round((CELL_W * 4) / 3);

const Hook = () => {
  const frame = useCurrentFrame();
  const photos = usePhotos();
  // Constant scroll, then dead stop on the downbeat of bar 2 (4-frame brake).
  const scroll = frame < AT.stop - 4 ? frame * 14 : (AT.stop - 4) * 14 + interpolate(frame, [AT.stop - 4, AT.stop], [0, 28], { ...clamp, easing: EXIT });
  const rows = 12;
  const cells = Array.from({ length: rows * COLS }, (_, i) => photos[(i * 7) % photos.length]!.id);
  const stopped = frame >= AT.stop;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <div
        style={{
          position: "absolute", top: 120 - scroll, left: SIDE, display: "grid", gridTemplateColumns: `repeat(${COLS}, ${CELL_W}px)`, gap: GAP,
        }}
      >
        {cells.map((id, i) => (
          <div key={i} style={{ width: CELL_W, height: CELL_H, borderRadius: 14, overflow: "hidden" }}>
            <Photo id={id} blur={26} style={{ transform: "scale(1.35)" }} />
          </div>
        ))}
      </div>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, rgba(0,0,0,0.55), rgba(0,0,0,0.25) 70%)", opacity: stopped ? 1 : 0.8 }} />
      <Centered>
        {/* Starts already on screen: the first frame is the thumbnail and the hook. */}
        <Line at={-12} until={AT.stop} size={96}>Sacamos 200 fotos en el viaje.</Line>
        <Line at={AT.stop} size={96}>Ninguno vio ni una.</Line>
      </Centered>
    </AbsoluteFill>
  );
};

// ── Bar 3: logo ────────────────────────────────────────────────────────────────────────────────────
const LogoBeat = () => (
  <AbsoluteFill style={{ backgroundColor: BG, alignItems: "center", justifyContent: "center" }}>
    <div style={{ marginTop: -140 }}>
      <Logo size={560} pops={[AT.logo, AT.logo + BEAT, AT.logo + 2 * BEAT]} />
    </div>
    <div style={{ position: "absolute", top: 1240, left: 80, right: 80 }}>
      <Line at={AT.logo + 2 * BEAT} size={80}>Así funciona Rollo:</Line>
    </div>
  </AbsoluteFill>
);

// ── Bars 4–6: the app inside a phone ───────────────────────────────────────────────────────────────
const PHONE_SCALE = 1.1;
const PHONE_W = 540 * PHONE_SCALE;
const PHONE_H = 1170 * PHONE_SCALE;
const PHONE_TOP = 540;

const Phone = ({ children }: { children: ReactNode }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = spring({ frame: frame - AT.camera, fps, config: { damping: 200 }, durationInFrames: 14 });
  return (
    <div
      style={{
        position: "absolute", top: PHONE_TOP, left: (W - PHONE_W) / 2 - 14, width: PHONE_W, height: PHONE_H, borderRadius: 78,
        border: "14px solid #1E1E24", overflow: "hidden", boxShadow: `0 40px 120px rgba(0,0,0,0.6), 0 0 0 2px #2c2c34`,
        transform: `translateY(${(1 - rise) * 260}px)`, opacity: rise, backgroundColor: "#000",
      }}
    >
      <div style={{ width: 540, height: 1170, transform: `scale(${PHONE_SCALE})`, transformOrigin: "0 0", position: "relative" }}>{children}</div>
    </div>
  );
};

const AppBeat = () => (
  <AbsoluteFill style={{ backgroundColor: BG }}>
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 70%, rgba(92,124,255,0.22), transparent 60%)` }} />
    <Phone>
      <Sequence from={CAMERA_START} durationInFrames={AT.map - CAMERA_START} layout="none">
        <AbsoluteFill><CameraScene photoId={REEL_CAMERA} /></AbsoluteFill>
      </Sequence>
      <Sequence from={AT.map} durationInFrames={BAR} layout="none">
        <AbsoluteFill><MapScene /></AbsoluteFill>
      </Sequence>
    </Phone>
    <TopBand>
      <Line at={AT.camera + BEAT} until={AT.map}>Sacás la foto.</Line>
      <Line at={SHUTTER + BEAT} until={AT.map}>No la ves.</Line>
      <Line at={SHUTTER + 2 * BEAT} until={AT.map} style={{ color: TINT }}>Ni vos.</Line>
      <Line at={AT.map}>Tus amigos tampoco.</Line>
      <Line at={AT.map + 2 * BEAT} size={48} style={{ fontWeight: 600, color: "rgba(255,255,255,0.75)", letterSpacing: 0 }}>
        Solo ven dónde sacó cada uno.
      </Line>
    </TopBand>
  </AbsoluteFill>
);

// ── Bars 7–9: darkroom, then the hit ───────────────────────────────────────────────────────────────
const R_COLS = 3;
const R_GAP = 14;
const R_SIDE = 40;
const R_W = (W - R_SIDE * 2 - R_GAP * (R_COLS - 1)) / R_COLS;
const R_H = Math.round((R_W * 4) / 3);
const R_ROWS = REEL_REVEAL.length / R_COLS;
const R_TOP = (H - (R_H * R_ROWS + R_GAP * (R_ROWS - 1))) / 2 + 60;

const RevealCell = ({ id, index }: { id: string; index: number }) => {
  const frame = useCurrentFrame();
  // Latent until bar 8, then each frame develops a little (sepia, still soft); the hit snaps it to full color.
  const latent = interpolate(frame, [AT.darkroom + BAR + index * 3, AT.hit - 4], [0, 0.45], clamp);
  const snap = interpolate(frame, [AT.hit, AT.hit + 6], [0, 1], { ...clamp, easing: EXIT });
  const e = latent + (1 - latent) * snap;
  const filter = `blur(${34 * (1 - e)}px) sepia(${1 - e}) saturate(${0.3 + 0.7 * e}) brightness(${0.55 + 0.45 * e})`;
  return (
    <div style={{ position: "relative", width: R_W, height: R_H, borderRadius: 14, overflow: "hidden", backgroundColor: "#3a0a08" }}>
      <Photo id={id} style={{ filter, transform: `scale(${1 + 0.35 * (1 - e)})` }} />
      <div style={{ position: "absolute", inset: 0, backgroundColor: SAFELIGHT, mixBlendMode: "multiply", opacity: 0.85 * (1 - snap) }} />
    </div>
  );
};

const RevealBeat = () => {
  const frame = useCurrentFrame();
  const darkroom = 1 - interpolate(frame, [AT.hit, AT.hit + 10], [0, 1], clamp);
  const flash = interpolate(frame, [AT.hit, AT.hit + 2, AT.hit + 16], [0, 0.95, 0], { ...clamp, easing: EXIT });
  const gridIn = interpolate(frame, [AT.darkroom + BEAT, AT.darkroom + 2 * BEAT], [0, 1], clamp);
  const push = interpolate(frame, [AT.hit, AT.montage], [1, 1.06], clamp);
  const breathe = 0.85 + 0.15 * Math.sin((frame - AT.darkroom) / 6);
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, #2a0000, #5a0606)", opacity: darkroom * breathe }} />
      <div
        style={{
          position: "absolute", top: R_TOP, left: R_SIDE, display: "grid", gridTemplateColumns: `repeat(${R_COLS}, ${R_W}px)`, gap: R_GAP,
          opacity: gridIn, transform: `scale(${push})`,
        }}
      >
        {REEL_REVEAL.map((id, i) => <RevealCell key={id} id={id} index={i} />)}
      </div>
      <Grain opacity={0.12 * darkroom} />
      <div style={{ opacity: darkroom }}>
        <TopBand>
          <Line at={AT.darkroom + BEAT} until={AT.hit}>Hasta el revelado.</Line>
        </TopBand>
      </div>
      <AbsoluteFill style={{ backgroundColor: "#fff", opacity: flash }} />
    </AbsoluteFill>
  );
};

// ── Bar 10: one photo and one word per beat ────────────────────────────────────────────────────────
/** Portrait photos fill the frame; a landscape one sits whole across the middle over a blurred copy of itself. */
const MontagePhoto = ({ id, zoom }: { id: string; zoom: number }) => {
  const photos = usePhotos();
  const record = photos.find((p) => p.id === id)!;
  const upright = { w: record.width, h: record.height }; // already the displayed size
  if (upright.h >= upright.w) {
    return (
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        <Photo id={id} />
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: "scale(1.2)" }}>
        <Photo id={id} blur={40} />
      </AbsoluteFill>
      <AbsoluteFill style={{ backgroundColor: "rgba(0,0,0,0.3)" }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: W, height: (W * upright.h) / upright.w, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
          <div style={{ width: "100%", height: "100%", transform: `scale(${zoom})` }}>
            <Photo id={id} />
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Montage = () => {
  const frame = useCurrentFrame();
  const current = [...MONTAGE].reverse().find((m) => frame >= m.at) ?? MONTAGE[0];
  const index = MONTAGE.indexOf(current);
  const local = frame - current.at;
  const zoom = 1.08 - 0.06 * Math.min(1, local / (BEAT * 2));
  const record = usePhotos().find((p) => p.id === REEL_MONTAGE[index])!;
  const landscape = record.width > record.height;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <MontagePhoto id={REEL_MONTAGE[index]!} zoom={zoom} />
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.15), rgba(0,0,0,0.55))" }} />
      {/* Over a landscape photo the word goes below it, not across the faces. */}
      <Centered top={landscape ? 560 : 0}>
        <Line key={current.word} at={current.at} size={128}>{current.word}</Line>
      </Centered>
    </AbsoluteFill>
  );
};

// ── Bar 11: end card ───────────────────────────────────────────────────────────────────────────────
const EndCard = () => {
  const frame = useCurrentFrame();
  const fade = interpolate(frame, [AT.end, AT.end + 8], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ backgroundColor: BG, opacity: fade, alignItems: "center" }}>
      <div style={{ position: "absolute", top: 380 }}>
        <Logo size={300} />
      </div>
      <div style={{ position: "absolute", top: 720, left: 80, right: 80, display: "flex", flexDirection: "column", gap: 28 }}>
        <Line at={AT.end} size={140} style={{ letterSpacing: -4 }}>Rollo</Line>
        <Line at={AT.end + BEAT} size={58} style={{ fontWeight: 600, letterSpacing: -0.5, color: "rgba(255,255,255,0.85)" }}>
          Como un rollo de fotos,<br />pero con tus amigos.
        </Line>
      </div>
      <div style={{ position: "absolute", top: 1180, display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
        <Line at={AT.end + 2 * BEAT} size={40} style={{ fontWeight: 600, color: "rgba(255,255,255,0.7)", letterSpacing: 0 }}>
          Gratis en la App Store
        </Line>
        {frame >= AT.end + 2 * BEAT && <Img src={staticFile("reel/app-store-badge.svg")} style={{ height: 96 }} />}
      </div>
    </AbsoluteFill>
  );
};

export const REEL_FRAMES = TOTAL;

/** Renders its children only inside [from, to). Frames stay absolute (unlike <Sequence>), so the beat constants apply as-is. */
const Show = ({ from, to, children }: { from: number; to: number; children: ReactNode }) => {
  const frame = useCurrentFrame();
  return frame >= from && frame < to ? <>{children}</> : null;
};

export const Reel = ({ photos }: { photos: PhotoRecord[] }) => (
  <PhotosProvider photos={photos}>
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Show from={0} to={AT.logo}><Hook /></Show>
      <Show from={AT.logo} to={AT.camera}><LogoBeat /></Show>
      <Show from={AT.camera} to={AT.darkroom}><AppBeat /></Show>
      <Show from={AT.darkroom} to={AT.montage}><RevealBeat /></Show>
      <Show from={AT.montage} to={AT.end}><Montage /></Show>
      <Show from={AT.end} to={TOTAL}><EndCard /></Show>
      <Audio src={staticFile("reel/music.wav")} />
    </AbsoluteFill>
  </PhotosProvider>
);
