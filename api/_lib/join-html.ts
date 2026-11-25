// The join page (/join/<CODE>) with share tags for that rollo, so link previews in chat apps show its card.
import { fetchPreview as defaultFetchPreview, normalizeCode, previewVersion, type Preview } from "./preview";

export const SITE_URL = "https://rolloproject.com";
export const HTML_CACHE_CONTROL = "public, max-age=0, s-maxage=300, stale-while-revalidate=86400";
const DESCRIPTION_MAX = 200;

const OPEN = "<!--og-->";
const CLOSE = "<!--/og-->";

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function shareDescription(p: Preview): string {
  const text = p.description?.trim();
  if (!text) return p.type === "trip" ? "Te invitaron a este rollo en Rollo." : "Te invitaron a este evento en Rollo.";
  const chars = [...text];
  return chars.length > DESCRIPTION_MAX ? `${chars.slice(0, DESCRIPTION_MAX - 1).join("")}…` : text;
}

/** The built page with the rollo's title, description and share tags; the page as built when there is no preview. */
export function renderJoinHtml(template: string, code: string, preview: Preview | null): string {
  const start = template.indexOf(OPEN);
  const end = template.indexOf(CLOSE);
  if (!preview || start === -1 || end < start) return template;
  const name = escapeHtml(preview.name);
  const description = escapeHtml(shareDescription(preview));
  const tags = [
    OPEN,
    `<meta property="og:type" content="website">`,
    `<meta property="og:url" content="${SITE_URL}/join/${code}">`,
    `<meta property="og:title" content="${name}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:image" content="${SITE_URL}/api/og/join/${code}?v=${previewVersion(preview)}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    "",
  ].join("\n");
  return (template.slice(0, start) + tags + template.slice(end))
    .replace(/<title>[^<]*<\/title>/, () => `<title>${name} · Rollo Project</title>`)
    .replace(/<meta name="description" content="[^"]*">/, () => `<meta name="description" content="${description}">`);
}

type JoinDeps = { template: string; fetchPreview?: (code: string) => Promise<Preview | null> };

/** GET /api/join?code=<CODE> (vercel.json rewrites /join/:code here). Always 200: the page itself handles a bad code. */
export async function handleJoin(request: Request, { template, fetchPreview = defaultFetchPreview }: JoinDeps): Promise<Response> {
  const code = normalizeCode(new URL(request.url).searchParams.get("code"));
  const preview = code ? await fetchPreview(code) : null;
  return new Response(code ? renderJoinHtml(template, code, preview) : template, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": HTML_CACHE_CONTROL },
  });
}
