// /api/og/join/<CODE>: the join link's preview image (the URL the join page puts in og:image).
import { handleOg } from "../../_lib/og-card";

export function GET(request: Request): Promise<Response> {
  return handleOg(request);
}
