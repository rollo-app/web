import { test } from "node:test";
import assert from "node:assert/strict";
import { AT, BAR, BEAT, FLY, MONTAGE, SHUTTER, TOTAL } from "./beats.ts";

const onBeat = (frame: number) => frame % BEAT === 0;

test("120 BPM at 30 fps: a beat is 15 frames and the Reel is 11 bars (22 s)", () => {
  assert.equal(BEAT, 15);
  assert.equal(BAR, 60);
  assert.equal(TOTAL, 660);
});

test("every section starts on a downbeat, in order", () => {
  const starts = Object.values(AT);
  for (const s of starts) assert.equal(s % BAR, 0, `section at ${s} is not on a bar`);
  assert.deepEqual([...starts].sort((a, b) => a - b), starts);
});

test("the shutter and the photo flying into the roll land on beats", () => {
  assert.ok(onBeat(SHUTTER), `shutter at ${SHUTTER}`);
  assert.ok(onBeat(FLY), `fly at ${FLY}`);
  assert.ok(SHUTTER >= AT.camera && SHUTTER < AT.map);
});

test("the montage puts one word per beat inside its bar", () => {
  MONTAGE.forEach((m, i) => assert.equal(m.at, AT.montage + i * BEAT));
  assert.ok(MONTAGE[MONTAGE.length - 1]!.at < AT.end);
});
