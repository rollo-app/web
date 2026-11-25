// The join link's preview image (1200×630): the rollo's cover with "Te invitaron a", its name and the dates on a dark fade,
// like the app's Stories invitation card. Drawn with satori (layout → SVG) and resvg (SVG → pixels), sent as JPEG:
// a PNG over a photo weighs ~900 KB and WhatsApp drops previews heavier than ~300 KB.
import { Resvg } from "@resvg/resvg-js";
import { encode } from "jpeg-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import satori from "satori";
import { SITE_URL } from "./join-html";
import {
  API_URL,
  caption,
  fetchPreview as defaultFetchPreview,
  fetchWithTimeout,
  normalizeCode,
  type Preview,
} from "./preview";

export const WIDTH = 1200;
export const HEIGHT = 630;
export const IMAGE_CACHE_LONG = "public, max-age=31536000, immutable";
const JPEG_QUALITY = 82;
export const IMAGE_CACHE_SHORT = "public, max-age=60, s-maxage=60";

const COBALT = "#3155F5";
/** Without a cover: the Stories card's cobalt gradient. */
const EMPTY_BACKGROUND = "linear-gradient(135deg, #3155F5, #0b1a5c)";
const MARGIN = 72;
const TEXT_WIDTH = 860;

// Bundled with the function through `includeFiles` in vercel.json; read once per instance.
const FONT_DIR = join(process.cwd(), "node_modules", "@fontsource", "inter", "files");
let fonts: { name: string; data: Buffer; weight: 400 | 700; style: "normal" }[] | undefined;
const loadFonts = () =>
  (fonts ??= ([400, 700] as const).map((weight) => ({
    name: "Inter",
    data: readFileSync(join(FONT_DIR, `inter-latin-${weight}-normal.woff`)),
    weight,
    style: "normal" as const,
  })));

/** The site logo's three circles (scripts/build-og.mjs), as an image satori can draw. */
const logo = (color: string) =>
  `data:image/svg+xml;base64,${Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="26 26 68 68" fill="${color}"><circle cx="60" cy="60" r="34" fill-opacity="0.18"/><circle cx="66" cy="54" r="24" fill-opacity="0.38"/><circle cx="71" cy="49" r="14"/></svg>`,
  ).toString("base64")}`;

type Node = { type: string; props: Record<string, unknown> & { style?: Record<string, unknown> } };
const el = (type: string, style: Record<string, unknown>, children?: unknown, props: Record<string, unknown> = {}): Node => ({
  type,
  props: { ...props, style, children },
});

/** The satori tree for the card; `cover` is a data URI or null. */
export function cardTree(p: Preview, cover: string | null): Node {
  const fill = { position: "absolute", top: 0, left: 0, width: WIDTH, height: HEIGHT };
  const secondary = { fontSize: 30, fontWeight: 400, opacity: 0.85 };
  return el(
    "div",
    { display: "flex", width: WIDTH, height: HEIGHT, position: "relative", color: "#fff", fontFamily: "Inter", backgroundColor: "#1c1c1e", backgroundImage: cover ? undefined : EMPTY_BACKGROUND },
    [
      cover ? el("img", { ...fill, objectFit: "cover" }, undefined, { src: cover, width: WIDTH, height: HEIGHT }) : null,
      cover
        ? el("div", { ...fill, display: "flex", backgroundImage: "linear-gradient(90deg, rgba(0,0,0,0.72), rgba(0,0,0,0.35) 55%, rgba(0,0,0,0) 80%)" })
        : null,
      cover ? el("div", { ...fill, display: "flex", backgroundImage: "linear-gradient(0deg, rgba(0,0,0,0.4), rgba(0,0,0,0) 60%)" }) : null,
      el("div", { position: "absolute", left: MARGIN, top: 60, display: "flex", alignItems: "center" }, [
        el("img", { width: 48, height: 48, marginRight: 14 }, undefined, { src: logo(cover ? COBALT : "#fff"), width: 48, height: 48 }),
        el("div", { fontSize: 30, fontWeight: 700 }, "Rollo Project"),
      ]),
      el("div", { position: "absolute", left: MARGIN, bottom: 64, width: TEXT_WIDTH, display: "flex", flexDirection: "column" }, [
        el("div", secondary, "Te invitaron a"),
        el("div", { display: "block", fontSize: 68, fontWeight: 700, lineHeight: 1.08, marginTop: 8, marginBottom: 16, lineClamp: 2 }, p.name),
        el("div", secondary, caption(p)),
      ]),
    ].filter(Boolean),
  );
}

/** The card as a JPEG. */
export async function renderCard(p: Preview, cover: string | null): Promise<Uint8Array> {
  const svg = await satori(cardTree(p, cover) as Parameters<typeof satori>[0], { width: WIDTH, height: HEIGHT, fonts: loadFonts() });
  const image = new Resvg(svg, { fitTo: { mode: "width", value: WIDTH } }).render();
  return new Uint8Array(encode({ data: image.pixels, width: image.width, height: image.height }, JPEG_QUALITY).data);
}

type FetchOptions = { fetch?: typeof fetch; timeoutMs?: number };

/** The cover (a checked `/covers/...` path) as a data URI; null if it fails or isn't an image. */
export async function fetchCover(path: string, opts: FetchOptions = {}): Promise<string | null> {
  const res = await fetchWithTimeout(`${API_URL}${path}`, opts);
  const type = res?.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  if (!res || !/^image\/(png|jpeg|webp|gif)$/.test(type)) return null;
  try {
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

type OgDeps = {
  fetchPreview?: (code: string) => Promise<Preview | null>;
  fetchCover?: (path: string) => Promise<string | null>;
};

/** GET /api/og/join/<CODE>: the card, or a redirect to the site's fixed image when there is no rollo to draw. */
export async function handleOg(request: Request, { fetchPreview = defaultFetchPreview, fetchCover: getCover = fetchCover }: OgDeps = {}): Promise<Response> {
  const code = normalizeCode(new URL(request.url).pathname.split("/").filter(Boolean).pop());
  const preview = code ? await fetchPreview(code) : null;
  if (!preview) {
    return new Response(null, { status: 302, headers: { location: `${SITE_URL}/og.png`, "cache-control": IMAGE_CACHE_SHORT } });
  }
  const cover = preview.coverUrl ? await getCover(preview.coverUrl) : null;
  // A cover that failed to load is a degraded card: don't let caches keep it.
  const degraded = preview.coverUrl !== null && cover === null;
  const jpeg = await renderCard(preview, cover);
  return new Response(jpeg, {
    status: 200,
    headers: { "content-type": "image/jpeg", "cache-control": degraded ? IMAGE_CACHE_SHORT : IMAGE_CACHE_LONG },
  });
}
