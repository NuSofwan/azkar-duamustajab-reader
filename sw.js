const CACHE_NAME = 'dua-mustajab-v25';
const urlsToCache = [
    './',
    './index.html',
    './install.html',
    './style.css',
    './script.js',
    './manifest.json',
    './icon.svg',
    './icon-192.png',
    './icon-512.png',
    './icon-maskable-512.png',
    './apple-touch-icon-180.png',
    './og-card.png',
    './splash-iphone-1290x2796.png',
    './splash-iphone-1179x2556.png',
    './splash-iphone-1170x2532.png',
    './splash-iphone-1125x2436.png',
    './splash-ipad-2048x2732.png',
    './splash-ipad-landscape-2732x2048.png',
    // Only pre-cache the small PDF (493KB). The large PDF (69MB) is too big
    // to pre-cache — it will be cached on-demand after first successful load.
    './th_athkar_assabah_walmasaa.pdf',
    'https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600&family=Inter:wght@400;500;600&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js'
];

self.addEventListener('install', event => {
    // Do NOT call skipWaiting() here.
    // Immediately activating a new SW while a page is open can cause iOS Safari
    // to treat the controller change as a navigation event, triggering a
    // back-animation ("bounce back"). Instead, the new SW waits until the JS
    // update dialog is accepted, then receives a SKIP_WAITING message.
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                // Cache each URL independently so one failure (e.g. a CDN being
                // momentarily unreachable) does not abort the whole install,
                // which would leave the app without a working service worker.
                return Promise.all(
                    urlsToCache.map(url =>
                        cache.add(url).catch(err =>
                            console.warn('SW precache skipped:', url, err)
                        )
                    )
                );
            })
    );
});

// Allow the page JS to trigger skipWaiting once the user has accepted the update.
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
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
