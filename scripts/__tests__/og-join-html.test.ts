/// <reference types="node" />
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleJoin, HTML_CACHE_CONTROL, HTML_CACHE_SHORT, loadJoinTemplate, renderJoinHtml } from "../../api/_lib/join-html";
import { PreviewUnavailable } from "../../api/_lib/preview";
import { previewVersion } from "../../api/_lib/preview";
import { samplePreview } from "./helpers/preview";

let dist: string;
let template: string;

beforeAll(() => {
  dist = mkdtempSync(join(tmpdir(), "rollo-site-"));
  execFileSync(process.execPath, [join(__dirname, "..", "build-site.mjs")], { env: { ...process.env, SITE_DIST: dist, SITE_CF_ANALYTICS_TOKEN: "" } });
  template = readFileSync(join(dist, "join", "index.html"), "utf8");
});
afterAll(() => rmSync(dist, { recursive: true, force: true }));

const meta = (html: string, property: string) =>
  new RegExp(`<meta (?:property|name)="${property}" content="([^"]*)">`).exec(html)?.[1];
const between = (html: string) => html.slice(html.indexOf("<!--og-->"), html.indexOf("<!--/og-->"));

it("the built join page marks its share tags once, with the generic image inside", () => {
  expect(template.split("<!--og-->")).toHaveLength(2);
  expect(template.split("<!--/og-->")).toHaveLength(2);
  expect(between(template)).toContain(`content="https://rolloproject.com/og.png"`);
});

describe("renderJoinHtml", () => {
  it("fills the tags with the rollo", () => {
    const preview = samplePreview();
    const html = renderJoinHtml(template, "ABC123", preview);
    expect(html).toContain("<title>Casamiento de Ana &amp; Fede · Rollo Project</title>");
    expect(meta(html, "og:title")).toBe("Casamiento de Ana &amp; Fede");
    expect(meta(html, "og:url")).toBe("https://rolloproject.com/join/ABC123");
    expect(meta(html, "og:image")).toBe(`https://rolloproject.com/api/og/join/ABC123?v=${previewVersion(preview)}`);
    expect(meta(html, "og:image:width")).toBe("1200");
    expect(meta(html, "og:image:height")).toBe("630");
    expect(meta(html, "twitter:card")).toBe("summary_large_image");
    expect(meta(html, "og:description")).toBe("La fiesta es en el salón.");
    expect(meta(html, "description")).toBe("La fiesta es en el salón.");
  });

  it("cuts a long description", () => {
    const html = renderJoinHtml(template, "ABC123", samplePreview({ description: "a".repeat(500) }));
    expect(meta(html, "og:description")).toBe(`${"a".repeat(199)}…`);
  });

  it.each([
    ["trip", "Te invitaron a este rollo en Rollo."],
    ["event", "Te invitaron a este evento en Rollo."],
  ] as const)("without a description a %s says what it is", (type, text) => {
    const html = renderJoinHtml(template, "ABC123", samplePreview({ type, description: null }));
    expect(meta(html, "og:description")).toBe(text);
  });

  it("escapes the name so it cannot break out of the tags", () => {
    const html = renderJoinHtml(template, "ABC123", samplePreview({ name: `"><script>alert(1)</script>` }));
    expect(html.match(/<script>/g)).toHaveLength(template.match(/<script>/g)!.length);
    expect(meta(html, "og:title")).toBe("&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("leaves the page as built without a preview", () => {
    expect(renderJoinHtml(template, "ABC123", null)).toBe(template);
  });

  it("changes nothing else in the page", () => {
    const html = renderJoinHtml(template, "ABC123", samplePreview());
    const strip = (s: string) =>
      s.replace(/<!--og-->[\s\S]*<!--\/og-->/, "").replace(/<title>.*<\/title>/, "").replace(/<meta name="description"[^>]*>/, "");
    expect(strip(html)).toBe(strip(template));
  });
});

describe("handleJoin", () => {
  it("normalizes the code and serves cacheable HTML", async () => {
    const fetchPreview = vi.fn(async () => samplePreview());
    const res = await handleJoin(new Request("https://rolloproject.com/api/join?code=abc123"), { template, fetchPreview });
    expect(fetchPreview).toHaveBeenCalledWith("ABC123");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe(HTML_CACHE_CONTROL);
    expect(meta(await res.text(), "og:url")).toBe("https://rolloproject.com/join/ABC123");
  });

  it("does not ask the API for an invalid code", async () => {
    const fetchPreview = vi.fn(async () => samplePreview());
    const res = await handleJoin(new Request("https://rolloproject.com/api/join?code=nope"), { template, fetchPreview });
    expect(fetchPreview).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(template);
  });

  it("serves the generic page when the API has nothing", async () => {
    const res = await handleJoin(new Request("https://rolloproject.com/api/join?code=ABC123"), { template, fetchPreview: async () => null });
    expect(await res.text()).toBe(template);
    expect(res.headers.get("cache-control")).toBe(HTML_CACHE_CONTROL);
  });

  it("serves the generic page with a short cache when the API is unavailable, so a blip isn't kept for minutes", async () => {
    const fetchPreview = async () => {
      throw new PreviewUnavailable("HTTP 429");
    };
    const res = await handleJoin(new Request("https://rolloproject.com/api/join?code=ABC123"), { template, fetchPreview });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(template);
    expect(res.headers.get("cache-control")).toBe(HTML_CACHE_SHORT);
  });
});

describe("loadJoinTemplate", () => {
  const request = new Request("https://rolloproject.com/api/join?code=ABC123");
  it("reads the bundled page", async () => {
    expect(await loadJoinTemplate(request, { readFile: () => "<html>bundled", fetch: vi.fn() })).toBe("<html>bundled");
  });
  it("falls back to the static page on the same site when the bundled one is missing", async () => {
    const fetch = vi.fn(async () => new Response("<html>static", { status: 200 }));
    const readFile = () => {
      throw new Error("ENOENT");
    };
    expect(await loadJoinTemplate(request, { readFile, fetch })).toBe("<html>static");
    expect(fetch).toHaveBeenCalledWith("https://rolloproject.com/join/index.html", expect.anything());
  });
});

it("HTML_CACHE_SHORT lets the CDN keep a failed lookup only a minute", () => {
  expect(HTML_CACHE_SHORT).toBe("public, max-age=0, s-maxage=60");
});

it("HTML_CACHE_CONTROL keeps browsers fresh and lets the CDN cache a few minutes", () => {
  expect(HTML_CACHE_CONTROL).toBe("public, max-age=0, s-maxage=300, stale-while-revalidate=86400");
});
