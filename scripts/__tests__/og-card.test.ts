/// <reference types="node" />
import { Resvg } from "@resvg/resvg-js";
import { decode } from "jpeg-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cardSvg, cardText, fetchCover, handleOg, IMAGE_CACHE_LONG, IMAGE_CACHE_SHORT, renderCard } from "../../api/_lib/og-card";
import { PreviewUnavailable } from "../../api/_lib/preview";
import { samplePreview } from "./helpers/preview";

/** A small portrait PNG standing in for a cover (two colors, so the framing shows), as the API would send it. */
const coverPng = () =>
  new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="90" height="120"><rect width="90" height="60" fill="#c4795a"/><rect y="60" width="90" height="60" fill="#2b2a3a"/></svg>`)
    .render()
    .asPng();
const coverDataUri = () => `data:image/png;base64,${Buffer.from(coverPng()).toString("base64")}`;

/** Width and height of a JPEG (and that it is one). */
function jpegSize(jpeg: Uint8Array) {
  expect([jpeg[0], jpeg[1]]).toEqual([0xff, 0xd8]);
  const { width, height } = decode(jpeg);
  return { width, height };
}
/** A real photo as the cover, to check the weight. */
const photoDataUri = () => `data:image/jpeg;base64,${readFileSync(join(__dirname, "..", "site", "reveal.jpg")).toString("base64")}`;

describe("renderCard", () => {
  it("stays light enough for WhatsApp (under 300 KB) with a photo", async () => {
    expect((await renderCard(samplePreview(), photoDataUri())).byteLength).toBeLessThan(300_000);
  });
  it("draws a 1200×630 JPEG over the cover", async () => {
    expect(jpegSize(await renderCard(samplePreview(), coverDataUri()))).toEqual({ width: 1200, height: 630 });
  });
  it("draws the cobalt card without a cover", async () => {
    expect(jpegSize(await renderCard(samplePreview({ coverUrl: null }), null))).toEqual({ width: 1200, height: 630 });
  });
  it("copes with a very long name, emoji and symbols", async () => {
    const png = await renderCard(samplePreview({ name: `${"Casamiento de Ana & Fede 🎉 ".repeat(5)}` }), null);
    expect(jpegSize(png)).toEqual({ width: 1200, height: 630 });
  });
});

describe("cardText", () => {
  it("drops emoji the card's font can't draw, so no empty boxes show", () => {
    expect(cardText("Casamiento 💍 Ana & Leo 👨‍👩‍👧 🇺🇾 ❤️")).toBe("Casamiento Ana & Leo");
  });
  it("keeps accents and Latin letters beyond Spanish", () => {
    expect(cardText("Cumpleaños de Łukasz en Ñuñoa")).toBe("Cumpleaños de Łukasz en Ñuñoa");
  });
});

/** Mean luminance (0..255) of a rectangle of a JPEG. */
function meanLuminance(jpeg: Uint8Array, x0: number, y0: number, x1: number, y1: number) {
  const { data, width } = decode(jpeg);
  let sum = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      sum += 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
    }
  }
  return sum / ((x1 - x0) * (y1 - y0));
}

describe("renderCard edge cases", () => {
  it("darkens behind the brand so it reads over a light cover", async () => {
    const white = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="90" height="120"><rect width="90" height="120" fill="#fafafa"/></svg>`)
      .render()
      .asPng();
    const jpeg = await renderCard(samplePreview(), `data:image/png;base64,${Buffer.from(white).toString("base64")}`);
    // The brand row (logo + "Rollo Project") sits around x 72..330, y 56..116.
    expect(meanLuminance(jpeg, 60, 50, 340, 122)).toBeLessThan(80);
  });
  it("frames the cover by coverFocusY (top vs bottom differ; null is the middle)", async () => {
    const svg = (coverFocusY: number | null) => cardSvg(samplePreview({ coverFocusY }), coverDataUri());
    expect(await svg(0)).not.toBe(await svg(1));
    expect(await svg(null)).toBe(await svg(0.5));
  });
  it("draws Latin letters beyond Spanish (Ł) instead of the missing-glyph box", async () => {
    // A character no bundled font has (中) draws satori's "no glyph" box; Ł must not draw the same thing.
    const svg = (name: string) => cardSvg(samplePreview({ name, startsAt: null, endsAt: null, memberCount: null }), null);
    expect(await svg("ŁŁŁ")).not.toBe(await svg("中中中"));
  });
  it("draws without a caption (the production API's shorter answer)", async () => {
    const png = await renderCard(samplePreview({ startsAt: null, endsAt: null, memberCount: null }), null);
    expect(jpegSize(png)).toEqual({ width: 1200, height: 630 });
  });
  it("draws a very long name without spaces", async () => {
    expect(jpegSize(await renderCard(samplePreview({ name: "A".repeat(120) }), null))).toEqual({ width: 1200, height: 630 });
  });
});

describe("fetchCover", () => {
  it("returns the cover as a data URI", async () => {
    const fetch = vi.fn(async () => new Response(coverPng(), { headers: { "content-type": "image/png" } }));
    const uri = await fetchCover("/covers/t1/c.png", { fetch });
    expect(fetch).toHaveBeenCalledWith("https://api.rolloproject.com/covers/t1/c.png", expect.anything());
    expect(uri).toMatch(/^data:image\/png;base64,/);
  });
  it("returns null for something that isn't an image", async () => {
    const fetch = vi.fn(async () => new Response("<html>", { headers: { "content-type": "text/html" } }));
    expect(await fetchCover("/covers/t1/c.png", { fetch })).toBeNull();
  });
  it.each([404, 500])("returns null on HTTP %i", async (status) => {
    expect(await fetchCover("/covers/t1/c.png", { fetch: vi.fn(async () => new Response("", { status })) })).toBeNull();
  });
  it("returns null when the request fails", async () => {
    expect(await fetchCover("/covers/t1/c.png", { fetch: vi.fn(async () => Promise.reject(new Error("down"))) })).toBeNull();
  });
});

describe("handleOg", () => {
  const request = (code: string) => new Request(`https://rolloproject.com/api/og/join/${code}?v=abc`);

  it("serves the card with a long cache", async () => {
    const fetchPreview = vi.fn(async () => samplePreview());
    const res = await handleOg(request("abc123"), { fetchPreview, fetchCover: async () => coverDataUri() });
    expect(fetchPreview).toHaveBeenCalledWith("ABC123");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toBe(IMAGE_CACHE_LONG);
    expect(jpegSize(new Uint8Array(await res.arrayBuffer()))).toEqual({ width: 1200, height: 630 });
  });

  it("caches briefly when the cover could not be fetched", async () => {
    const res = await handleOg(request("ABC123"), { fetchPreview: async () => samplePreview(), fetchCover: async () => null });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe(IMAGE_CACHE_SHORT);
  });

  it("does not ask for a cover the rollo doesn't have", async () => {
    const fetchCover = vi.fn(async () => null);
    const res = await handleOg(request("ABC123"), { fetchPreview: async () => samplePreview({ coverUrl: null }), fetchCover });
    expect(fetchCover).not.toHaveBeenCalled();
    expect(res.headers.get("cache-control")).toBe(IMAGE_CACHE_LONG);
  });

  it("redirects to the site image when there is no preview", async () => {
    const res = await handleOg(request("ABC123"), { fetchPreview: async () => null });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://rolloproject.com/og.png");
    expect(res.headers.get("cache-control")).toBe(IMAGE_CACHE_SHORT);
  });

  it("redirects to the site image when the API is unavailable", async () => {
    const res = await handleOg(request("ABC123"), { fetchPreview: async () => { throw new PreviewUnavailable("timeout"); } });
    expect(res.status).toBe(302);
    expect(res.headers.get("cache-control")).toBe(IMAGE_CACHE_SHORT);
  });

  it("redirects without asking the API for an invalid code", async () => {
    const fetchPreview = vi.fn(async () => samplePreview());
    const res = await handleOg(request("nope"), { fetchPreview });
    expect(fetchPreview).not.toHaveBeenCalled();
    expect(res.status).toBe(302);
  });
});

it("cache policies", () => {
  expect(IMAGE_CACHE_LONG).toBe("public, max-age=31536000, immutable");
  expect(IMAGE_CACHE_SHORT).toBe("public, max-age=60, s-maxage=60");
});
