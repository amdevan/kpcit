import app from "../src/server";

type HeadersInit = Record<string, string | string[] | undefined>;

function getUrl(req: { headers: HeadersInit; url?: string }) {
  const host =
    (Array.isArray(req.headers.host) ? req.headers.host[0] : req.headers.host) ??
    "localhost";
  const proto =
    (Array.isArray(req.headers["x-forwarded-proto"])
      ? req.headers["x-forwarded-proto"][0]
      : req.headers["x-forwarded-proto"]) ?? "https";
  const url = req.url ?? "/";
  return `${proto}://${host}${url}`;
}

function toHeaders(reqHeaders: HeadersInit): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(reqHeaders)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }
  return headers;
}

async function readBody(req: {
  method?: string;
  on: (event: "data" | "end" | "error", cb: (arg?: unknown) => void) => void;
}): Promise<Uint8Array | undefined> {
  const method = (req.method ?? "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") return undefined;

  const chunks: Uint8Array[] = [];
  await new Promise<void>((resolve, reject) => {
    req.on("data", (chunk) => {
      if (typeof chunk === "string") {
        chunks.push(new TextEncoder().encode(chunk));
      } else if (chunk instanceof Uint8Array) {
        chunks.push(chunk);
      } else {
        chunks.push(new Uint8Array(chunk as ArrayBuffer));
      }
    });
    req.on("end", () => resolve());
    req.on("error", (err) => reject(err));
  });

  if (chunks.length === 0) return undefined;
  const total = chunks.reduce((acc, c) => acc + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

export default async function handler(req: any, res: any) {
  const url = new URL(getUrl(req));
  const matched = req.headers?.["x-matched-path"];
  if (typeof matched === "string" && matched.startsWith("/")) {
    url.pathname = matched;
  }

  const headers = toHeaders(req.headers ?? {});
  const bodyBytes = await readBody(req);
  const body = bodyBytes === undefined ? undefined : (bodyBytes as any);

  const request = new Request(url.toString(), {
    method: req.method,
    headers,
    body,
  });

  const response = await app.fetch(request, {}, {});

  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    try {
      res.setHeader(key, value);
    } catch {}
  });

  const buf = new Uint8Array(await response.arrayBuffer());
  res.end(buf as any);
}
