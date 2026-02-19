const AD_DOMAINS = [
  "doubleclick.net",
  "googlesyndication.com",
  "google-analytics.com",
  "facebook.com/tr",
  "amazon-adsystem.com",
  "taboola.com",
  "outbrain.com",
  "adservice.google.com",
  "adnxs.com",
  "scorecardresearch.com"
];

const AD_SELECTORS = [
  ".ad", ".ads", ".advertisement", ".sponsor", "#ad", "#ads",
  "[data-ad]", "[data-ads]", "[data-advertisement]",
  "iframe[src*='ad']", "iframe[src*='ads']"
];

function isAdDomain(url) {
  try {
    const host = new URL(url).hostname;
    return AD_DOMAINS.some(d => host.includes(d));
  } catch {
    return false;
  }
}

function injectAdBlock(html) {
  const css = `
    <style>
      ${AD_SELECTORS.join(", ")} {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
      }
    </style>
  `;

  const js = `
    <script>
      const adSelectors = ${JSON.stringify(AD_SELECTORS)};
      const removeAds = () => {
        document.querySelectorAll(adSelectors.join(",")).forEach(el => el.remove());
      };
      removeAds();
      new MutationObserver(removeAds).observe(document, { childList: true, subtree: true });
    </script>
  `;

  return html
    .replace(/<head[^>]*>/i, match => match + css)
    .replace("</body>", js + "</body>");
}

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const target = url.searchParams.get("url");

  if (!target) {
    return new Response("Missing ?url=", { status: 400 });
  }

  if (isAdDomain(target)) {
    return new Response("Blocked", { status: 204 });
  }

  try {
    const upstream = await fetch(target, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "*/*"
      }
    });

    const contentType = upstream.headers.get("content-type") || "";

    if (contentType.includes("text/html")) {
      let html = await upstream.text();
      const base = new URL(target).origin;

      // Fix relative URLs
      html = html.replace(
        /(href|src)=["']([^"']+)["']/g,
        (match, attr, value) => {
          if (value.startsWith("http") || value.startsWith("//") || value.startsWith("data:")) {
            return match;
          }
          return `${attr}="${base}${value.startsWith("/") ? "" : "/"}${value}"`;
        }
      );

      // Add <base>
      html = html.replace(/<head[^>]*>/i, m => `${m}<base href="${base}/">`);

      // Inject adblock
      html = injectAdBlock(html);

      // Proxy navigation
      html += `
        <script>
          document.addEventListener("click", e => {
            const a = e.target.closest("a");
            if (a && a.href) {
              e.preventDefault();
              location.href = "/proxy?url=" + encodeURIComponent(a.href);
            }
          });
        </script>
      `;

      return new Response(html, {
        headers: {
          "Content-Type": "text/html",
          "Access-Control-Allow-Origin": "*",
          "X-Frame-Options": "ALLOWALL",
          "Content-Security-Policy": "frame-ancestors *"
        }
      });
    }

    // Non‑HTML passthrough
    return new Response(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: upstream.headers
    });

  } catch (err) {
    return new Response("Proxy error: " + err.message, { status: 500 });
  }
}
