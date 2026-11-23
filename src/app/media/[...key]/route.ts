import { getCloudflareContext } from "@opennextjs/cloudflare";
import { isMediaKey } from "@/lib/media";

export async function GET(request: Request, { params }: RouteContext<"/media/[...key]">) {
  const key = (await params).key.join("/");
  if (!isMediaKey(key)) return new Response("Not found", { status: 404 });

  const { env } = await getCloudflareContext({ async: true });
  const object = await env.PHOTOS.get(key, { onlyIf: request.headers });
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("x-content-type-options", "nosniff");
  if (!("body" in object)) return new Response(null, { status: 304, headers });
  return new Response(object.body, { headers });
}
