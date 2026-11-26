// Usage: npm run carousels
// Renders every slide of the Instagram carousels as a 1080×1350 PNG into out/carousels/.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "node_modules", ".bin", "remotion");
const outDir = join(root, "out", "carousels");
mkdirSync(outDir, { recursive: true });

const carousels = [
  { id: "CarouselHow", name: "como-funciona", slides: 5 },
  { id: "CarouselWhy", name: "por-que-no-ves-tus-fotos", slides: 4 },
];
for (const c of carousels) {
  for (let i = 0; i < c.slides; i++) {
    const out = join(outDir, `${c.name}-${i + 1}.png`);
    execFileSync(bin, ["still", "src/index.ts", c.id, out, `--frame=${i}`, "--image-format", "png", "--log=error"], { cwd: root, stdio: "inherit" });
    console.log(out);
  }
}
