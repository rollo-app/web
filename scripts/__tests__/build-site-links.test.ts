/// <reference types="node" />
import { vi } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dist: string;
let html: string;

beforeAll(() => {
  dist = mkdtempSync(join(tmpdir(), "rollo-site-links-"));
  execFileSync(process.execPath, [join(__dirname, "..", "build-site.mjs")], { env: { ...process.env, SITE_DIST: dist, SITE_CF_ANALYTICS_TOKEN: "" } });
  html = readFileSync(join(dist, "friends", "index.html"), "utf8");
});
afterAll(() => rmSync(dist, { recursive: true, force: true }));

describe("Universal Links files", () => {
  it("serves the apple-app-site-association for the production app only", () => {
    const file = join(dist, ".well-known", "apple-app-site-association");
    expect(existsSync(file)).toBe(true);
    const aasa = JSON.parse(readFileSync(file, "utf8"));
    expect(aasa.applinks.details).toHaveLength(1);
    const detail = aasa.applinks.details[0];
    expect(detail.appIDs).toEqual(["UXHNAR4HYC.com.juanifraga.rollo.app"]);
    expect(detail.components.map((c: { "/": string }) => c["/"])).toEqual(["/login", "/login/", "/friends", "/friends/", "/join/*"]);
    for (const c of detail.components) expect(c["#"]).toBeUndefined(); // fragments allowed
  });

  it("sets application/json on the association file through vercel.json (it has no extension)", () => {
    const vercel = JSON.parse(readFileSync(join(__dirname, "..", "..", "vercel.json"), "utf8"));
    expect(vercel.headers).toContainEqual({
      source: "/.well-known/apple-app-site-association",
      headers: [{ key: "Content-Type", value: "application/json" }],
    });
    expect(existsSync(join(dist, "_headers"))).toBe(false);
  });
});

const inlineScript = () => {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  expect(scripts).toHaveLength(1);
  return scripts[0]!;
};

/** Runs the page's script against a fake browser opened at `/friends<hash>`. */
function open(hash: string) {
  const elements: { [id in "ok" | "bad" | "open" | "code"]: { hidden: boolean; href?: string; textContent?: string } } = {
    ok: { hidden: true },
    bad: { hidden: true },
    open: { hidden: false, href: "#" },
    code: { hidden: false, textContent: "" },
  };
  const location = { hash, pathname: "/friends", search: "", href: `https://rolloproject.com/friends${hash}` };
  const history = { replaceState: vi.fn() };
  const document = { getElementById: (id: keyof typeof elements) => elements[id] };
  new Function("location", "history", "document", inlineScript())(location, history, document);
  return { location, history, elements };
}

describe("the /friends page (friend link fallback)", () => {
  it("has a link preview card (Open Graph and Twitter)", () => {
    expect(html).toContain('<meta property="og:title" content="Te invitaron a Rollo">');
    expect(html).toContain('<meta property="og:description" content="Sumate como amigo en Rollo.">');
    expect(html).toContain('<meta property="og:image" content="https://rolloproject.com/og.png">');
    expect(html).toContain('<meta property="og:url" content="https://rolloproject.com/friends">');
    expect(html).toContain('<meta property="og:image:width" content="1200">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
  });

  it("shows the code and an Abrir Rollo button pointing at the deep link, without redirecting", () => {
    const { location, elements, history } = open("#K7M2QX9A");
    expect(elements.open.href).toBe("rollo://friends/K7M2QX9A");
    expect(elements.code.textContent).toBe("K7M2QX9A");
    expect(elements.ok.hidden).toBe(false);
    expect(elements.bad.hidden).toBe(true);
    expect(location.href).toBe("https://rolloproject.com/friends#K7M2QX9A");
    expect(history.replaceState).not.toHaveBeenCalled();
  });

  it("uppercases a lowercase code", () => {
    const { elements } = open("#k7m2qx9a");
    expect(elements.open.href).toBe("rollo://friends/K7M2QX9A");
    expect(elements.code.textContent).toBe("K7M2QX9A");
  });

  it.each(["", "#", "#bad", "#K7M2QX9A&x=1", "#K7M2QX9", "#K7M2QX9AB", "#K7M2-X9A"])("rejects %p", (hash) => {
    const { elements } = open(hash);
    expect(elements.bad.hidden).toBe(false);
    expect(elements.ok.hidden).toBe(true);
    expect(elements.open.href).toBe("#");
  });

  it("has the copy and the store link", () => {
    expect(html).toContain("Te invitaron a Rollo");
    expect(html).toContain("Abr&iacute; el link en el iPhone donde ten&eacute;s Rollo.");
    expect(html).toContain("Este link no es v&aacute;lido. Pedile a tu amigo que te mande uno nuevo.");
    expect(html).toContain("&iquest;Te invit&oacute; un amigo?");
    expect(html).toContain('href="https://apps.apple.com/app/id6825843502"');
    expect(html.match(/<noscript>[\s\S]*Pedile a tu amigo[\s\S]*<\/noscript>/)).not.toBeNull();
  });

  it("loads no motion script nor motion class", () => {
    for (const needle of ["motion.js", "landing.js", "js-motion"]) expect(html).not.toContain(needle);
  });

  it("is locked down: CSP hash matches its script, no network, no referrer, noindex", () => {
    const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)?.[1];
    expect(csp).toBeDefined();
    const hash = createHash("sha256").update(inlineScript()).digest("base64");
    expect(csp).toContain(`script-src 'sha256-${hash}'`);
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("default-src 'none'");
    expect(html).toContain('<meta name="referrer" content="no-referrer">');
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).not.toMatch(/<script[^>]+src=/);
  });
});

describe("the /join page (event link)", () => {
  const joinHtml = () => readFileSync(join(dist, "join", "index.html"), "utf8");
  const joinScript = () => {
    const scripts = [...joinHtml().matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(scripts).toHaveLength(1);
    return scripts[0]!;
  };
  type El = { hidden: boolean; href?: string; src?: string; textContent?: string };

  /** Runs the script at `pathname` with a fake fetch; resolves once the promise chain settled. */
  async function openJoin(pathname: string, response?: { status: number; ok?: boolean; json?: unknown } | "network-error") {
    const els: Record<string, El> = {};
    for (const id of ["ok", "bad", "revealed", "name", "cover"]) els[id] = { hidden: true, src: "" };
    els.pick = { hidden: false }; // visible by default inside #ok
    els.title = { hidden: false };
    els.open = { hidden: false, href: "#" };
    els.code = { hidden: false, textContent: "" };
    const fetchMock = vi.fn(async () => {
      if (response === "network-error" || !response) throw new Error("offline");
      return { status: response.status, ok: response.ok ?? response.status === 200, json: async () => response.json };
    });
    const document = { getElementById: (id: string) => els[id] };
    new Function("location", "document", "fetch", joinScript())({ pathname }, document, fetchMock);
    await new Promise((r) => setTimeout(r, 0));
    return { els, fetchMock };
  }

  it("writes the page, the deep link scheme and a store link that work without JS", () => {
    const h = joinHtml();
    expect(h).toContain("Abr&iacute; Rollo para elegir tu grupo.");
    expect(h).toContain("Abrir Rollo");
    expect(h).toContain("Si reci&eacute;n la instalaste, entr&aacute; con este c&oacute;digo en &laquo;Unirme&raquo;");
    expect(h).toContain("Este c&oacute;digo no es de un evento.");
    expect(h).toContain("Este evento ya se revel&oacute;.");
    expect(h.match(/<noscript>[\s\S]*apps\.apple\.com\/app\/id6825843502[\s\S]*<\/noscript>/)).not.toBeNull();
  });

  it("has a CSP that allows only its hashed script, the events API and covers from the API host", () => {
    const h = joinHtml();
    const csp = h.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)?.[1];
    const hash = createHash("sha256").update(joinScript()).digest("base64");
    expect(csp).toContain(`script-src 'sha256-${hash}'`);
    expect(csp).toContain("connect-src https://api.rolloproject.com");
    expect(csp).toContain("img-src 'self' https://api.rolloproject.com");
    expect(csp).toContain("default-src 'none'");
    expect(h).toContain('<meta name="robots" content="noindex">');
  });

  it("rewrites /join/:code to the page in vercel.json", () => {
    const vercel = JSON.parse(readFileSync(join(__dirname, "..", "..", "vercel.json"), "utf8"));
    expect(vercel.rewrites).toContainEqual({ source: "/join/:code", destination: "/join/index.html" });
  });

  it("shows the code and the deep link straight away, then the event with its cover", async () => {
    const { els, fetchMock } = await openJoin("/join/ab3k9z", {
      status: 200,
      json: { name: "Casamiento de Lu", coverUrl: "/covers/t1/c.jpg", revealed: false, groups: [] },
    });
    expect(fetchMock).toHaveBeenCalledWith("https://api.rolloproject.com/events/AB3K9Z");
    expect(els.code!.textContent).toBe("AB3K9Z");
    expect(els.open!.href).toBe("rollo://join/AB3K9Z");
    expect(els.name!.textContent).toBe("Casamiento de Lu");
    expect(els.name!.hidden).toBe(false);
    expect(els.cover!.src).toBe("https://api.rolloproject.com/covers/t1/c.jpg");
    expect(els.pick!.hidden).toBe(false);
    expect(els.revealed!.hidden).toBe(true);
  });

  it("says the event was already revealed", async () => {
    const { els } = await openJoin("/join/AB3K9Z", { status: 200, json: { name: "X", coverUrl: null, revealed: true, groups: [] } });
    expect(els.revealed!.hidden).toBe(false);
    expect(els.pick!.hidden).toBe(true);
    expect(els.cover!.hidden).toBe(true);
  });

  it.each(["https://evil.example/x.jpg", "//evil.example/x.jpg", "/covers/../x.jpg", "javascript:alert(1)"])("ignores a suspicious cover %p", async (coverUrl) => {
    const { els } = await openJoin("/join/AB3K9Z", { status: 200, json: { name: "X", coverUrl, revealed: false, groups: [] } });
    expect(els.cover!.hidden).toBe(true);
    expect(els.cover!.src).toBe("");
  });

  it("shows the not-an-event message on 404", async () => {
    const { els } = await openJoin("/join/AB3K9Z", { status: 404, json: { error: "not found" } });
    expect(els.bad!.hidden).toBe(false);
    expect(els.ok!.hidden).toBe(true);
  });

  it("keeps the code and the button when the API is unreachable or fails", async () => {
    for (const response of ["network-error", { status: 429 }] as const) {
      const { els } = await openJoin("/join/AB3K9Z", response);
      expect(els.ok!.hidden).toBe(false);
      expect(els.bad!.hidden).toBe(true);
      expect(els.name!.hidden).toBe(true);
    }
  });

  it.each(["/join", "/join/", "/join/ABC12", "/join/ABC1234", "/join/AB-3K9", "/join/AB3K9Z/x"])("rejects %p without calling the API", async (pathname) => {
    const { els, fetchMock } = await openJoin(pathname, { status: 200, json: {} });
    expect(els.bad!.hidden).toBe(false);
    expect(els.ok!.hidden).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
