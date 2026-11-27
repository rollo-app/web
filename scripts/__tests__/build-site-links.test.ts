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
  type El = { hidden: boolean; href?: string; src?: string; textContent?: string; onload?: () => void; onerror?: () => void };
  type ApiResponse = { status: number; ok?: boolean; json?: unknown } | "network-error";

  /**
   * The browser the script runs in.
   * - `visit`: how this load came about: a link or the address bar ("navigate", the default), a reload, or a tab the browser
   *   brought back ("back_forward").
   * - `timing`: which APIs say so: both (default), only the old one (`performance.navigation`), only the new one
   *   (`getEntriesByType`), or none.
   * - `storage`: the tab's sessionStorage (pass the same Map to load the page twice in one tab); "broken" if it throws, or
   *   "read-only" if only writing throws (private browsing in old Safari).
   */
  type Browser = {
    userAgent: string;
    maxTouchPoints?: number;
    visit?: "navigate" | "reload" | "back_forward";
    timing?: "both" | "old" | "new" | "none";
    storage?: Map<string, string> | "broken" | "read-only";
  };

  /** Starts the script at `pathname` in a fake browser and hands back its controls: nothing has loaded or answered yet. */
  function startJoin(pathname: string, browser?: Browser) {
    const els: Record<string, El> = {};
    for (const id of ["ok", "bad", "revealed", "name", "cover", "count", "description"]) els[id] = { hidden: true, src: "" };
    els.pick = { hidden: false }; // visible by default inside #ok
    els.title = { hidden: false };
    els.open = { hidden: false, href: "#" };
    els.code = { hidden: false, textContent: "" };
    let settleFetch: ((response?: ApiResponse) => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve, reject) => {
          settleFetch = (response) =>
            response === "network-error" || !response
              ? reject(new Error("offline"))
              : resolve({ status: response.status, ok: response.ok ?? response.status === 200, json: async () => response.json });
        }),
    );
    /** Every time the page left for another URL, with the name it was showing at that moment. */
    const jumps: { to: string; name?: string }[] = [];
    const location = {
      pathname,
      set href(to: string) {
        jumps.push({ to, name: els.name!.textContent });
      },
    };
    const loadListeners: (() => void)[] = [];
    const window = { addEventListener: (type: string, listener: () => void) => void (type === "load" && loadListeners.push(listener)) };
    const document = { readyState: "interactive", getElementById: (id: string) => els[id] };
    const navigator = { userAgent: browser?.userAgent ?? "node", maxTouchPoints: browser?.maxTouchPoints ?? 0 };
    const visit = browser?.visit ?? "navigate";
    const timing = browser?.timing ?? "both";
    const performance = {
      ...((timing === "both" || timing === "old") && { navigation: { type: { navigate: 0, reload: 1, back_forward: 2 }[visit] } }),
      ...((timing === "both" || timing === "new") && { getEntriesByType: (type: string) => (type === "navigation" ? [{ type: visit }] : []) }),
    };
    const storage = browser?.storage instanceof Map ? browser.storage : new Map<string, string>();
    const blocked = () => {
      throw new Error("sessionStorage is blocked");
    };
    const sessionStorage = {
      getItem: browser?.storage === "broken" ? blocked : (key: string) => storage.get(key) ?? null,
      setItem: typeof browser?.storage === "string" ? blocked : (key: string, value: string) => void storage.set(key, value),
    };
    let now = 0;
    const timers: { at: number; run: () => void }[] = [];
    const setTimeout = (run: () => void, ms: number) => void timers.push({ at: now + ms, run });
    new Function("location", "document", "fetch", "navigator", "window", "performance", "sessionStorage", "setTimeout", joinScript())(
      location,
      document,
      fetchMock,
      navigator,
      window,
      performance,
      sessionStorage,
      setTimeout,
    );
    return {
      els,
      fetchMock,
      jumps,
      /** The page's own load event. */
      load: () => loadListeners.splice(0).forEach((listener) => listener()),
      /** The API answers (or the request fails); resolves once the page has handled it. */
      answer: async (response?: ApiResponse) => {
        settleFetch?.(response);
        await new Promise((r) => globalThis.setTimeout(r, 0));
      },
      /** The cover image finishes loading ("onload") or fails ("onerror"). */
      cover: (event: "onload" | "onerror") => els.cover![event]?.(),
      /** Time passes: the timers due by then run. */
      wait: (ms: number) => {
        now += ms;
        const due = timers.filter((timer) => timer.at <= now);
        for (const timer of due) timers.splice(timers.indexOf(timer), 1);
        for (const timer of due) timer.run();
      },
    };
  }

  /** Runs the script at `pathname` to the end: the page loads, the API answers `response` and the cover (if any) loads. */
  async function openJoin(pathname: string, response?: ApiResponse, browser?: Browser) {
    const page = startJoin(pathname, browser);
    page.load();
    await page.answer(response);
    page.cover("onload");
    return page;
  }

  it("writes the page, the deep link scheme and a store link that work without JS", () => {
    const h = joinHtml();
    expect(h).toContain("Abr&iacute; Rollo para elegir tu grupo.");
    expect(h).toContain("Abrir Rollo");
    expect(h).toContain("Si reci&eacute;n la instalaste, entr&aacute; con este c&oacute;digo en &laquo;Unirme&raquo;");
    expect(h).toContain("Este c&oacute;digo no es v&aacute;lido.");
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
    expect(csp).not.toContain("cloudflare");
    expect(h).toContain('<meta name="robots" content="noindex">');
  });

  it("has no analytics beacon even when a token is set (the code in the path is a credential)", () => {
    const withToken = mkdtempSync(join(tmpdir(), "rollo-site-join-"));
    try {
      execFileSync(process.execPath, [join(__dirname, "..", "build-site.mjs")], { env: { ...process.env, SITE_DIST: withToken, SITE_CF_ANALYTICS_TOKEN: "tok" } });
      const h = readFileSync(join(withToken, "join", "index.html"), "utf8");
      expect(h).not.toContain("cloudflareinsights");
      expect(h).not.toContain("data-cf-beacon");
    } finally {
      rmSync(withToken, { recursive: true, force: true });
    }
  });

  it("keeps the empty cover out of the layout (display:none for [hidden] beats .cover display)", () => {
    expect(joinHtml()).toContain(".cover[hidden]{display:none}");
  });

  it("rewrites /join/:code to the function that adds the rollo's share tags, which bundles the page", () => {
    const vercel = JSON.parse(readFileSync(join(__dirname, "..", "..", "vercel.json"), "utf8"));
    expect(vercel.rewrites).toContainEqual({ source: "/join/:code", destination: "/api/join?code=:code" });
    expect(vercel.rewrites).toContainEqual({ source: "/join/:code/", destination: "/api/join?code=:code" });
    expect(vercel.functions["api/join.ts"].includeFiles).toBe("dist/join/index.html");
  });

  it("shows the code and the deep link straight away, then the event with its cover", async () => {
    const { els, fetchMock } = await openJoin("/join/ab3k9z", {
      status: 200,
      json: { name: "Casamiento de Lu", coverUrl: "/covers/t1/c.jpg", revealed: false, groups: [] },
    });
    expect(fetchMock).toHaveBeenCalledWith("https://api.rolloproject.com/events/AB3K9Z?any=1");
    expect(els.code!.textContent).toBe("AB3K9Z");
    expect(els.open!.href).toBe("rollo://join/AB3K9Z");
    expect(els.name!.textContent).toBe("Casamiento de Lu");
    expect(els.name!.hidden).toBe(false);
    expect(els.cover!.src).toBe("https://api.rolloproject.com/covers/t1/c.jpg");
    expect(els.pick!.hidden).toBe(false);
    expect(els.revealed!.hidden).toBe(true);
  });

  it("shows how many people already joined", async () => {
    const { els } = await openJoin("/join/AB3K9Z", { status: 200, json: { name: "X", revealed: false, memberCount: 12 } });
    expect(els.count!.textContent).toBe("12 personas ya se unieron");
    expect(els.count!.hidden).toBe(false);
  });

  it("invites to be among the first when memberCount is null (fewer than 5)", async () => {
    const { els } = await openJoin("/join/AB3K9Z", { status: 200, json: { name: "X", revealed: false, memberCount: null } });
    expect(els.count!.textContent).toBe("S\u00e9 de los primeros en unirte");
    expect(els.count!.hidden).toBe(false);
  });

  it.each([undefined, -1, 1.5, "7", NaN])("shows no counter when memberCount is %p (older API or invalid)", async (memberCount) => {
    const { els } = await openJoin("/join/AB3K9Z", { status: 200, json: { name: "X", revealed: false, memberCount } });
    expect(els.count!.hidden).toBe(true);
  });

  it("hides the counter once the event is revealed", async () => {
    const { els } = await openJoin("/join/AB3K9Z", { status: 200, json: { name: "X", revealed: true, memberCount: 9 } });
    expect(els.count!.hidden).toBe(true);
  });

  it("shows the description as text under the name", async () => {
    const { els } = await openJoin("/join/AB3K9Z", { status: 200, json: { name: "Boda", description: "Línea 1\n<b>x</b>" } });
    expect(els.description!.textContent).toBe("Línea 1\n<b>x</b>");
    expect(els.description!.hidden).toBe(false);
  });

  it.each([null, "", "   ", undefined, 5])("shows no description element when it is %p", async (d) => {
    const { els } = await openJoin("/join/AB3K9Z", { status: 200, json: { name: "Boda", description: d } });
    expect(els.description!.hidden).toBe(true);
  });

  it("has the description element, pre-line styles and no innerHTML", () => {
    const h = joinHtml();
    expect(h).toContain('<p id="description" class="description" hidden></p>');
    expect(h).toContain(".description[hidden]{display:none}");
    expect(h).toContain("white-space:pre-line");
    expect(joinScript()).not.toContain("innerHTML");
  });

  it("has the counter element and styles in the built page", () => {
    const h = joinHtml();
    expect(h).toContain('<p id="count" class="count muted" hidden></p>');
    expect(h).toContain(".count[hidden]{display:none}");
    expect(h).toContain("font-variant-numeric:tabular-nums");
  });

  it("a regular rollo says rollo: no group to pick, its own revealed text", async () => {
    const { els } = await openJoin("/join/AB3K9Z", { status: 200, json: { type: "trip", name: "Sur 2027", revealed: false, groups: [] } });
    expect(els.name!.textContent).toBe("Sur 2027");
    expect(els.pick!.hidden).toBe(true);
    expect(els.revealed!.hidden).toBe(true);
    expect(els.title!.textContent).toBe("Te invitaron a un rollo en Rollo");
    const revealed = await openJoin("/join/AB3K9Z", { status: 200, json: { type: "trip", name: "Sur 2027", revealed: true } });
    expect(revealed.els.revealed!.textContent).toBe("Este rollo ya se revel\u00f3.");
    expect(revealed.els.revealed!.hidden).toBe(false);
    expect(revealed.els.pick!.hidden).toBe(true);
  });

  it("an event keeps the group copy, and so does a response without type (older API)", async () => {
    for (const type of ["event", undefined]) {
      const { els } = await openJoin("/join/AB3K9Z", { status: 200, json: { type, name: "Boda", revealed: false, groups: [] } });
      expect(els.pick!.hidden).toBe(false);
      expect(els.title!.textContent).toBeUndefined();
    }
  });

  it("has generic social tags (no event or group wording)", () => {
    const og = joinHtml().match(/<meta property="og:[^>]+>/g)!.join("\n");
    expect(og).toContain("Sumate en Rollo.");
    expect(og).not.toMatch(/evento|grupo/i);
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

  // With the app installed iOS opens the link in the app and this page never loads, so an iPhone browser showing it almost
  // always means no app.
  describe("without the app: straight to the App Store", () => {
    const STORE = "https://apps.apple.com/app/id6825843502";
    const ROLLO = { status: 200, json: { name: "X", revealed: false } };
    const IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)";
    const IPHONE_SAFARI = `${IOS} Version/18.1 Mobile/15E148 Safari/604.1`;
    const IPHONE: Browser = { userAgent: IPHONE_SAFARI };
    const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";
    const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
    const INSTAGRAM = `${IOS} Mobile/15E148 Instagram 358.0.0.30.99 (iPhone15,3; iOS 18_1; es_LA; es; scale=3.00; 1290x2796; 665322158)`;
    const FACEBOOK = `${IOS} Mobile/15E148 [FBAN/FBIOS;FBAV/487.0.0.44.108;FBBV/665322158;FBDV/iPhone15,3;FBMD/iPhone;FBSN/iOS;FBSV/18.1;FBSS/3;FBID/phone;FBLC/es_LA;FBOP/5]`;
    /** Where the page went, in order. */
    const to = (page: { jumps: { to: string }[] }) => page.jumps.map((jump) => jump.to);

    it("jumps to the App Store on an iPhone browser", async () => {
      const page = await openJoin("/join/AB3K9Z", ROLLO, IPHONE);
      expect(to(page)).toEqual([STORE]);
    });

    it("leaves with the rollo already on the page, so coming back finds it", async () => {
      const page = await openJoin("/join/AB3K9Z", ROLLO, IPHONE);
      expect(page.jumps).toEqual([{ to: STORE, name: "X" }]);
      expect(page.els.code!.textContent).toBe("AB3K9Z");
      expect(page.els.open!.href).toBe("rollo://join/AB3K9Z");
    });

    it("waits for the API's answer before leaving", async () => {
      const page = startJoin("/join/AB3K9Z", IPHONE);
      page.load();
      expect(to(page)).toEqual([]);
      await page.answer(ROLLO);
      expect(to(page)).toEqual([STORE]);
    });

    it("waits for the page's own load before leaving", async () => {
      const page = startJoin("/join/AB3K9Z", IPHONE);
      await page.answer(ROLLO);
      expect(to(page)).toEqual([]);
      page.load();
      expect(to(page)).toEqual([STORE]);
    });

    it.each(["onload", "onerror"] as const)("waits for the cover before leaving (%s)", async (event) => {
      const page = startJoin("/join/AB3K9Z", IPHONE);
      page.load();
      await page.answer({ status: 200, json: { name: "X", coverUrl: "/covers/t1/c.jpg", revealed: false } });
      expect(to(page)).toEqual([]);
      page.cover(event);
      expect(to(page)).toEqual([STORE]);
    });

    it("leaves after 1.5 s when the API never answers", () => {
      const page = startJoin("/join/AB3K9Z", IPHONE);
      page.load();
      page.wait(1499);
      expect(to(page)).toEqual([]);
      page.wait(1);
      expect(to(page)).toEqual([STORE]);
    });

    it("jumps once, even when everything finishes after the 1.5 s", async () => {
      const page = startJoin("/join/AB3K9Z", IPHONE);
      page.wait(1500);
      page.load();
      await page.answer(ROLLO);
      expect(to(page)).toEqual([STORE]);
    });

    it.each<[string, ApiResponse]>([
      ["is unreachable", "network-error"],
      ["is rate limited", { status: 429 }],
    ])("jumps when the API %s", async (_name, response) => {
      const page = await openJoin("/join/AB3K9Z", response, IPHONE);
      expect(to(page)).toEqual([STORE]);
    });

    it("does not jump for a code the API does not know: the page says so", async () => {
      const page = await openJoin("/join/AB3K9Z", { status: 404, json: { error: "Código inválido" } }, IPHONE);
      page.wait(1500);
      expect(to(page)).toEqual([]);
      expect(page.els.bad!.hidden).toBe(false);
    });

    it.each<[string, Browser]>([
      ["Chrome on an iPhone", { userAgent: `${IOS} CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1` }],
      ["an iPad with the mobile site", { userAgent: "Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1" }],
    ])("jumps on %s", async (_name, browser) => {
      const page = await openJoin("/join/AB3K9Z", ROLLO, browser);
      expect(to(page)).toEqual([STORE]);
    });

    it("jumps for a lowercase code with a trailing slash", async () => {
      const page = await openJoin("/join/ab3k9z/", ROLLO, IPHONE);
      expect(to(page)).toEqual([STORE]);
    });

    it.each<[string, Browser]>([
      ["a Mac", { userAgent: MAC }],
      // Safari on an iPad says Macintosh, and Apple answers that with the store's web page instead of opening the App Store.
      ["an iPad that says Macintosh", { userAgent: MAC, maxTouchPoints: 5 }],
      ["Android, whose Chrome also says Safari", { userAgent: ANDROID, maxTouchPoints: 5 }],
      // In-app browsers load the page even with the app installed: iOS never gets to try the Universal Link.
      ["Instagram's browser", { userAgent: INSTAGRAM }],
      ["Facebook's browser", { userAgent: FACEBOOK }],
      ["Instagram's browser if it kept the Safari token", { userAgent: `${IPHONE_SAFARI} Instagram 358.0.0.30.99` }],
      ["Facebook's browser if it kept the Safari token", { userAgent: `${IPHONE_SAFARI} [FBAN/FBIOS;FBAV/487.0.0.44.108]` }],
      ["any other in-app browser (TikTok's has no Safari token)", { userAgent: `${IOS} Mobile/15E148 musical_ly_32.5.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/es Region/UY` }],
    ])("does not jump on %s", async (_name, browser) => {
      const page = await openJoin("/join/AB3K9Z", ROLLO, browser);
      page.wait(1500);
      expect(to(page)).toEqual([]);
    });

    it("does not jump for a malformed code", async () => {
      const page = await openJoin("/join/abc", ROLLO, IPHONE);
      page.wait(1500);
      expect(to(page)).toEqual([]);
      expect(page.els.bad!.hidden).toBe(false);
    });

    // A reload, a tab the browser restores after closing, or Back from the store are not someone opening the invitation.
    it.each(["reload", "back_forward"] as const)("does not jump when the tab comes back (%s): the page stays", async (visit) => {
      const page = await openJoin("/join/AB3K9Z", ROLLO, { ...IPHONE, visit });
      page.wait(1500);
      expect(to(page)).toEqual([]);
      expect(page.els.name!.textContent).toBe("X");
    });

    it("jumps only once per tab, even if the link is opened again in it", async () => {
      const storage = new Map<string, string>();
      const first = await openJoin("/join/AB3K9Z", ROLLO, { ...IPHONE, storage });
      const again = await openJoin("/join/AB3K9Z", ROLLO, { ...IPHONE, storage });
      again.wait(1500);
      expect(to(first)).toEqual([STORE]);
      expect(to(again)).toEqual([]);
    });

    // Without the mark a later load in the same tab could jump again, so no mark means no jump.
    it.each(["broken", "read-only"] as const)("does not jump when sessionStorage is %s, and the page still works", async (storage) => {
      const page = await openJoin("/join/AB3K9Z", ROLLO, { ...IPHONE, storage });
      page.wait(1500);
      expect(to(page)).toEqual([]);
      expect(page.els.code!.textContent).toBe("AB3K9Z");
      expect(page.els.name!.textContent).toBe("X");
    });

    it.each(["old", "new"] as const)("tells a fresh visit from a reload with the %s navigation API alone", async (timing) => {
      const fresh = await openJoin("/join/AB3K9Z", ROLLO, { ...IPHONE, timing });
      const reloaded = await openJoin("/join/AB3K9Z", ROLLO, { ...IPHONE, timing, visit: "reload" });
      reloaded.wait(1500);
      expect(to(fresh)).toEqual([STORE]);
      expect(to(reloaded)).toEqual([]);
    });

    it("does not jump when the browser cannot tell how the page was opened", async () => {
      const page = await openJoin("/join/AB3K9Z", ROLLO, { ...IPHONE, timing: "none" });
      page.wait(1500);
      expect(to(page)).toEqual([]);
    });
  });
});
