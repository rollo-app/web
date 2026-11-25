// The public preview of a rollo (GET /events/<CODE>?any=1 on the API) and what the join link's preview shows from it.
import { createHash } from "node:crypto";

export const API_URL = "https://api.rolloproject.com";
export const PREVIEW_TIMEOUT_MS = 1500;

export type Preview = {
  type: "trip" | "event";
  name: string;
  coverUrl: string | null;
  description: string | null;
  startsAt: number;
  endsAt: number;
  timezone: string;
  revealed: boolean;
  memberCount: number | null;
};

type FetchOptions = { fetch?: typeof fetch; timeoutMs?: number };

/** A join code as the app prints it (6 letters or digits), uppercased; null if it isn't one. */
export function normalizeCode(raw: string | null | undefined): string | null {
  return typeof raw === "string" && /^[A-Za-z0-9]{6}$/.test(raw) ? raw.toUpperCase() : null;
}

/** GET with a deadline: null on any failure, timeout or non-2xx answer. */
export async function fetchWithTimeout(url: string, { fetch: doFetch = fetch, timeoutMs = PREVIEW_TIMEOUT_MS }: FetchOptions = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await Promise.race([
      doFetch(url, { signal: controller.signal }),
      new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(new Error("timeout")))),
    ]);
    return res.ok ? res : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The rollo behind `code` (already normalized), or null when the API says no, fails or is too slow. */
export async function fetchPreview(code: string, opts: FetchOptions = {}): Promise<Preview | null> {
  const res = await fetchWithTimeout(`${API_URL}/events/${code}?any=1`, opts);
  if (!res) return null;
  try {
    const body = (await res.json()) as Record<string, unknown>;
    if (typeof body.name !== "string" || typeof body.startsAt !== "number" || typeof body.endsAt !== "number") return null;
    const count = body.memberCount;
    return {
      type: body.type === "trip" ? "trip" : "event",
      name: body.name,
      coverUrl: safeCoverPath(body.coverUrl),
      description: typeof body.description === "string" ? body.description : null,
      startsAt: body.startsAt,
      endsAt: body.endsAt,
      timezone: typeof body.timezone === "string" ? body.timezone : "UTC",
      revealed: body.revealed === true,
      memberCount: typeof count === "number" && Number.isInteger(count) && count >= 0 ? count : null,
    };
  } catch {
    return null;
  }
}

/** A cover path on the API (`/covers/...`), the same check the join page makes; null otherwise. */
export function safeCoverPath(coverUrl: unknown): string | null {
  return typeof coverUrl === "string" && /^\/covers\/[A-Za-z0-9._/-]+$/.test(coverUrl) && !coverUrl.includes("..") ? coverUrl : null;
}

function dayMonth(ms: number, timeZone: string) {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("es", { timeZone, day: "numeric", month: "long" }).formatToParts(ms);
  } catch {
    parts = new Intl.DateTimeFormat("es", { timeZone: "UTC", day: "numeric", month: "long" }).formatToParts(ms);
  }
  return { day: parts.find((p) => p.type === "day")!.value, month: parts.find((p) => p.type === "month")!.value };
}

/** "12 de diciembre", "3 al 8 de enero" or "28 de diciembre al 3 de enero", in the rollo's timezone. */
export function formatDates(startsAt: number, endsAt: number, timeZone: string): string {
  const a = dayMonth(startsAt, timeZone);
  const b = dayMonth(endsAt, timeZone);
  if (a.month !== b.month) return `${a.day} de ${a.month} al ${b.day} de ${b.month}`;
  if (a.day !== b.day) return `${a.day} al ${b.day} de ${b.month}`;
  return `${a.day} de ${a.month}`;
}

/** The line under the name: the dates and, before the reveal, how many people joined (the API sends it from 5 up). */
export function caption(p: Preview): string {
  const dates = formatDates(p.startsAt, p.endsAt, p.timezone);
  return !p.revealed && p.memberCount !== null ? `${dates} · ${p.memberCount} personas` : dates;
}

/** Changes whenever the image would change, so apps that cache the image by URL fetch it again. */
export function previewVersion(p: Preview): string {
  const key = [p.name, p.coverUrl ?? "", p.startsAt, p.endsAt, p.timezone, p.memberCount ?? "", p.revealed].join("|");
  return createHash("sha256").update(key).digest("hex").slice(0, 10);
}
