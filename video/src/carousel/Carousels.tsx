import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { PhotosProvider, usePhotos } from "../data/photos-context.tsx";
import type { PhotoRecord } from "../data/load-photos.ts";
import { REEL_REVEAL } from "../reel/selection.ts";
import { Grain } from "../ui/Grain.tsx";
import { Photo } from "../ui/Photo.tsx";
import { fonts } from "../ui/theme.ts";

// Instagram carousels, 1080×1350 (4:5). One composition per carousel; each frame is one slide,
// rendered with `npm run carousels`. Same look as the Reel: dark background, cobalt only as an accent.

export const SLIDE_W = 1080;
export const SLIDE_H = 1350;
const BG = "#0B0B10";
const TINT = "#5C7CFF";
const MUTED = "rgba(255,255,255,0.72)";
const SAFELIGHT = "rgb(255, 52, 36)";

const Logo = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 120 120">
    <circle cx="60" cy="60" r="34" fill={TINT} fillOpacity={0.22} />
    <circle cx="66" cy="54" r="24" fill={TINT} fillOpacity={0.45} />
    <circle cx="71" cy="49" r="14" fill={TINT} />
  </svg>
);

/** Slide dots and the small wordmark, the same on every slide. */
const Footer = ({ index, count }: { index: number; count: number }) => (
  <div style={{ position: "absolute", left: 80, right: 80, bottom: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <Logo size={52} />
      <span style={{ fontFamily: fonts.sans, fontSize: 34, fontWeight: 700, color: "#fff", letterSpacing: -0.5 }}>Rollo</span>
    </div>
    <div style={{ display: "flex", gap: 12 }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ width: i === index ? 34 : 12, height: 12, borderRadius: 6, backgroundColor: i === index ? "#fff" : "rgba(255,255,255,0.3)" }} />
      ))}
    </div>
  </div>
);

const Title = ({ children, size = 96, style }: { children: ReactNode; size?: number; style?: CSSProperties }) => (
  <div style={{ fontFamily: fonts.sans, fontSize: size, lineHeight: 1.05, fontWeight: 800, letterSpacing: -2, color: "#fff", ...style }}>{children}</div>
);

const Body = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <div style={{ fontFamily: fonts.sans, fontSize: 46, lineHeight: 1.3, fontWeight: 500, color: MUTED, letterSpacing: -0.3, ...style }}>{children}</div>
);

/** A grid of photos, blurred (before the reveal) or sharp (after). */
const PhotoGrid = ({ ids, cols, width, blur, gap = 12, radius = 16, aspect = 4 / 3 }: { ids: string[]; cols: number; width: number; blur: boolean; gap?: number; radius?: number; aspect?: number }) => {
  const cell = (width - gap * (cols - 1)) / cols;
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, ${cell}px)`, gap }}>
      {ids.map((id, i) => (
        <div key={`${id}-${i}`} style={{ width: cell, height: Math.round(cell * aspect), borderRadius: radius, overflow: "hidden" }}>
          <Photo id={id} blur={blur ? 24 : 0} style={blur ? { transform: "scale(1.35)" } : undefined} />
        </div>
      ))}
    </div>
  );
};

/** Full-bleed blurred contact sheet, darkened, as a background. */
const BlurredSheet = ({ dim = 0.55 }: { dim?: number }) => {
  const photos = usePhotos();
  const ids = Array.from({ length: 20 }, (_, i) => photos[(i * 7 + 3) % photos.length]!.id);
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <div style={{ position: "absolute", top: -60, left: 20 }}>
        <PhotoGrid ids={ids} cols={4} width={SLIDE_W - 40} blur />
      </div>
      <AbsoluteFill style={{ backgroundColor: `rgba(0,0,0,${dim})` }} />
    </AbsoluteFill>
  );
};

const Step = ({ n, children }: { n: number; children: ReactNode }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
    <div
      style={{
        width: 84, height: 84, borderRadius: 42, border: `4px solid ${TINT}`, color: TINT, fontFamily: fonts.sans, fontSize: 44,
        fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {n}
    </div>
    {children}
  </div>
);

const Slide = ({ children, background = BG }: { children: ReactNode; background?: string }) => (
  <AbsoluteFill style={{ backgroundColor: background, fontFamily: fonts.sans, overflow: "hidden" }}>{children}</AbsoluteFill>
);

// ── Carousel 1: "Cómo funciona Rollo" ─────────────────────────────────────────────────────────────────
const HOW_COUNT = 5;

const HowSlides = [
  () => (
    <Slide>
      <BlurredSheet />
      <AbsoluteFill style={{ padding: "0 80px", justifyContent: "center", gap: 40 }}>
        <Logo size={150} />
        <Title size={124}>Cómo funciona Rollo</Title>
        <Body style={{ color: "#fff", fontWeight: 600 }}>En 4 pasos →</Body>
      </AbsoluteFill>
      <Footer index={0} count={HOW_COUNT} />
    </Slide>
  ),
  () => (
    <Slide>
      <AbsoluteFill style={{ padding: "0 80px 150px", justifyContent: "center", gap: 40 }}>
        <Step n={1}>
          <Title>Abrí un rollo</Title>
          <Body>Ponele nombre, fechas y cuándo se revela. Invitá a tus amigos con un código.</Body>
        </Step>
        <div style={{ marginTop: 50, alignSelf: "flex-start", padding: "34px 48px", borderRadius: 32, backgroundColor: "#1C1C22", display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ fontSize: 30, fontWeight: 600, color: MUTED, letterSpacing: 2, textTransform: "uppercase" }}>Código del rollo</span>
          <span style={{ fontSize: 96, fontWeight: 800, color: "#fff", letterSpacing: 14, fontVariantNumeric: "tabular-nums" }}>K7M2QX</span>
        </div>
      </AbsoluteFill>
      <Footer index={1} count={HOW_COUNT} />
    </Slide>
  ),
  () => (
    <Slide>
      <AbsoluteFill style={{ padding: "0 80px 150px", justifyContent: "center", gap: 40 }}>
        <Step n={2}>
          <Title>Sacá fotos</Title>
          <Body>Tenés un límite por día, como los cuadros de un rollo. Cada foto cuenta.</Body>
        </Step>
        <div style={{ marginTop: 40, display: "flex", gap: 16 }}>
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} style={{ width: 76, height: 104, borderRadius: 10, backgroundColor: i < 7 ? TINT : "transparent", border: `3px solid ${i < 7 ? TINT : "rgba(255,255,255,0.3)"}`, opacity: i < 7 ? 0.35 + i * 0.09 : 1 }} />
          ))}
        </div>
        <Body style={{ fontSize: 38, color: "#fff", fontWeight: 600 }}>Te quedan 3 fotos hoy</Body>
      </AbsoluteFill>
      <Footer index={2} count={HOW_COUNT} />
    </Slide>
  ),
  () => {
    const photos = usePhotos();
    const ids = REEL_REVEAL.slice(0, 6).map((id) => photos.find((p) => p.id === id)?.id ?? photos[0]!.id);
    return (
      <Slide>
        <AbsoluteFill style={{ padding: "0 80px 150px", justifyContent: "center", gap: 40 }}>
          <Step n={3}>
            <Title>Nadie ve nada</Title>
            <Body>Ni tus amigos ni vos. Solo ven en el mapa dónde sacó cada uno.</Body>
          </Step>
          <div style={{ marginTop: 20 }}>
            <PhotoGrid ids={ids} cols={3} width={SLIDE_W - 160} blur radius={14} aspect={1} />
          </div>
        </AbsoluteFill>
        <Footer index={3} count={HOW_COUNT} />
      </Slide>
    );
  },
  () => (
    <Slide>
      <AbsoluteFill style={{ padding: "0 80px 150px", justifyContent: "center", gap: 40 }}>
        <Step n={4}>
          <Title>El revelado</Title>
          <Body>El día elegido aparecen todas las fotos juntas. Las de todos.</Body>
        </Step>
        <div style={{ marginTop: 20 }}>
          <PhotoGrid ids={REEL_REVEAL.slice(6, 12)} cols={3} width={SLIDE_W - 160} blur={false} radius={14} aspect={1} />
        </div>
        <div style={{ fontSize: 40, fontWeight: 700, color: "#fff" }}>Bajala gratis · <span style={{ color: TINT }}>link en la bio</span></div>
      </AbsoluteFill>
      <Footer index={4} count={HOW_COUNT} />
    </Slide>
  ),
];

// ── Carousel 2: "¿Por qué no puedo ver mis fotos?" ────────────────────────────────────────────────────
const WHY_COUNT = 4;
const Serif = ({ children, size = 84, style }: { children: ReactNode; size?: number; style?: CSSProperties }) => (
  <div style={{ fontFamily: fonts.serif, fontSize: size, lineHeight: 1.18, color: "#fff", letterSpacing: -0.5, ...style }}>{children}</div>
);

const WhySlides = [
  () => (
    <Slide>
      <BlurredSheet dim={0.6} />
      <AbsoluteFill style={{ padding: "0 80px", justifyContent: "center" }}>
        <Serif size={104}>¿Por qué en Rollo no podés ver tus propias fotos?</Serif>
      </AbsoluteFill>
      <Footer index={0} count={WHY_COUNT} />
    </Slide>
  ),
  () => (
    <Slide>
      <AbsoluteFill style={{ padding: "0 80px", justifyContent: "center", gap: 30 }}>
        <Serif>Porque cuando ves la foto, la repetís.</Serif>
        <Serif style={{ color: MUTED }}>Y la repetís.</Serif>
        <Serif>Y te perdés el momento.</Serif>
      </AbsoluteFill>
      <Footer index={1} count={WHY_COUNT} />
    </Slide>
  ),
  () => (
    <Slide background="#1a0303">
      <AbsoluteFill style={{ background: "linear-gradient(180deg, #2a0000, #5a0606)" }} />
      <Grain opacity={0.12} />
      <AbsoluteFill style={{ padding: "0 80px", justifyContent: "center", gap: 30 }}>
        <Serif>Con un rollo sacás y seguís.</Serif>
        <Serif style={{ color: "rgba(255,200,190,0.9)" }}>La foto es la que salió.</Serif>
      </AbsoluteFill>
      <AbsoluteFill style={{ backgroundColor: SAFELIGHT, mixBlendMode: "multiply", opacity: 0.15 }} />
      <Footer index={2} count={WHY_COUNT} />
    </Slide>
  ),
  () => (
    <Slide>
      <AbsoluteFill style={{ padding: "0 80px 150px", justifyContent: "center", gap: 44 }}>
        <Serif size={80}>Y cuando se revela, revivís todo de una, con todos.</Serif>
        <PhotoGrid ids={REEL_REVEAL.slice(0, 6)} cols={3} width={SLIDE_W - 160} blur={false} radius={14} aspect={1} />
        <div style={{ fontSize: 40, fontWeight: 700, color: "#fff", fontFamily: fonts.sans }}>Gratis en la App Store · <span style={{ color: TINT }}>link en la bio</span></div>
      </AbsoluteFill>
      <Footer index={3} count={WHY_COUNT} />
    </Slide>
  ),
];

const carousel = (slides: (() => React.JSX.Element)[]) => ({ photos }: { photos: PhotoRecord[] }) => {
  const frame = useCurrentFrame();
  const Current = slides[Math.min(frame, slides.length - 1)]!;
  return (
    <PhotosProvider photos={photos}>
      <Current />
    </PhotosProvider>
  );
};

export const HowCarousel = carousel(HowSlides);
export const WhyCarousel = carousel(WhySlides);
export const HOW_SLIDES = HowSlides.length;
export const WHY_SLIDES = WhySlides.length;
