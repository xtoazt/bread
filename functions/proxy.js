const AD_RULES = [
  'doubleclick.net', 'googlesyndication.com', 'google-analytics.com',
  'facebook.com/tr', 'amazon-adsystem.com', 'taboola.com', 'outbrain.com',
  '.ad', '.ads', '.advertisement', '#ad', '#ads', '[data-ad]', '/ads/', '/tracking'
];

function shouldBlock(url) {
  try {
    const domain = new URL(url).hostname.toLowerCase();
    return AD_RULES.some(rule => domain.includes(rule) || url.toLowerCase().includes(rule));
  } catch { return false; }
}

function injectAdBlock(html) {
  const css = `<style>${AD_RULES.join(',')} {display:none!important;}</style>`;
  const js = `<script>
    const adSelectors = ${JSON.stringify(AD_RULES)};
    new MutationObserver(() => 
      document.querySelectorAll(adSelectors.join(',')).forEach(el => el.remove())
    ).observe(document, {childList:true,subtree:true});
    document.querySelectorAll(adSelectors.join(',')).forEach(el => el.remove());
  </script>`;
  return html.replace(/<head>/i, `$&${css}`).replace('</body>', `${js}</body>`);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Handle static files directly
    if (!url.pathname.startsWith('/proxy')) {
      return new Response('Static file not found', { status: 404 });
    }
    
    const target = url.searchParams.get('url');
    
    if (!target) return new Response('Missing URL', {status: 400});
    if (shouldBlock(target)) return new Response('Blocked', {status: 204});
    
    try {
      const res = await fetch(target, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        }
      });
      
      if (!res.ok) return new Response(`Error ${res.status}`, {status: res.status});
      
      const contentType = res.headers.get('content-type') || '';
      
      if (contentType.includes('text/html')) {
        let html = await res.text();
        const base = new URL(target).origin;
        
        // Rewrite URLs to stay in proxy
        html = html.replace(
          /(href|src|action|srcset|data-src)=["']([^"']+)["']/g,
          (match, attr, value) => {
            if (value.startsWith('http') || value.startsWith('//') || value.startsWith('data:')) {
              return match;
            }
            return `${attr}="${base}${value.startsWith('/') ? '' : '/'}${value}"`;
          }
        );
        
        // Add base tag and proxy navigation script
        html = html.replace(/<head[^>]*>/i, `$&<base href="${base}/">`);
        
        // Inject AdBlock
        html = injectAdBlock(html);
        
        // Add proxy navigation handler
        const proxyScript = `<script>
          document.addEventListener('click', e => {
            const a = e.target.closest('a');
            if (a && a.href) {
              e.preventDefault();
              location.href = '/proxy?url=' + encodeURIComponent(a.href);
            }
          });
          document.addEventListener('submit', e => {
            const f = e.target;
            if (f.action) {
              e.preventDefault();
              const data = new FormData(f);
              location.href = '/proxy?url=' + encodeURIComponent(f.action + '?' + new URLSearchParams(data));
            }
          });
        </script>`;
        html = html.replace('</body>', `${proxyScript}</body>`);
        
        return new Response(html, {
          headers: {
            'Content-Type': 'text/html',
            'Access-Control-Allow-Origin': '*',
            'X-Frame-Options': 'ALLOWALL',
            'Content-Security-Policy': "frame-ancestors *;"
          }
        });
      }
      
      // Handle non-HTML content
      const body = await res.arrayBuffer();
      const headers = {};
      for (const [key, value] of res.headers.entries()) {
        if (!key.toLowerCase().includes('content-security-policy') && 
            !key.toLowerCase().includes('x-frame-options')) {
          headers[key] = value;
        }
      }
      
      return new Response(body, {
        status: res.status,
        headers
      });
      
    } catch (err) {
      console.error('Proxy error:', err);
      return new Response(JSON.stringify({error: 'Proxy failed'}), {
        status: 503,
        headers: {'Content-Type': 'application/json'}
      });
    }
  }
};
