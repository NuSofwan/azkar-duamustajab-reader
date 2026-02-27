const CACHE_NAME = 'azkar-reader-v18';
const urlsToCache = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json',
    './icon.svg',
    // Only pre-cache the small PDF (493KB). The large PDF (69MB) is too big
    // to pre-cache — it will be cached on-demand after first successful load.
    './th_athkar_assabah_walmasaa.pdf',
    'https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600&family=Inter:wght@400;500;600&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js'
];

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
    );
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // CRITICAL: Pass range requests directly to network.
    // pdf.js uses HTTP Range requests (disableAutoFetch) to load individual
    // pages on demand. The SW must NOT intercept these, otherwise pdf.js
    // cannot do on-demand page loading and has to download the entire file.
    if (event.request.headers.get('range')) {
        return; // Let the browser handle it naturally
    }

    // PDF files: cache-first, then network (with on-demand caching)
    if (url.pathname.endsWith('.pdf')) {
        event.respondWith(
            caches.match(event.request)
                .then(cachedResponse => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    return fetch(event.request).then(response => {
                        // Cache the response for offline use
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, responseClone);
                        });
                        return response;
                    });
                })
        );
        return;
    }

    // Other assets: cache-first, then network
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                return fetch(event.request);
            })
    );
});

self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        Promise.all([
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheWhitelist.indexOf(cacheName) === -1) {
                            return caches.delete(cacheName);
                        }
                    })
                );
            }),
            self.clients.claim()
        ])
    );
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
    event.notification.close();

    // This looks to see if the current is already open and focuses if it is
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            const targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : '/';
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                // If so, just focus it.
                if (client.url === targetUrl && 'focus' in client) {
                    return client.focus();
                }
            }
            // If not, open a new window
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
