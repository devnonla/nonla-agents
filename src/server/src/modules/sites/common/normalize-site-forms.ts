/**
 * Normalize POST forms for the site host.
 * action stays empty so srcDoc / iframe never navigates to /public/sites/… (white screen).
 * data-site-path records the logical public path; the host rewrites the Request URL server-side.
 * Explicit method="get" forms (search) are left unchanged.
 */
export function normalizeSiteFormActions(html: string, publicPath: string): string {
  const path = publicPath.startsWith("/") ? publicPath : `/${publicPath}`;
  return html.replace(/<form\b([^>]*)>/gi, (full, attrs: string) => {
    const methodMatch = attrs.match(/\smethod\s*=\s*(["']?)(\w+)\1/i);
    if (methodMatch && methodMatch[2].toLowerCase() === "get") return full;

    let next = attrs.replace(/\saction\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    next = next.replace(/\sdata-site-path\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    if (/\smethod\s*=/i.test(next)) {
      next = next.replace(/\smethod\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, ' method="post"');
    } else {
      next += ' method="post"';
    }
    if (!/\sdata-site-action\b/i.test(next)) {
      next += " data-site-action";
    }
    next += ` data-site-path="${path}" action=""`;
    return `<form${next}>`;
  });
}

/** Rebuild the inbound Request so loader/action see the public site URL, not /api/…. */
export async function rewriteRequestToSitePath(request: Request, publicPath: string): Promise<Request> {
  const path = publicPath.startsWith("/") ? publicPath : `/${publicPath}`;
  const incoming = new URL(request.url);
  const pageUrl = new URL(path, "http://site.local");
  pageUrl.search = incoming.search;
  const headers = new Headers(request.headers);
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
  return new Request(pageUrl.toString(), {
    method: request.method,
    headers,
    body: body && body.byteLength > 0 ? body : undefined,
  });
}
