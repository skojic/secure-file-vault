// GET and HEAD /api/files/[id]/download. Same checks for both methods (E17). Range is not
// supported: it is ignored and the full file is returned.
import { contentDisposition } from "@/lib/content-disposition";
import { getCurrentUser } from "@/server/auth/current-user";
import { getFileForDownload } from "@/server/files/service";
import { toErrorResponse } from "@/server/http";

async function respond(ctx: RouteContext<"/api/files/[id]/download">, withBody: boolean): Promise<Response> {
  try {
    const { id } = await ctx.params;
    const user = await getCurrentUser();
    const { originalName, contentType, object } = await getFileForDownload(user, id);
    const headers = {
      "Content-Type": contentType,
      "Content-Length": String(object.size),
      "Content-Disposition": contentDisposition(originalName),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
      "Accept-Ranges": "none",
      // Even if a browser rendered it, the response could not run script or load anything.
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
    };
    if (!withBody) {
      await object.stream.cancel();
      return new Response(null, { status: 200, headers });
    }
    return new Response(object.stream, { status: 200, headers });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export function GET(_request: Request, ctx: RouteContext<"/api/files/[id]/download">) {
  return respond(ctx, true);
}

export function HEAD(_request: Request, ctx: RouteContext<"/api/files/[id]/download">) {
  return respond(ctx, false);
}
