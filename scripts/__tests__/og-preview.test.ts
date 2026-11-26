import { caption, fetchPreview, fetchWithTimeout, formatDates, normalizeCode, PreviewUnavailable, previewVersion, safeCoverPath } from "../../api/_lib/preview";
import { day, samplePreview, TZ } from "./helpers/preview";

describe("normalizeCode", () => {
  it("uppercases a valid 6-character code", () => {
    expect(normalizeCode("abc123")).toBe("ABC123");
  });
  it.each(["ABC12", "ABC12!", "ABC1234", "", undefined, null])("rejects %s", (raw) => {
    expect(normalizeCode(raw)).toBeNull();
  });
});

describe("fetchPreview", () => {
  const body = {
    type: "trip",
    name: "Viaje",
    coverUrl: null,
    description: null,
    startsAt: 1,
    endsAt: 2,
    timezone: TZ,
    revealed: false,
    memberCount: null,
    groups: [],
  };
  const respond = (status: number, json: unknown) => vi.fn(async () => new Response(JSON.stringify(json), { status }));

  it("asks the public API for any rollo and returns the preview", async () => {
    const fetch = respond(200, body);
    const preview = await fetchPreview("ABC123", { fetch });
    expect(fetch).toHaveBeenCalledWith("https://api.rolloproject.com/events/ABC123?any=1", expect.anything());
    expect(preview).toMatchObject({ type: "trip", name: "Viaje", memberCount: null });
  });
  it("returns null when the API does not know the code", async () => {
    expect(await fetchPreview("ABC123", { fetch: respond(404, {}) })).toBeNull();
  });
  it.each([429, 500, 503])("throws PreviewUnavailable on HTTP %i, so callers don't cache it", async (status) => {
    await expect(fetchPreview("ABC123", { fetch: respond(status, body) })).rejects.toBeInstanceOf(PreviewUnavailable);
  });
  it.each([{}, { ...body, name: "" }, { ...body, name: "   " }])("returns null for a body without a usable name (%o)", async (json) => {
    expect(await fetchPreview("ABC123", { fetch: respond(200, json) })).toBeNull();
  });
  it("throws PreviewUnavailable when the request fails", async () => {
    await expect(fetchPreview("ABC123", { fetch: vi.fn(async () => Promise.reject(new Error("down"))) })).rejects.toBeInstanceOf(PreviewUnavailable);
  });
  it("gives up after the timeout", async () => {
    const hang = vi.fn((_url: string, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))),
    );
    const started = Date.now();
    await expect(fetchPreview("ABC123", { fetch: hang as unknown as typeof fetch, timeoutMs: 20 })).rejects.toBeInstanceOf(PreviewUnavailable);
    expect(Date.now() - started).toBeLessThan(200);
  });
  it("gives up when the headers arrive but the body never ends", async () => {
    const stalled = vi.fn(async () => new Response(new ReadableStream({ start: (c) => c.enqueue(new TextEncoder().encode('{"name":')) }), { status: 200 }));
    const started = Date.now();
    await expect(fetchPreview("ABC123", { fetch: stalled, timeoutMs: 30 })).rejects.toBeInstanceOf(PreviewUnavailable);
    expect(Date.now() - started).toBeLessThan(300);
  });
  it.each([
    [0.25, 0.25],
    [0, 0],
    [1, 1],
    [1.5, null],
    [-0.1, null],
    ["0.5", null],
    [undefined, null],
  ])("reads coverFocusY %s as %s", async (value, expected) => {
    expect((await fetchPreview("ABC123", { fetch: respond(200, { ...body, coverFocusY: value }) }))?.coverFocusY).toBe(expected);
  });
  it("accepts the production API's shorter answer (name, cover, revealed, groups)", async () => {
    const preview = await fetchPreview("ABC123", { fetch: respond(200, { name: "Casamiento", coverUrl: "/covers/t/c.jpg", revealed: false, groups: [] }) });
    expect(preview).toMatchObject({ type: "event", name: "Casamiento", coverUrl: "/covers/t/c.jpg", startsAt: null, endsAt: null, memberCount: null });
  });
});

describe("fetchWithTimeout", () => {
  it("refuses a body over the byte cap", async () => {
    const big = vi.fn(async () => new Response(new Uint8Array(2048), { status: 200 }));
    await expect(fetchWithTimeout("https://x", (res) => res.arrayBuffer(), { fetch: big, maxBytes: 1024 })).rejects.toBeInstanceOf(PreviewUnavailable);
  });
});

describe("safeCoverPath", () => {
  it("accepts a cover path", () => {
    expect(safeCoverPath("/covers/a/b.jpg")).toBe("/covers/a/b.jpg");
  });
  it.each(["/covers/../x", "https://evil.example/x", "/photos/a.jpg", null, 3])("rejects %s", (value) => {
    expect(safeCoverPath(value)).toBeNull();
  });
});

describe("formatDates", () => {
  it("shows a single day", () => {
    expect(formatDates(day("2026-12-12"), day("2026-12-12"), TZ)).toBe("12 de diciembre");
  });
  it("shows a range in the same month", () => {
    expect(formatDates(day("2027-01-03"), day("2027-01-08"), TZ)).toBe("3 al 8 de enero");
  });
  it("shows a range across months", () => {
    expect(formatDates(day("2026-12-28"), day("2027-01-03"), TZ)).toBe("28 de diciembre al 3 de enero");
  });
  it("uses the rollo's timezone, not UTC", () => {
    // 01:00 UTC on the 13th is still the 12th at 22:00 in Montevideo.
    expect(formatDates(day("2026-12-12"), Date.parse("2026-12-13T01:00:00Z"), TZ)).toBe("12 de diciembre");
  });
});

describe("caption", () => {
  it("adds how many people joined", () => {
    expect(caption(samplePreview())).toBe("12 de diciembre · 48 personas");
  });
  it("shows only the date without a count", () => {
    expect(caption(samplePreview({ memberCount: null }))).toBe("12 de diciembre");
  });
  it("leaves the count out once revealed", () => {
    expect(caption(samplePreview({ revealed: true }))).toBe("12 de diciembre");
  });
  it("shows only the day an overnight event starts, like the app's Stories card", () => {
    const night = samplePreview({ startsAt: Date.parse("2026-12-13T00:00:00Z"), endsAt: Date.parse("2026-12-13T08:00:00Z"), memberCount: null });
    expect(caption(night)).toBe("12 de diciembre");
  });
  it("shows the whole range for a regular rollo", () => {
    expect(caption(samplePreview({ type: "trip", startsAt: day("2027-01-03"), endsAt: day("2027-01-08"), memberCount: null }))).toBe("3 al 8 de enero");
  });
  it("is empty without dates nor count (the production API's shorter answer)", () => {
    expect(caption(samplePreview({ startsAt: null, endsAt: null, memberCount: null }))).toBe("");
  });
});

describe("previewVersion", () => {
  it("is a stable 10-character hex hash", () => {
    expect(previewVersion(samplePreview())).toMatch(/^[0-9a-f]{10}$/);
    expect(previewVersion(samplePreview())).toBe(previewVersion(samplePreview()));
  });
  it("changes when what the image shows changes", () => {
    const base = previewVersion(samplePreview());
    expect(previewVersion(samplePreview({ name: "Otro" }))).not.toBe(base);
    expect(previewVersion(samplePreview({ coverUrl: null }))).not.toBe(base);
    expect(previewVersion(samplePreview({ memberCount: 49 }))).not.toBe(base);
    expect(previewVersion(samplePreview({ coverFocusY: 0.2 }))).not.toBe(base);
  });
});
