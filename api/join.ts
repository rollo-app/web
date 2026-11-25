// /join/<CODE> (rewritten here by vercel.json): the built join page with that rollo's share tags.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { handleJoin, loadJoinTemplate } from "./_lib/join-html";

// Bundled with the function through `includeFiles` in vercel.json; read once per instance.
let template: string | undefined;

export async function GET(request: Request): Promise<Response> {
  template ??= await loadJoinTemplate(request, { readFile: () => readFileSync(join(process.cwd(), "dist", "join", "index.html"), "utf8") });
  return handleJoin(request, { template });
}
