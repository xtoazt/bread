export async function onRequestGet(context) {
    const url = new URL(context.request.url);
    const targetUrl = url.searchParams.get('url');
    
    if (!targetUrl) {
        return new Response('Missing URL parameter', { status: 400 });
    }
    
    try {
        // Fetch the target URL
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            }
        });
        
        // Get response content
        const contentType = response.headers.get('content-type') || 'text/html';
        let body = await response.text();
        
        // Modify HTML to handle relative URLs and add CORS headers
        if (contentType.includes('text/html')) {
            // Convert relative URLs to absolute
            body = body.replace(
                /(href|src|action)=["']\/([^"']+)["']/g,
                `$1="${new URL(targetUrl).origin}/$2"`
            );
            
            // Add base tag for relative URLs
            if (!body.includes('<base')) {
                body = body.replace('<head>', `<head><base href="${new URL(targetUrl).origin}">`);
            }
            
            // Inject our proxy script for handling links
            body = body.replace('</head>', `
                <script>
                    document.addEventListener('click', function(e) {
                        const link = e.target.closest('a');
                        if (link && link.href) {
                            e.preventDefault();
                            window.location.href = '/proxy?url=' + encodeURIComponent(link.href);
                        }
                    });
                </script>
                </head>
            `);
        }
        
        // Return modified content
        return new Response(body, {
            status: response.status,
            headers: {
                'Content-Type': contentType,
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': '*',
            }
        });
        
    } catch (error) {
        return new Response(`Proxy error: ${error.message}`, { status: 500 });
    }
}
