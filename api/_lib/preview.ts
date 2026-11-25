// The public preview of a rollo (GET /events/<CODE>?any=1 on the API) and what the join link's preview shows from it.
import { createHash } from "node:crypto";

export const API_URL = "https://api.rolloproject.com";
export const PREVIEW_TIMEOUT_MS = 1500;

export type Preview = {
  type: "trip" | "event";
  name: string;
  coverUrl: string | null;
  description: string | null;
  /** null when the API doesn't send dates (production before the `any=1` release). */
  startsAt: number | null;
  endsAt: number | null;
  timezone: string;
  revealed: boolean;
  memberCount: number | null;
};

export type FetchOptions = { fetch?: typeof fetch; timeoutMs?: number; maxBytes?: number };

/** A join code as the app prints it (6 letters or digits), uppercased; null if it isn't one. */
export function normalizeCode(raw: string | null | undefined): string | null {
  return typeof raw === "string" && /^[A-Za-z0-9]{6}$/.test(raw) ? raw.toUpperCase() : null;
}

/** The API could not answer right now (timeout, 429, 5xx, network): unlike a 404, worth asking again soon. */
export class PreviewUnavailable extends Error {}

/** Biggest body read from the API: a cover is a 1080×1440 JPEG, far below this. */
const MAX_BYTES = 5_000_000;

async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array<ArrayBuffer>> {
  if (!res.body) return new Uint8Array(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new PreviewUnavailable("body too large");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * GET `url` and read its body with `read`, all within one deadline (headers and body). null on 404; PreviewUnavailable on
 * any other failure, non-2xx answer, timeout or a body over `maxBytes`.
 */
export async function fetchWithTimeout<T>(
  url: string,
  read: (res: Response) => Promise<T>,
  { fetch: doFetch = fetch, timeoutMs = PREVIEW_TIMEOUT_MS, maxBytes = MAX_BYTES }: FetchOptions = {},
): Promise<T | null> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new PreviewUnavailable("timeout"));
    }, timeoutMs);
  });
  const work = (async () => {
    const res = await doFetch(url, { signal: controller.signal });
    if (res.status === 404) return null;
    if (!res.ok) throw new PreviewUnavailable(`HTTP ${res.status}`);
    const bytes = await readCapped(res, maxBytes);
    return read(new Response(bytes, { status: res.status, headers: res.headers }));
  })();
  work.catch(() => {});
  try {
    return await Promise.race([work, deadline]);
  } catch (error) {
    throw error instanceof PreviewUnavailable ? error : new PreviewUnavailable(String(error));
  } finally {
    clearTimeout(timer);
  }
}

const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

/**
 * The rollo behind `code` (already normalized); null when the API doesn't know it (or sends no usable name). Throws
 * PreviewUnavailable when the API fails or is too slow. Production may still send the older, shorter answer (name, cover,
 * revealed, groups): dates and count are then null.
 */
export async function fetchPreview(code: string, opts: FetchOptions = {}): Promise<Preview | null> {
  const body = await fetchWithTimeout(`${API_URL}/events/${code}?any=1`, (res) => res.json() as Promise<Record<string, unknown>>, opts);
  if (!body || typeof body.name !== "string" || body.name.trim() === "") return null;
  const startsAt = num(body.startsAt);
  const endsAt = num(body.endsAt);
  const count = body.memberCount;
  return {
    type: body.type === "trip" ? "trip" : "event",
    name: body.name.trim(),
    coverUrl: safeCoverPath(body.coverUrl),
    description: typeof body.description === "string" ? body.description : null,
    startsAt: startsAt !== null && endsAt !== null ? startsAt : null,
    endsAt: startsAt !== null && endsAt !== null ? endsAt : null,
    timezone: typeof body.timezone === "string" ? body.timezone : "UTC",
    revealed: body.revealed === true,
    memberCount: typeof count === "number" && Number.isInteger(count) && count >= 0 ? count : null,
  };
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

/**
 * The line under the name: the dates and, before the reveal, how many people joined (the API sends it from 5 up). An event
 * shows only the day it starts (an overnight party isn't "12 al 13"), like the app's Stories card; a regular rollo its range.
 * Empty when the API sends neither.
 */
export function caption(p: Preview): string {
  const parts: string[] = [];
  if (p.startsAt !== null && p.endsAt !== null) {
    parts.push(formatDates(p.startsAt, p.type === "event" ? p.startsAt : p.endsAt, p.timezone));
  }
  if (!p.revealed && p.memberCount !== null) parts.push(`${p.memberCount} personas`);
  return parts.join(" · ");
}

/** Changes whenever the image would change, so apps that cache the image by URL fetch it again. */
export function previewVersion(p: Preview): string {
  const key = [p.name, p.coverUrl ?? "", p.startsAt, p.endsAt, p.timezone, p.memberCount ?? "", p.revealed].join("|");
  return createHash("sha256").update(key).digest("hex").slice(0, 10);
}
