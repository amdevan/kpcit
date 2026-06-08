import app from "../src/server";

export const config = {
  runtime: "nodejs",
};

export default async function handler(request: Request): Promise<Response> {
  // When Vercel routes everything to this function, it may rewrite the path.
  // Try to recover the original path so TanStack Router can match routes correctly.
  const url = new URL(request.url);
  const matched = request.headers.get("x-matched-path");
  if (matched && matched.startsWith("/")) {
    url.pathname = matched;
  }

  // Vercel Edge doesn't provide Cloudflare-style env/ctx; pass empty objects.
  return app.fetch(new Request(url.toString(), request), {}, {});
}
