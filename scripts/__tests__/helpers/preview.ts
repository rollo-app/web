import type { Preview } from "../../../api/_lib/preview";

export const TZ = "America/Montevideo";
/** Noon in Montevideo (UTC-3) on the given day, ms since epoch. */
export const day = (iso: string) => Date.parse(`${iso}T15:00:00Z`);

export const samplePreview = (over: Partial<Preview> = {}): Preview => ({
  type: "event",
  name: "Casamiento de Ana & Fede",
  coverUrl: "/covers/abc/cover.jpg",
  description: "La fiesta es en el salón.",
  startsAt: day("2026-12-12"),
  endsAt: day("2026-12-12"),
  timezone: TZ,
  revealed: false,
  memberCount: 48,
  ...over,
});
