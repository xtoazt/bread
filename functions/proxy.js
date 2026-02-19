export async function onRequestGet(context) {
    const url = new URL(context.request.url);
    const targetUrl = url.searchParams.get('url');
    
    if (!targetUrl) {
        return new Response(JSON.stringify({ error: 'Missing URL parameter' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    // Validate URL
    try {
        new URL(targetUrl);
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid URL' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    try {
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
            }
        });
        
        if (!response.ok) {
            return new Response(JSON.stringify({ 
                error: `Target server responded with ${response.status}`,
                status: response.status 
            }), {
                status: response.status,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        const contentType = response.headers.get('content-type') || 'text/html';
        let body = await response.text();
        
        if (contentType.includes('text/html')) {
            const targetOrigin = new URL(targetUrl).origin;
            
            // Better URL rewriting
            body = body.replace(
                new RegExp(`(href|src|action|srcset|data-src)=["']([^"']+)["']`, 'g'),
                (match, attr, value) => {
                    if (value.startsWith('http') || value.startsWith('//') || value.startsWith('data:')) {
                        return match;
                    }
                    return `${attr}="${targetOrigin}${value.startsWith('/') ? '' : '/'}${value}"`;
                }
            );
            
            // Add base tag
            body = body.replace(/<head[^>]*>/i, `$&<base href="${targetOrigin}/">`);
            
            // Enhanced proxy script
            body = body.replace('</head>', `
                <script>
                    (function() {
                        const targetOrigin = "${targetOrigin}";
                        
                        // Handle all navigation
                        document.addEventListener('click', function(e) {
                            const link = e.target.closest('a');
                            if (link && link.href) {
                                try {
                                    const url = new URL(link.href, targetOrigin);
                                    if (url.origin === targetOrigin || url.origin === window.location.origin) {
                                        e.preventDefault();
                                        window.location.href = '/proxy?url=' + encodeURIComponent(url.href);
                                    }
                                } catch (err) {
                                    console.warn('URL parsing error:', err);
                                }
                            }
                        });
                        
                        // Handle form submissions
                        document.addEventListener('submit', function(e) {
                            const form = e.target;
                            if (form.action) {
                                try {
                                    const url = new URL(form.action, targetOrigin);
                                    if (url.origin === targetOrigin) {
                                        e.preventDefault();
                                        const formData = new FormData(form);
                                        const params = new URLSearchParams(formData);
                                        window.location.href = '/proxy?url=' + encodeURIComponent(url.href + '?' + params.toString());
                                    }
                                } catch (err) {
                                    console.warn('Form action parsing error:', err);
                                }
                            }
                        });
                        
                        // Remove X-Frame-Options if present
                        if (window.top !== window.self) {
                            try {
                                Object.defineProperty(document, 'domain', {
                                    get: function() { return window.location.hostname; },
                                    set: function() {}
                                });
                            } catch (e) {}
                        }
                    })();
                </script>
                </head>
            `);
        }
        
        return new Response(body, {
            status: response.status,
            headers: {
                'Content-Type': contentType,
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
                'Access-Control-Allow-Headers': '*',
                'X-Content-Type-Options': 'nosniff',
                'X-Frame-Options': 'ALLOWALL',
                'Content-Security-Policy': "frame-ancestors *;",
            }
        });
        
    } catch (error) {
        console.error('Proxy error:', error);
        return new Response(JSON.stringify({ 
            error: 'Proxy service temporarily unavailable',
            details: error.message 
        }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
