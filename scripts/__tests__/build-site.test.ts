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
  dist = mkdtempSync(join(tmpdir(), "rollo-site-"));
  execFileSync(process.execPath, [join(__dirname, "..", "build-site.mjs")], { env: { ...process.env, SITE_DIST: dist, SITE_CF_ANALYTICS_TOKEN: "" } });
  html = readFileSync(join(dist, "login", "index.html"), "utf8");
});
afterAll(() => rmSync(dist, { recursive: true, force: true }));

it("the /login page loads no motion script nor motion class", () => {
  for (const needle of ["motion.js", "landing.js", "js-motion"]) expect(html).not.toContain(needle);
});

const inlineScript = () => {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  expect(scripts).toHaveLength(1);
  return scripts[0]!;
};

/** Runs the page's script against a fake browser opened at `/login<hash>`. */
function open(hash: string) {
  const elements: { [id in "ok" | "bad" | "open"]: { hidden: boolean; href?: string } } = {
    ok: { hidden: true },
    bad: { hidden: true },
    open: { hidden: false, href: "#" },
  };
  const location = { hash, pathname: "/login", search: "", href: `https://rolloproject.com/login${hash}` };
  const history = { replaceState: vi.fn() };
  const document = { getElementById: (id: keyof typeof elements) => elements[id] };
  new Function("location", "history", "document", inlineScript())(location, history, document);
  return { location, history, elements };
}

describe("the /login page (magic link from the email)", () => {
  it("opens the app with the token and the email from the fragment, encoded", () => {
    const { location, elements } = open("#t=abc%2Bdef&e=juani%2Bviaje%40rollo.test");

    const deepLink = "rollo://login?token=abc%2Bdef&email=juani%2Bviaje%40rollo.test";
    expect(location.href).toBe(deepLink);
    expect(elements.open.href).toBe(deepLink);
    expect(elements.ok.hidden).toBe(false);
    expect(elements.bad.hidden).toBe(true);
  });

  it("clears the token from the address bar", () => {
    const { history } = open("#t=abc&e=a%40b.c");
    expect(history.replaceState).toHaveBeenCalledWith(null, "", "/login");
  });

  it("without a token it says the link isn't valid and opens nothing", () => {
    const { location, elements } = open("");
    expect(location.href).toBe("https://rolloproject.com/login");
    expect(elements.bad.hidden).toBe(false);
    expect(elements.ok.hidden).toBe(true);
  });

  it("has the button and the copy", () => {
    expect(html).toContain('id="open"');
    expect(html).toContain("Abrir Rollo");
    expect(html).toContain("Si la app no se abri&oacute;, toc&aacute; el bot&oacute;n.");
    expect(html).toContain("Este link no es v&aacute;lido. Ped&iacute; un c&oacute;digo nuevo desde la app.");
  });

  it("sends nothing anywhere: no network calls, no external resources", () => {
    const script = inlineScript();
    for (const call of ["fetch", "XMLHttpRequest", "sendBeacon", "WebSocket", "Image", "import("]) expect(script).not.toContain(call);
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/<(img|iframe)\b/);
    expect(html).not.toMatch(/(src|href)="(https?:)?\/\//);
    expect(html).toContain('<meta name="referrer" content="no-referrer">');
  });

  it("locks the page down with a CSP: only its own inline script runs and it can't connect anywhere", () => {
    const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)?.[1];
    expect(csp).toBeDefined();
    const hash = createHash("sha256").update(inlineScript()).digest("base64");
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain(`script-src 'sha256-${hash}'`);
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("base-uri 'none'");
  });
});

describe("old Spanish routes", () => {
  it("redirect permanently to the English ones (sent emails and installed app builds still link them)", () => {
    const vercel = JSON.parse(readFileSync(join(__dirname, "..", "..", "vercel.json"), "utf8"));
    for (const [from, to] of [["entrar", "login"], ["soporte", "support"], ["privacidad", "privacy"], ["terminos", "terms"]]) {
      expect(vercel.redirects).toContainEqual({ source: `/${from}`, destination: `/${to}`, permanent: true });
      expect(vercel.redirects).toContainEqual({ source: `/${from}/`, destination: `/${to}`, permanent: true });
      expect(existsSync(join(dist, from))).toBe(false);
    }
  });
});

describe("Vercel project", () => {
  it("builds with npm run build and serves dist/ as plain static files", () => {
    const vercel = JSON.parse(readFileSync(join(__dirname, "..", "..", "vercel.json"), "utf8"));
    expect(vercel).toMatchObject({ framework: null, installCommand: "npm ci", buildCommand: "npm run build", outputDirectory: "dist" });
  });
});

describe("footer", () => {
  it("every page signs as Rollo Project", () => {
    for (const page of ["index.html", "support/index.html", "privacy/index.html", "terms/index.html", "friends/index.html"]) {
      const footer = readFileSync(join(dist, page), "utf8").match(/<footer>[\s\S]*?<\/footer>/)?.[0];
      expect(footer).toContain("&copy; 2026 Rollo Project");
      expect(footer).not.toContain("Fraga");
    }
  });
});

describe("support email", () => {
  it("every page and the legal texts point to support@rolloproject.com", () => {
    for (const page of ["support/index.html", "privacy/index.html", "terms/index.html"]) {
      const content = readFileSync(join(dist, page), "utf8");
      expect(content).toContain("support@rolloproject.com");
      expect(content).not.toContain("soporte@juanifraga.com");
    }
  });
});

describe("brand", () => {
  const pages = ["index.html", "support/index.html", "privacy/index.html", "terms/index.html", "friends/index.html", "login/index.html", "404.html"];
  const read = (page: string) => readFileSync(join(dist, page), "utf8");

  it("every page title names Rollo Project", () => {
    for (const page of pages) expect(read(page)).toMatch(/<title>[^<]*Rollo Project[^<]*<\/title>/);
  });

  it("the header next to the logo says Rollo Project", () => {
    for (const page of pages) expect(read(page)).toContain("<span>Rollo Project</span>");
  });

  it("the home share card is titled Rollo Project", () => {
    expect(read("index.html")).toContain('<meta property="og:title" content="Rollo Project · Sacá la foto. Mirala después.">');
  });

  it("the legal texts are titled after Rollo Project and name it as the responsible party", () => {
    expect(read("privacy/index.html")).toContain("<h1>Política de privacidad de Rollo Project</h1>");
    expect(read("terms/index.html")).toContain("<h1>Términos de uso de Rollo Project</h1>");
    expect(read("privacy/index.html")).toContain("Rollo Project es desarrollada y operada por");
  });

  it("the app keeps its own name where the text talks about the app", () => {
    expect(read("friends/index.html")).toContain("Abrir Rollo");
    expect(read("login/index.html")).toContain("Abrir Rollo");
  });
});
