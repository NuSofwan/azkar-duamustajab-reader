document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const navToggle = document.querySelector('.nav-toggle');
    const mobileMenu = document.querySelector('.mobile-menu');
    const bookBtnsDesktop = document.querySelectorAll('.nav-links .book-btn');
    const bookBtnsMobile = document.querySelectorAll('.mobile-menu .book-btn');
    const themeToggle = document.querySelector('.theme-toggle');
    const themeIcon = themeToggle.querySelector('i');

    const placeholder = document.getElementById('placeholder');
    const pdfContainer = document.getElementById('pdfContainer');
    const sidebar = document.getElementById('sidebar');
    const closeSidebarBtn = document.getElementById('closeSidebar');

    const prevPageBtn = document.getElementById('prevPage');
    const nextPageBtn = document.getElementById('nextPage');
    const zoomInBtn = document.getElementById('zoomIn');
    const zoomOutBtn = document.getElementById('zoomOut');
    const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
    const navModeBtn = document.getElementById('navModeBtn');
    const navModeIcon = navModeBtn.querySelector('i');

    const pageNumSelect = document.getElementById('pageNumSelect');
    const pageCountSpan = document.getElementById('pageCount');
    const pdfCanvas = document.getElementById('pdfCanvas');
    const pdfCtx = pdfCanvas.getContext('2d');
    const pdfViewerWrapper = document.getElementById('pdfViewerWrapper');
    const pdfPageContainer = document.getElementById('pdfPageContainer');
    const textLayerDiv = document.getElementById('textLayer');
    const highlightCanvas = document.getElementById('highlightLayer');
    const highlightCtx = highlightCanvas.getContext('2d');

    const addBookmarkBtn = document.getElementById('addBookmarkBtn');
    const bookmarksList = document.getElementById('bookmarksList');
    const notePageNum = document.getElementById('notePageNum');
    const pageNoteInput = document.getElementById('pageNoteInput');
    const saveNoteBtn = document.getElementById('saveNoteBtn');
    const noteSaveStatus = document.getElementById('noteSaveStatus');
    const notesHistoryList = document.getElementById('notesHistoryList');

    // Phase 4 & 5 Extra Elements
    const highlightTools = document.getElementById('highlightTools');
    const toggleHighlightModeBtn = document.getElementById('toggleHighlightModeBtn');
    const closeHighlightModeBtn = document.getElementById('closeHighlightModeBtn');
    const hlUndoBtn = document.getElementById('hlUndoBtn');
    const hlEraserBtn = document.getElementById('hlEraserBtn');



    // Phase 3 & 4 Pro Features Elements
    const tasbihBtn = document.getElementById('tasbihBtn');
    const tasbihCountSpan = document.getElementById('tasbihCount');
    const tasbihResetBtn = document.getElementById('tasbihReset');
    const streakCard = document.getElementById('streakCard');
    const streakIcon = document.getElementById('streakIcon');
    const streakCountSpan = document.getElementById('streakCount');
    const streakText = document.getElementById('streakText');
    const notificationToggle = document.getElementById('notificationToggle');

    // --- State variables ---
    let currentBook = 'th_athkar_assabah_walmasaa.pdf';
    let pdfDoc = null;
    let pageNum = 1;
    let pageRendering = false;
    let pageNumPending = null;
    let scale = 1.3; // Allow zooming

    // Freehand Highlight State
    let isHighlightMode = false;
    let isDrawing = false;
    let currentHighlightColor = 'rgba(255, 255, 0, 0.6)';
    let isEraserMode = false;
    let currentStroke = []; // Array of {x, y}
    let strokeWidth = parseInt(localStorage.getItem('hlStrokeWidth') || '20');

    // Text Selection State
    let selectedText = '';
    let selectedTextRect = null;

    // Navigation mode: 'scroll' or 'swipe'
    let navMode = localStorage.getItem('navMode') || 'scroll';

    // Page-level canvas cache for instant page revisits (in-memory)
    // Key: `${bookName}_${pageNum}_${scale}`, Value: ImageBitmap
    const pageCanvasCache = {};

    // --- IndexedDB Page Image Cache ---
    // Caches rendered pages as JPEG blobs in IndexedDB for instant loading
    // across sessions. Much faster than re-downloading/rendering from PDF.
    const IDB_NAME = 'azkar_page_cache';
    const IDB_STORE = 'pages';
    const IDB_VERSION = 1;
    let idb = null;

    const openIDB = () => {
        return new Promise((resolve, reject) => {
            if (idb) { resolve(idb); return; }
            const req = indexedDB.open(IDB_NAME, IDB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(IDB_STORE)) {
                    db.createObjectStore(IDB_STORE);
                }
            };
            req.onsuccess = (e) => { idb = e.target.result; resolve(idb); };
            req.onerror = () => reject(req.error);
        });
    };

    const idbSavePage = (bookName, pageNum, canvas, cssW, cssH) => {
        const key = `${bookName}_p${pageNum}_s${scale}`;
        canvas.toBlob((blob) => {
            if (!blob) return;
            openIDB().then(db => {
                const tx = db.transaction(IDB_STORE, 'readwrite');
                tx.objectStore(IDB_STORE).put({ blob, cssW, cssH }, key);
            }).catch(() => { });
        }, 'image/jpeg', 0.85);
    };

    const idbLoadPage = (bookName, pageNum) => {
        const key = `${bookName}_p${pageNum}_s${scale}`;
        return openIDB().then(db => {
            return new Promise((resolve, reject) => {
                const tx = db.transaction(IDB_STORE, 'readonly');
                const req = tx.objectStore(IDB_STORE).get(key);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => reject(req.error);
            });
        }).catch(() => null);
    };

    // Draw a cached page image onto the main canvas
    const drawCachedImage = (data) => {
        return new Promise((resolve) => {
            const url = URL.createObjectURL(data.blob);
            const img = new Image();
            img.onload = () => {
                pdfCanvas.width = img.width;
                pdfCanvas.height = img.height;
                pdfCanvas.style.width = data.cssW + 'px';
                pdfCanvas.style.height = data.cssH + 'px';
                pdfPageContainer.style.width = data.cssW + 'px';
                pdfPageContainer.style.height = data.cssH + 'px';

                // Sync the highlight layer!
                highlightCanvas.width = img.width;
                highlightCanvas.height = img.height;
                highlightCanvas.style.width = data.cssW + 'px';
                highlightCanvas.style.height = data.cssH + 'px';

                pdfCtx.drawImage(img, 0, 0);
                URL.revokeObjectURL(url);
                resolve();
            };
            img.onerror = () => { URL.revokeObjectURL(url); resolve(); };
            img.src = url;
        });
    };

    // Smart output scale: caps canvas size to avoid exceeding browser limits
    const MAX_CANVAS_DIM = 4096;
    const getOutputScale = (viewportWidth, viewportHeight) => {
        const dpr = window.devicePixelRatio || 1;
        const idealScale = Math.max(dpr, 2);
        const maxScaleW = MAX_CANVAS_DIM / viewportWidth;
        const maxScaleH = MAX_CANVAS_DIM / viewportHeight;
        return Math.min(idealScale, maxScaleW, maxScaleH);
    };

    // Helper for Local Storage Keys
    const getStorageKey = (type) => `${type}_${currentBook}`;

    // --- Basic UI ---
    navToggle.addEventListener('click', () => { mobileMenu.classList.toggle('open'); });

    if (localStorage.getItem('theme') === 'dark') {
        document.body.setAttribute('data-theme', 'dark');
        themeIcon.classList.replace('fa-moon', 'fa-sun');
    }
    themeToggle.addEventListener('click', () => {
        if (document.body.getAttribute('data-theme') === 'dark') {
            document.body.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
            themeIcon.classList.replace('fa-sun', 'fa-moon');
        } else {
            document.body.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            themeIcon.classList.replace('fa-moon', 'fa-sun');
        }
    });

    closeSidebarBtn.addEventListener('click', () => sidebar.classList.remove('open'));
    toggleSidebarBtn.addEventListener('click', () => sidebar.classList.toggle('open'));

    // --- Navigation Mode Toggle ---
    const updateNavModeUI = () => {
        if (navMode === 'scroll') {
            navModeIcon.className = 'fa-solid fa-arrows-up-down';
            navModeBtn.title = 'โหมดเลื่อนหน้า: เลื่อนลง (กดเพื่อเปลี่ยนเป็นปัดขวา)';
            pdfViewerWrapper.classList.remove('swipe-mode');
            pdfViewerWrapper.classList.add('scroll-mode');
        } else {
            navModeIcon.className = 'fa-solid fa-arrows-left-right';
            navModeBtn.title = 'โหมดเลื่อนหน้า: ปัดซ้าย-ขวา (กดเพื่อเปลี่ยนเป็นเลื่อนลง)';
            pdfViewerWrapper.classList.remove('scroll-mode');
            pdfViewerWrapper.classList.add('swipe-mode');
        }
    };
    updateNavModeUI();

    navModeBtn.addEventListener('click', () => {
        navMode = navMode === 'scroll' ? 'swipe' : 'scroll';
        localStorage.setItem('navMode', navMode);
        updateNavModeUI();
    });

    // --- PDF Rendering (Phase 2) ---
    let currentRenderVersion = 0; // Incremented on each render to discard stale results

    const applyCanvasDimensions = (backingW, backingH, cssW, cssH) => {
        pdfCanvas.width = backingW;
        pdfCanvas.height = backingH;
        pdfCanvas.style.width = cssW + 'px';
        pdfCanvas.style.height = cssH + 'px';
        pdfPageContainer.style.width = cssW + 'px';
        pdfPageContainer.style.height = cssH + 'px';
        highlightCanvas.width = backingW;
        highlightCanvas.height = backingH;
        highlightCanvas.style.width = cssW + 'px';
        highlightCanvas.style.height = cssH + 'px';
    };

    const renderPage = (num) => {
        pageRendering = true;
        currentRenderVersion++;
        const thisVersion = currentRenderVersion;

        // Helper: finish rendering and process pending
        const finishRender = () => {
            pageRendering = false;
            if (pageNumPending !== null) {
                const pending = pageNumPending;
                pageNumPending = null;
                renderPage(pending);
            }
        };

        // Helper: check if this render is still valid
        const isStale = () => thisVersion !== currentRenderVersion;

        // Check in-memory cache first (instant)
        const cacheKey = `${currentBook}_${num}_${scale}`;
        if (pageCanvasCache[cacheKey]) {
            const cached = pageCanvasCache[cacheKey];
            applyCanvasDimensions(cached.bitmap.width, cached.bitmap.height, cached.cssWidth, cached.cssHeight);
            pdfCtx.imageSmoothingEnabled = true;
            pdfCtx.imageSmoothingQuality = 'high';
            pdfCtx.drawImage(cached.bitmap, 0, 0);
            loadHighlights(num);

            // Update UI
            pageNumSelect.value = num;
            notePageNum.textContent = num;
            loadNoteForCurrentPage();
            updateNotesHistoryList();
            if (!isHighlightMode) highlightTools.style.display = 'none';

            finishRender();

            // Load text layer in background
            if (pdfDoc) {
                pdfDoc.getPage(num).then(page => {
                    if (isStale()) return;
                    const viewport = page.getViewport({ scale });
                    return page.getTextContent().then(tc => { if (!isStale()) buildTextLayer(tc, viewport); });
                }).catch(() => { });
            }
            return;
        }

        // Update UI immediately (even before async loads)
        pageNumSelect.value = num;
        notePageNum.textContent = num;
        loadNoteForCurrentPage();
        updateNotesHistoryList();
        if (!isHighlightMode) highlightTools.style.display = 'none';

        // Try IndexedDB cache, then fall back to full PDF render
        const bookForRender = currentBook;
        idbLoadPage(currentBook, num).then(cached => {
            if (isStale()) { finishRender(); return; }

            if (cached && currentBook === bookForRender) {
                // Draw from IndexedDB cache
                return drawCachedImage(cached).then(() => {
                    if (isStale()) { finishRender(); return; }
                    loadHighlights(num);
                    finishRender();
                    // Load text layer in background
                    if (pdfDoc) {
                        pdfDoc.getPage(num).then(page => {
                            if (isStale()) return;
                            const viewport = page.getViewport({ scale });
                            return page.getTextContent().then(tc => { if (!isStale()) buildTextLayer(tc, viewport); });
                        }).catch(() => { });
                    }
                });
            }

            // No cache — render from PDF
            if (!pdfDoc) { finishRender(); return; }
            return pdfDoc.getPage(num).then((page) => {
                if (isStale()) { finishRender(); return; }

                const viewport = page.getViewport({ scale });
                const outputScale = getOutputScale(viewport.width, viewport.height);
                const finalWidth = Math.floor(viewport.width * outputScale);
                const finalHeight = Math.floor(viewport.height * outputScale);
                const cssW = Math.floor(viewport.width);
                const cssH = Math.floor(viewport.height);

                // Create offscreen canvas for rendering (keeps old image visible)
                const offCanvas = document.createElement('canvas');
                offCanvas.width = finalWidth;
                offCanvas.height = finalHeight;
                const offCtx = offCanvas.getContext('2d');
                offCtx.imageSmoothingEnabled = true;
                offCtx.imageSmoothingQuality = 'high';

                const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

                return page.render({ canvasContext: offCtx, transform, viewport }).promise.then(() => {
                    if (isStale()) { finishRender(); return; }

                    // Apply offscreen buffer to real canvas
                    applyCanvasDimensions(finalWidth, finalHeight, cssW, cssH);
                    pdfCtx.imageSmoothingEnabled = true;
                    pdfCtx.imageSmoothingQuality = 'high';
                    pdfCtx.drawImage(offCanvas, 0, 0);
                    loadHighlights(num);

                    // Cache in memory
                    createImageBitmap(offCanvas).then(bitmap => {
                        pageCanvasCache[cacheKey] = { bitmap, cssWidth: cssW, cssHeight: cssH };
                    }).catch(() => { });
                    // Cache in IndexedDB
                    idbSavePage(currentBook, num, offCanvas, cssW, cssH);

                    finishRender();
                    return page.getTextContent();
                }).then(textContent => {
                    if (textContent && textContent.items && !isStale()) {
                        buildTextLayer(textContent, viewport);
                    }
                });
            });
        }).catch(err => {
            console.error("renderPage error:", err);
            finishRender();
        });
    };

    // Helper: build text layer from text content
    const buildTextLayer = (textContent, viewport) => {
        textLayerDiv.innerHTML = '';
        textContent.items.forEach(textItem => {
            const span = document.createElement('span');
            span.textContent = textItem.str;

            const tx = textItem.transform;
            const fontHeight = Math.sqrt((tx[2] * tx[2]) + (tx[3] * tx[3])) * scale;
            const x = tx[4] * scale;
            const y = viewport.height - (tx[5] * scale) - fontHeight;

            span.style.left = x + 'px';
            span.style.top = y + 'px';
            span.style.fontSize = fontHeight + 'px';

            textLayerDiv.appendChild(span);
        });
    };

    const queueRenderPage = (num) => {
        if (pageRendering) {
            pageNumPending = num;
        } else {
            renderPage(num);
        }
    };

    const onPrevPage = () => {
        if (pageNum <= 1) return;
        pageNum--;
        queueRenderPage(pageNum);
    };

    const onNextPage = () => {
        if (pageNum >= pdfDoc.numPages) return;
        pageNum++;
        queueRenderPage(pageNum);
    };

    prevPageBtn.addEventListener('click', onPrevPage);
    nextPageBtn.addEventListener('click', onNextPage);

    // Handle Dropdown Change
    pageNumSelect.addEventListener('change', (e) => {
        const selectedPage = parseInt(e.target.value);
        if (selectedPage >= 1 && selectedPage <= pdfDoc.numPages) {
            pageNum = selectedPage;
            queueRenderPage(pageNum);
        }
    });

    zoomInBtn.addEventListener('click', () => {
        scale = Math.round((scale + 0.2) * 10) / 10;
        // Force immediate render — the version counter discards stale results
        pageRendering = false;
        pageNumPending = null;
        renderPage(pageNum);
    });
    zoomOutBtn.addEventListener('click', () => {
        if (scale > 0.5) {
            scale = Math.round((scale - 0.2) * 10) / 10;
            pageRendering = false;
            pageNumPending = null;
            renderPage(pageNum);
        }
    });

    // Phase 2 Fix: Cache loaded PDF documents to make tab switching instant
    const pdfCache = {};
    // Track background preload promises so we can await them when switching
    const pdfPreloadPromises = {};

    // Background pre-render pages into IndexedDB cache
    // Renders pages sequentially in the background so future page views are instant
    let bgRenderQueue = [];
    let bgRendering = false;

    const bgRenderNext = () => {
        if (bgRendering || bgRenderQueue.length === 0) return;
        const task = bgRenderQueue.shift();
        const { bookName, pdfDocument, pageNum: pNum, priority } = task;
        const cacheKey = `${bookName}_${pNum}_${scale}`;
        if (pageCanvasCache[cacheKey]) { bgRenderNext(); return; }

        // Check IndexedDB first
        idbLoadPage(bookName, pNum).then(cached => {
            if (cached) {
                // Still save to memory cache for instant in-session access
                const url = URL.createObjectURL(cached.blob);
                const img = new Image();
                img.onload = () => {
                    createImageBitmap(img).then(bitmap => {
                        pageCanvasCache[cacheKey] = { bitmap, cssWidth: cached.cssW, cssHeight: cached.cssH };
                    }).catch(() => { });
                    URL.revokeObjectURL(url);
                    bgRenderNext();
                };
                img.onerror = () => { URL.revokeObjectURL(url); bgRenderNext(); };
                img.src = url;
                return;
            }

            bgRendering = true;
            pdfDocument.getPage(pNum).then(page => {
                const viewport = page.getViewport({ scale: scale });
                const outputScale = getOutputScale(viewport.width, viewport.height);
                const offCanvas = document.createElement('canvas');
                offCanvas.width = Math.floor(viewport.width * outputScale);
                offCanvas.height = Math.floor(viewport.height * outputScale);
                const offCtx = offCanvas.getContext('2d');
                offCtx.imageSmoothingEnabled = true;
                offCtx.imageSmoothingQuality = 'high';
                const transform = [outputScale, 0, 0, outputScale, 0, 0];
                return page.render({ canvasContext: offCtx, transform, viewport }).promise.then(() => {
                    // Save to IndexedDB
                    idbSavePage(bookName, pNum, offCanvas, Math.floor(viewport.width), Math.floor(viewport.height));
                    // Also cache in memory
                    createImageBitmap(offCanvas).then(bitmap => {
                        pageCanvasCache[cacheKey] = { bitmap, cssWidth: Math.floor(viewport.width), cssHeight: Math.floor(viewport.height) };
                    }).catch(() => { });
                }).catch(err => console.warn("BgRender Cancelled:", err));
            }).then(() => {
                bgRendering = false;
                // Priority pages render faster (10ms), background pages slower (30ms)
                const delay = priority ? 10 : 30;
                setTimeout(bgRenderNext, delay);
            }).catch(err => {
                console.warn("BgRender getPage Error:", err);
                bgRendering = false;
                setTimeout(bgRenderNext, 100);
            });
        });
    };

    const prerenderPages = (bookName, pdfDocument, startPage, endPage, priority = false) => {
        for (let i = startPage; i <= Math.min(endPage, pdfDocument.numPages); i++) {
            bgRenderQueue.push({ bookName, pdfDocument, pageNum: i, priority });
        }
        bgRenderNext();
    };

    // Helper: load file via XMLHttpRequest (works with file:// protocol)
    const loadFileAsArrayBuffer = (url) => {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.responseType = 'arraybuffer';
            xhr.onload = () => {
                if (xhr.status === 200 || xhr.status === 0) {
                    resolve(xhr.response);
                } else {
                    reject(new Error('XHR failed: ' + xhr.status));
                }
            };
            xhr.onerror = () => reject(new Error('XHR network error'));
            xhr.send();
        });
    };

    const onPDFLoaded = (bookName, pdfDoc_) => {
        pdfCache[bookName] = pdfDoc_;
        if (currentBook === bookName) {
            pdfDoc = pdfDoc_;
            pageCountSpan.textContent = pdfDoc.numPages;

            // Populate Dropdown Options
            pageNumSelect.innerHTML = '';
            for (let i = 1; i <= pdfDoc.numPages; i++) {
                const opt = document.createElement('option');
                opt.value = i;
                opt.textContent = i;
                pageNumSelect.appendChild(opt);
            }

            pageNum = 1;
            renderPage(pageNum);
            loadBookmarks();
            // Priority pre-render first 5 pages for instant navigation
            prerenderPages(bookName, pdfDoc_, 2, 5, true);
            // Then pages 6-15 quickly
            prerenderPages(bookName, pdfDoc_, 6, 15);
            // Rest after a short delay
            setTimeout(() => prerenderPages(bookName, pdfDoc_, 16, pdfDoc_.numPages), 500);
        } else {
            // Pre-render first 5 pages of non-active book with priority
            prerenderPages(bookName, pdfDoc_, 1, 5, true);
            prerenderPages(bookName, pdfDoc_, 6, 10);
        }
    };

    // Helper: load PDF via file picker (fallback for file:// protocol)
    const loadPDFViaFilePicker = (bookName) => {
        return new Promise((resolve, reject) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.pdf';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) { reject(new Error('No file selected')); return; }
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(new Error('FileReader error'));
                reader.readAsArrayBuffer(file);
            };
            input.click();
        });
    };

    const onPDFError = (bookName, err) => {
        console.error('PDF load error:', err);
        if (currentBook === bookName) {
            pdfContainer.style.display = 'none';
            placeholder.style.display = 'flex';

            const isFileProtocol = window.location.protocol === 'file:';

            if (isFileProtocol) {
                placeholder.innerHTML = `
                    <i class="fa-solid fa-triangle-exclamation empty-icon" style="color: var(--accent);"></i>
                    <h2>ไม่สามารถโหลด PDF ได้</h2>
                    <p style="max-width:500px;text-align:center;margin-bottom:1rem;">เบราว์เซอร์บล็อกการเข้าถึงไฟล์ PDF เมื่อเปิดจาก file:// <br>กรุณาเลือกวิธีใดวิธีหนึ่ง:</p>
                    <div style="display:flex;flex-direction:column;gap:0.75rem;align-items:center;">
                        <button id="filePickerBtn" style="padding:0.75rem 1.5rem;background:var(--accent);color:white;border:none;border-radius:8px;font-size:1rem;cursor:pointer;font-family:inherit;">
                            <i class="fa-solid fa-folder-open"></i> เลือกไฟล์ ${bookName} ด้วยตนเอง
                        </button>
                        <p style="font-size:0.85rem;color:var(--text-secondary);max-width:400px;text-align:center;">
                            หรือ ดับเบิลคลิกไฟล์ <strong>start_server.bat</strong> ในโฟลเดอร์เดียวกัน<br>เพื่อเปิดแอปผ่าน local server (แนะนำ)
                        </p>
                    </div>`;

                document.getElementById('filePickerBtn').addEventListener('click', () => {
                    loadPDFViaFilePicker(bookName).then(data => {
                        return pdfjsLib.getDocument({
                            data: data,
                            cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/cmaps/',
                            cMapPacked: true,
                        }).promise;
                    }).then(pdfDoc_ => {
                        onPDFLoaded(bookName, pdfDoc_);
                        placeholder.style.display = 'none';
                        pdfContainer.style.display = 'flex';
                    }).catch(err2 => {
                        console.error('File picker load failed:', err2);
                    });
                });
            } else {
                placeholder.innerHTML = `<i class="fa-solid fa-triangle-exclamation empty-icon" style="color: var(--accent);"></i><h2>เกิดข้อผิดพลาด</h2><p>ไม่สามารถเปิดไฟล์ PDF ได้</p><p style="font-size:0.8rem;color:var(--text-secondary);">${bookName}</p>`;
            }
        }
    };

    // Preload a PDF in the background (returns a promise, stores it for reuse)
    // Uses disableAutoFetch so pdf.js uses HTTP range requests to fetch only
    // what's needed (PDF structure + requested page data) instead of the entire file.
    const preloadPDF = (bookName) => {
        if (pdfCache[bookName]) return Promise.resolve(pdfCache[bookName]);
        if (pdfPreloadPromises[bookName]) return pdfPreloadPromises[bookName];

        const pdfUrl = './' + bookName;
        const promise = pdfjsLib.getDocument({
            url: pdfUrl,
            disableAutoFetch: true,
            disableStream: false,
            cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/cmaps/',
            cMapPacked: true,
        }).promise.then(pdfDoc_ => {
            pdfCache[bookName] = pdfDoc_;
            // Pre-render first 5 pages with priority
            prerenderPages(bookName, pdfDoc_, 1, 5, true);
            prerenderPages(bookName, pdfDoc_, 6, 10);
            return pdfDoc_;
        }).catch(err => {
            console.warn('Range-request PDF load failed, trying full download...', err);
            return loadFileAsArrayBuffer(pdfUrl).then(data => {
                return pdfjsLib.getDocument({
                    data: data,
                    cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/cmaps/',
                    cMapPacked: true,
                }).promise;
            }).then(pdfDoc_ => {
                pdfCache[bookName] = pdfDoc_;
                prerenderPages(bookName, pdfDoc_, 1, 5, true);
                prerenderPages(bookName, pdfDoc_, 6, 10);
                return pdfDoc_;
            });
        });
        pdfPreloadPromises[bookName] = promise;
        return promise;
    };

    const loadPDF = (bookName) => {
        if (pdfCache[bookName]) {
            // Instant load from cache
            pdfDoc = pdfCache[bookName];
            pageCountSpan.textContent = pdfDoc.numPages;

            // Populate Dropdown Options
            pageNumSelect.innerHTML = '';
            for (let i = 1; i <= pdfDoc.numPages; i++) {
                const opt = document.createElement('option');
                opt.value = i;
                opt.textContent = i;
                pageNumSelect.appendChild(opt);
            }

            pageNum = 1;
            renderPage(pageNum);
            loadBookmarks();
            return;
        }

        // Use the preload promise (already in progress or start new)
        preloadPDF(bookName).then(pdfDoc_ => {
            onPDFLoaded(bookName, pdfDoc_);
        }).catch(err => {
            onPDFError(bookName, err);
        });
    };

    const selectBook = (bookName) => {
        if (currentBook === bookName && pdfDoc) return; // Already viewing
        currentBook = bookName;

        [...bookBtnsDesktop, ...bookBtnsMobile].forEach(btn => {
            if (btn.getAttribute('data-book') === bookName) btn.classList.add('active');
            else btn.classList.remove('active');
        });

        mobileMenu.classList.remove('open');
        placeholder.style.display = 'none';
        pdfContainer.style.display = 'flex';

        // ALWAYS clear old page immediately and show loading spinner
        textLayerDiv.innerHTML = '';
        if (highlightCtx) highlightCtx.clearRect(0, 0, highlightCanvas.width, highlightCanvas.height);
        pdfCtx.clearRect(0, 0, pdfCanvas.width, pdfCanvas.height);

        // Show a small "กำลังโหลด..." text on canvas while waiting
        pdfCanvas.width = 600;
        pdfCanvas.height = 400;
        pdfCanvas.style.width = '600px';
        pdfCanvas.style.height = '400px';
        pdfPageContainer.style.width = '600px';
        pdfPageContainer.style.height = '400px';
        pdfCtx.fillStyle = '#888';
        pdfCtx.font = '20px Sarabun, sans-serif';
        pdfCtx.textAlign = 'center';
        pdfCtx.fillText('กำลังโหลด...', 300, 200);

        // Try to show page 1 from IndexedDB cache (replaces loading text instantly)
        if (!pdfCache[bookName]) {
            idbLoadPage(bookName, 1).then(cached => {
                if (cached && currentBook === bookName) {
                    drawCachedImage(cached);
                }
            }).catch(() => { });
        }

        loadPDF(bookName);
    };

    // Eager parallel preload: start downloading ALL books immediately on startup
    const allBooks = ['th_athkar_assabah_walmasaa.pdf', 'dua_mustajab_th.pdf'];
    allBooks.forEach(book => preloadPDF(book));

    [...bookBtnsDesktop, ...bookBtnsMobile].forEach(btn => {
        btn.addEventListener('click', (e) => selectBook(e.target.getAttribute('data-book')));
    });

    // --- Bookmarks & Notes (Phase 3) ---
    const loadNoteForCurrentPage = () => {
        const notesObj = JSON.parse(localStorage.getItem(getStorageKey('notes')) || '{}');
        pageNoteInput.value = notesObj[pageNum] || '';
        noteSaveStatus.textContent = '';
    };

    saveNoteBtn.addEventListener('click', () => {
        const notesObj = JSON.parse(localStorage.getItem(getStorageKey('notes')) || '{}');
        const content = pageNoteInput.value.trim();
        if (content) {
            notesObj[pageNum] = content;
        } else {
            delete notesObj[pageNum];
        }
        localStorage.setItem(getStorageKey('notes'), JSON.stringify(notesObj));
        noteSaveStatus.textContent = 'บันทึกเรียบร้อย';
        updateNotesHistoryList();
        setTimeout(() => noteSaveStatus.textContent = '', 2000);
    });

    // Phase 8: Note History List
    const updateNotesHistoryList = () => {
        if (!notesHistoryList) return;

        const notesObj = JSON.parse(localStorage.getItem(getStorageKey('notes')) || '{}');
        const pagesWithNotes = Object.keys(notesObj).map(Number).sort((a, b) => a - b);

        notesHistoryList.innerHTML = '';

        if (pagesWithNotes.length === 0) {
            notesHistoryList.innerHTML = '<li style="color:var(--text-secondary);font-size:0.85rem;padding:0.5rem;">ไม่มีประวัติการจดบันทึก</li>';
            return;
        }

        pagesWithNotes.forEach(page => {
            const snippet = notesObj[page].length > 20 ? notesObj[page].substring(0, 20) + "..." : notesObj[page];

            const li = document.createElement('li');

            const a = document.createElement('a');
            a.innerHTML = `<i class="fa-regular fa-note-sticky" style="margin-right:0.5rem;"></i> หน้า ${page} - "${snippet}"`;
            a.title = notesObj[page]; // Show full text on hover
            a.addEventListener('click', () => {
                pageNum = page;
                queueRenderPage(pageNum);
                if (window.innerWidth <= 768) sidebar.classList.remove('open');
            });

            const delBtn = document.createElement('button');
            delBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
            delBtn.title = "ลบบันทึกหน้านี้";
            delBtn.addEventListener('click', () => {
                if (confirm(`คุณต้องการลบบันทึกหน้า ${page} ใช่หรือไม่?`)) {
                    const currentNotes = JSON.parse(localStorage.getItem(getStorageKey('notes')) || '{}');
                    delete currentNotes[page];
                    localStorage.setItem(getStorageKey('notes'), JSON.stringify(currentNotes));
                    updateNotesHistoryList(); // Refresh UI
                    if (page === pageNum) {
                        pageNoteInput.value = ''; // Clear text if currently on that page
                    }
                }
            });

            li.appendChild(a);
            li.appendChild(delBtn);
            notesHistoryList.appendChild(li);
        });
    };


    const loadBookmarks = () => {
        const bms = JSON.parse(localStorage.getItem(getStorageKey('bookmarks')) || '[]');
        bookmarksList.innerHTML = '';
        bms.forEach(pBtn => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.innerHTML = `<i class="fa-solid fa-bookmark" style="margin-right:0.5rem;"></i> หน้า ${pBtn}`;
            a.addEventListener('click', () => {
                pageNum = pBtn;
                queueRenderPage(pageNum);
                if (window.innerWidth <= 768) sidebar.classList.remove('open');
            });
            const delBtn = document.createElement('button');
            delBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
            delBtn.addEventListener('click', () => removeBookmark(pBtn));

            li.appendChild(a);
            li.appendChild(delBtn);
            bookmarksList.appendChild(li);
        });
    };

    addBookmarkBtn.addEventListener('click', () => {
        let bms = JSON.parse(localStorage.getItem(getStorageKey('bookmarks')) || '[]');
        if (!bms.includes(pageNum)) {
            bms.push(pageNum);
            bms.sort((a, b) => a - b);
            localStorage.setItem(getStorageKey('bookmarks'), JSON.stringify(bms));
            loadBookmarks();
        }
    });

    const removeBookmark = (p) => {
        let bms = JSON.parse(localStorage.getItem(getStorageKey('bookmarks')) || '[]');
        bms = bms.filter(x => x !== p);
        localStorage.setItem(getStorageKey('bookmarks'), JSON.stringify(bms));
        loadBookmarks();
    };

    // --- Highlighting (Phase 4 v2 - Freehand Canvas) ---

    // Toggle Highlighter Mode
    toggleHighlightModeBtn.addEventListener('click', () => {
        isHighlightMode = !isHighlightMode;
        if (isHighlightMode) {
            highlightTools.style.display = 'flex';
            toggleHighlightModeBtn.classList.add('active');
            highlightCanvas.classList.add('drawing-mode');
            textLayerDiv.classList.add('drawing-mode'); // Disable text selection
        } else {
            highlightTools.style.display = 'none';
            toggleHighlightModeBtn.classList.remove('active');
            highlightCanvas.classList.remove('drawing-mode');
            textLayerDiv.classList.remove('drawing-mode');
        }
    });

    closeHighlightModeBtn.addEventListener('click', () => {
        isHighlightMode = false;
        highlightTools.style.display = 'none';
        toggleHighlightModeBtn.classList.remove('active');
        highlightCanvas.classList.remove('drawing-mode');
        textLayerDiv.classList.remove('drawing-mode');
    });

    // Tool Selection (Colors and Eraser)
    document.querySelectorAll('.hl-color:not(.tool-btn)').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.hl-color').forEach(b => b.classList.remove('active-color'));
            btn.classList.add('active-color');
            currentHighlightColor = btn.getAttribute('data-color');
            isEraserMode = false;
        });
    });

    hlEraserBtn.addEventListener('click', () => {
        document.querySelectorAll('.hl-color').forEach(b => b.classList.remove('active-color'));
        hlEraserBtn.classList.add('active-color');
        isEraserMode = true;
    });

    // Undo Feature
    hlUndoBtn.addEventListener('click', () => {
        let hls = JSON.parse(localStorage.getItem(getStorageKey('highlights')) || '{}');
        if (hls[pageNum] && hls[pageNum].length > 0) {
            hls[pageNum].pop(); // Remove last stroke
            localStorage.setItem(getStorageKey('highlights'), JSON.stringify(hls));
            loadHighlights(pageNum);
        }
    });

    // Stroke Width Slider Feature
    const hlWidthSlider = document.getElementById('hlWidthSlider');
    if (hlWidthSlider) {
        hlWidthSlider.value = strokeWidth;
        hlWidthSlider.addEventListener('input', (e) => {
            strokeWidth = parseInt(e.target.value);
            localStorage.setItem('hlStrokeWidth', strokeWidth);
        });
    }

    // Canvas Drawing Logic
    const getPointerPos = (e) => {
        const rect = highlightCanvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        // Scale to actual canvas coordinate space
        return {
            x: (clientX - rect.left) * (highlightCanvas.width / rect.width),
            y: (clientY - rect.top) * (highlightCanvas.height / rect.height)
        };
    };

    const startDrawing = (e) => {
        if (!isHighlightMode) return;
        e.preventDefault();
        isDrawing = true;
        const pos = getPointerPos(e);
        currentStroke = [pos];

        // Calculate stroke width multiplier once at start
        const cssWidth = parseFloat(highlightCanvas.style.width) || highlightCanvas.width;
        const multiplierX = highlightCanvas.width / (cssWidth / scale);

        // Setup context for this entire stroke
        if (isEraserMode) {
            highlightCtx.globalCompositeOperation = 'destination-out';
            highlightCtx.lineWidth = strokeWidth * multiplierX * 1.5;
            highlightCtx.strokeStyle = 'rgba(0,0,0,1)';
        } else {
            highlightCtx.globalCompositeOperation = 'source-over';
            highlightCtx.lineWidth = strokeWidth * multiplierX;
            highlightCtx.strokeStyle = currentHighlightColor;
        }
        highlightCtx.lineCap = 'round';
        highlightCtx.lineJoin = 'round';

        highlightCtx.beginPath();
        highlightCtx.moveTo(pos.x, pos.y);
    };

    const draw = (e) => {
        if (!isDrawing) return;
        e.preventDefault();
        const pos = getPointerPos(e);
        currentStroke.push(pos);

        highlightCtx.lineTo(pos.x, pos.y);
        highlightCtx.stroke();
        // Continue from the current point (avoid re-stroking old segments)
        highlightCtx.beginPath();
        highlightCtx.moveTo(pos.x, pos.y);
    };

    const stopDrawing = () => {
        if (!isDrawing) return;
        isDrawing = false;
        highlightCtx.closePath();
        highlightCtx.globalCompositeOperation = 'source-over';

        if (currentStroke.length > 0) {
            saveStroke(currentStroke, isEraserMode ? 'eraser' : currentHighlightColor);
            console.log('[Highlight] Saved stroke with', currentStroke.length, 'points to page', pageNum);
        }
        currentStroke = [];
        // DON'T call loadHighlights here — the live draw is already on the canvas.
        // loadHighlights will run automatically on next page render/zoom.
    };

    highlightCanvas.addEventListener('mousedown', startDrawing);
    highlightCanvas.addEventListener('mousemove', draw);
    window.addEventListener('mouseup', stopDrawing);

    highlightCanvas.addEventListener('touchstart', startDrawing, { passive: false });
    highlightCanvas.addEventListener('touchmove', draw, { passive: false });
    window.addEventListener('touchend', stopDrawing);
    highlightCanvas.addEventListener('touchcancel', stopDrawing);

    const saveStroke = (points, color) => {
        let hls = JSON.parse(localStorage.getItem(getStorageKey('highlights')) || '{}');
        if (!hls[pageNum]) hls[pageNum] = [];

        // Save relative to scale 1.0 (CSS width/height relative)
        // Note: the points in currentStroke are in canvas coordinate space
        // which includes devicePixelRatio/outputScale. We must normalize them to CSS space
        // at scale=1.0.
        // Wait, outputScale = highlightCanvas.width / highlightCanvas.style.width (in px)
        const cssWidth = parseFloat(highlightCanvas.style.width);
        const ratioX = (cssWidth / scale) / highlightCanvas.width;
        const ratioY = (parseFloat(highlightCanvas.style.height) / scale) / highlightCanvas.height;

        const normalizedPoints = points.map(p => ({
            x: p.x * ratioX,
            y: p.y * ratioY
        }));

        hls[pageNum].push({
            color: color,
            points: normalizedPoints,
            width: strokeWidth
        });
        localStorage.setItem(getStorageKey('highlights'), JSON.stringify(hls));
    };

    const loadHighlights = (num) => {
        // Reset context state FIRST
        highlightCtx.globalCompositeOperation = 'source-over';
        highlightCtx.clearRect(0, 0, highlightCanvas.width, highlightCanvas.height);

        const storageKey = getStorageKey('highlights');
        const hls = JSON.parse(localStorage.getItem(storageKey) || '{}');

        if (!hls[num] || !Array.isArray(hls[num])) return;

        // Filter out corrupted entries (missing or empty points)
        const validStrokes = hls[num].filter(s => s && Array.isArray(s.points) && s.points.length > 0);

        // If we cleaned up corrupted data, save the clean version
        if (validStrokes.length !== hls[num].length) {
            console.warn('[loadHighlights] Cleaned', hls[num].length - validStrokes.length, 'corrupted stroke(s) on page', num);
            hls[num] = validStrokes;
            localStorage.setItem(storageKey, JSON.stringify(hls));
        }

        if (validStrokes.length === 0) return;

        const cssWidth = parseFloat(highlightCanvas.style.width);
        const cssHeight = parseFloat(highlightCanvas.style.height);
        if (isNaN(cssWidth) || isNaN(cssHeight) || cssWidth === 0 || cssHeight === 0) return;

        const ratioX = highlightCanvas.width / (cssWidth / scale);
        const ratioY = highlightCanvas.height / (cssHeight / scale);

        validStrokes.forEach(stroke => {
            if (stroke.color === 'eraser') {
                highlightCtx.globalCompositeOperation = 'destination-out';
                highlightCtx.lineWidth = stroke.width * ratioX * 1.5;
                highlightCtx.strokeStyle = 'rgba(0,0,0,1)';
            } else {
                highlightCtx.globalCompositeOperation = 'source-over';
                highlightCtx.lineWidth = stroke.width * ratioX;
                highlightCtx.strokeStyle = stroke.color;
            }
            highlightCtx.lineCap = 'round';
            highlightCtx.lineJoin = 'round';

            highlightCtx.beginPath();
            highlightCtx.moveTo(stroke.points[0].x * ratioX, stroke.points[0].y * ratioY);
            for (let i = 1; i < stroke.points.length; i++) {
                highlightCtx.lineTo(stroke.points[i].x * ratioX, stroke.points[i].y * ratioY);
            }
            highlightCtx.stroke();
            highlightCtx.closePath();
        });
        highlightCtx.globalCompositeOperation = 'source-over'; // reset
    };



    // --- Phase 2: Focus Mode ---
    let isFocusMode = false;
    pdfPageContainer.addEventListener('click', (e) => {
        // Prevent toggle if clicking on highlight tools
        if (e.target.closest('#highlightTools')) return;

        // Prevent toggle if text is selected
        const selection = window.getSelection();
        if (selection.rangeCount > 0 && selection.toString().trim().length > 0) return;

        isFocusMode = !isFocusMode;
        if (isFocusMode) {
            document.body.classList.add('focus-mode');
        } else {
            document.body.classList.remove('focus-mode');
        }
    });

    // --- Phase 3: Smart Tasbih ---
    let tasbihCount = parseInt(localStorage.getItem('tasbihCount') || '0');
    if (tasbihCountSpan) tasbihCountSpan.textContent = tasbihCount;

    if (tasbihBtn) {
        tasbihBtn.addEventListener('click', () => {
            tasbihCount++;
            tasbihCountSpan.textContent = tasbihCount;
            localStorage.setItem('tasbihCount', tasbihCount);

            tasbihBtn.classList.remove('pulse');
            void tasbihBtn.offsetWidth; // trigger reflow
            tasbihBtn.classList.add('pulse');

            if (navigator.vibrate) {
                if (tasbihCount % 33 === 0) {
                    navigator.vibrate([100, 50, 100, 50, 100]); // Milestone
                } else {
                    navigator.vibrate(40); // Regular
                }
            }
        });
    }

    if (tasbihResetBtn) {
        tasbihResetBtn.addEventListener('click', () => {
            tasbihCount = 0;
            tasbihCountSpan.textContent = tasbihCount;
            localStorage.setItem('tasbihCount', tasbihCount);
            if (navigator.vibrate) navigator.vibrate(40);
        });
    }

    // --- Phase 4: Daily Tracking ---
    const updateStreak = () => {
        const today = new Date().toLocaleDateString('en-CA');
        let lastDate = localStorage.getItem('lastReadDate');
        let streak = parseInt(localStorage.getItem('readingStreak') || '0');

        if (lastDate !== today) {
            if (lastDate) {
                const last = new Date(lastDate);
                const current = new Date(today);
                const diffTime = Math.abs(current - last);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays === 1) {
                    streak++;
                } else if (diffDays > 1) {
                    streak = 1;
                }
            } else {
                streak = 1;
            }
            localStorage.setItem('lastReadDate', today);
            localStorage.setItem('readingStreak', streak);
        }

        if (streakCountSpan) streakCountSpan.textContent = `${streak} วัน`;
        if (streak > 0 && streakIcon) {
            streakIcon.classList.remove('inactive');
            streakText.textContent = "เยี่ยมมาก! อ่านวันนี้แล้ว";
        }
    };
    updateStreak();

    // --- Phase 7: Daily Notifications ---
    if (notificationToggle) {
        // Init state
        const isEnabled = localStorage.getItem('notificationsEnabled') === 'true';
        if (isEnabled && Notification.permission === 'granted') {
            notificationToggle.checked = true;
        } else {
            notificationToggle.checked = false;
            localStorage.setItem('notificationsEnabled', 'false');
        }

        notificationToggle.addEventListener('change', (e) => {
            if (e.target.checked) {
                if (!("Notification" in window)) {
                    alert("เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือนครับ");
                    e.target.checked = false;
                    return;
                }

                Notification.requestPermission().then(permission => {
                    if (permission === 'granted') {
                        localStorage.setItem('notificationsEnabled', 'true');
                        // Show a welcome notification
                        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                            navigator.serviceWorker.ready.then(reg => {
                                reg.showNotification('เปิดการแจ้งเตือนสำเร็จ 🎉', {
                                    body: 'แอปจะแจ้งเตือนให้อ่านอัซการในตอนเช้า (06:00-12:00) และเย็น (16:00-20:00)',
                                    icon: './icon.svg',
                                    badge: './icon.svg',
                                    vibrate: [100, 50, 100],
                                    tag: 'setup'
                                });
                            });
                        }
                    } else {
                        alert("กรุณาอนุญาตการแจ้งเตือนในตั้งค่าแอพ/เบราว์เซอร์ของท่านครับ");
                        e.target.checked = false;
                        localStorage.setItem('notificationsEnabled', 'false');
                    }
                });
            } else {
                localStorage.setItem('notificationsEnabled', 'false');
            }
        });
    }

    const checkNotifications = () => {
        if (localStorage.getItem('notificationsEnabled') !== 'true') return;
        if (!("Notification" in window) || Notification.permission !== 'granted') return;

        const now = new Date();
        const hour = now.getHours();
        const dateString = now.toLocaleDateString('en-CA');

        let shouldNotify = false;
        let title = '';
        const body = 'การรักษาการอ่านอัซการเช้า-เย็นจะช่วยให้ชีวิตมีความสงบ ปลอดภัย และอยู่ภายใต้ความเมตตาของอัลลอฮ์ตลอดเวลา';
        let tag = '';

        const morningNotified = localStorage.getItem(`notified_morning_${dateString}`);
        const eveningNotified = localStorage.getItem(`notified_evening_${dateString}`);

        if (hour >= 6 && hour < 12 && !morningNotified) {
            shouldNotify = true;
            title = 'ได้เวลาอ่านอัซการยามเช้าแล้วครับ ☀️';
            tag = 'morning_azkar';
            localStorage.setItem(`notified_morning_${dateString}`, 'true');
        } else if (hour >= 16 && hour < 20 && !eveningNotified) {
            shouldNotify = true;
            title = 'ได้เวลาอ่านอัซการยามเย็นแล้วครับ 🌙';
            tag = 'evening_azkar';
            localStorage.setItem(`notified_evening_${dateString}`, 'true');
        }

        if (shouldNotify && navigator.serviceWorker && navigator.serviceWorker.controller) {
            navigator.serviceWorker.ready.then(reg => {
                reg.showNotification(title, {
                    body: body,
                    icon: './icon.svg',
                    badge: './icon.svg',
                    vibrate: [200, 100, 200, 100, 200],
                    tag: tag,
                    data: { url: window.location.href }
                });
            });
        }
    };

    // Check initially on load, then every 60 seconds
    checkNotifications();
    setInterval(checkNotifications, 60000);

    // --- Scroll Mode: wheel event to change pages (desktop) ---
    let scrollCooldown = false;
    pdfViewerWrapper.addEventListener('wheel', (e) => {
        if (navMode !== 'scroll' || !pdfDoc || scrollCooldown) return;

        // Only trigger page change when scrolled to the edge
        const atBottom = pdfViewerWrapper.scrollTop + pdfViewerWrapper.clientHeight >= pdfViewerWrapper.scrollHeight - 5;
        const atTop = pdfViewerWrapper.scrollTop <= 5;

        if (e.deltaY > 0 && atBottom) {
            // Scrolling down at bottom → next page
            e.preventDefault();
            scrollCooldown = true;
            onNextPage();
            pdfViewerWrapper.scrollTop = 0;
            setTimeout(() => scrollCooldown = false, 400);
        } else if (e.deltaY < 0 && atTop) {
            // Scrolling up at top → prev page
            e.preventDefault();
            scrollCooldown = true;
            onPrevPage();
            // Scroll to bottom of previous page
            requestAnimationFrame(() => {
                pdfViewerWrapper.scrollTop = pdfViewerWrapper.scrollHeight;
            });
            setTimeout(() => scrollCooldown = false, 400);
        }
    }, { passive: false });

    // --- Scroll Mode: touch swipe to change pages (mobile) ---
    let scrollTouchStartY = 0;
    let scrollTouchCooldown = false;

    pdfViewerWrapper.addEventListener('touchstart', (e) => {
        // Phase 6 Fix: Ignore pinch-to-zoom (multi-touch)
        if (navMode !== 'scroll' || !pdfDoc || e.touches.length > 1) return;
        scrollTouchStartY = e.changedTouches[0].clientY;
    }, { passive: true });

    pdfViewerWrapper.addEventListener('touchend', (e) => {
        // Phase 6 Fix: Ignore if there were multiple touches (pinch)
        if (navMode !== 'scroll' || !pdfDoc || scrollTouchCooldown || e.changedTouches.length > 1 || e.touches.length > 0) return;
        const deltaY = e.changedTouches[0].clientY - scrollTouchStartY;
        const threshold = 50;

        const atBottom = pdfViewerWrapper.scrollTop + pdfViewerWrapper.clientHeight >= pdfViewerWrapper.scrollHeight - 5;
        const atTop = pdfViewerWrapper.scrollTop <= 5;

        if (deltaY < -threshold && atBottom) {
            // Swiped up at bottom → next page
            scrollTouchCooldown = true;
            onNextPage();
            pdfViewerWrapper.scrollTop = 0;
            setTimeout(() => scrollTouchCooldown = false, 400);
        } else if (deltaY > threshold && atTop) {
            // Swiped down at top → prev page
            scrollTouchCooldown = true;
            onPrevPage();
            requestAnimationFrame(() => {
                pdfViewerWrapper.scrollTop = pdfViewerWrapper.scrollHeight;
            });
            setTimeout(() => scrollTouchCooldown = false, 400);
        }
    }, { passive: true });

    // --- Swipe Mode: touch swipe to change pages ---
    let touchStartX = 0;
    let touchStartY = 0;
    let touchDeltaX = 0;
    let isSwiping = false;

    pdfViewerWrapper.addEventListener('touchstart', (e) => {
        if (navMode !== 'swipe' || !pdfDoc) return;
        touchStartX = e.changedTouches[0].clientX;
        touchStartY = e.changedTouches[0].clientY;
        touchDeltaX = 0;
        isSwiping = false;
        pdfPageContainer.style.transition = 'none';
    }, { passive: true });

    pdfViewerWrapper.addEventListener('touchmove', (e) => {
        if (navMode !== 'swipe' || !pdfDoc) return;
        const currentX = e.changedTouches[0].clientX;
        const currentY = e.changedTouches[0].clientY;
        touchDeltaX = currentX - touchStartX;
        const deltaY = Math.abs(currentY - touchStartY);

        // Only swipe horizontally if horizontal movement > vertical
        if (Math.abs(touchDeltaX) > deltaY && Math.abs(touchDeltaX) > 10) {
            isSwiping = true;
            e.preventDefault();
            // Follow finger with resistance
            const resistance = 0.4;
            pdfPageContainer.style.transform = `translateX(${touchDeltaX * resistance}px)`;
            pdfPageContainer.style.opacity = Math.max(0.5, 1 - Math.abs(touchDeltaX) / 600);
        }
    }, { passive: false });

    pdfViewerWrapper.addEventListener('touchend', (e) => {
        if (navMode !== 'swipe' || !pdfDoc || !isSwiping) {
            pdfPageContainer.style.transform = '';
            pdfPageContainer.style.opacity = '';
            pdfPageContainer.style.transition = '';
            return;
        }

        const threshold = 60;

        if (touchDeltaX < -threshold && pageNum < pdfDoc.numPages) {
            // Swipe left → next page (slide out left, new page slides in from right)
            pdfPageContainer.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
            pdfPageContainer.style.transform = 'translateX(-100%)';
            pdfPageContainer.style.opacity = '0';
            setTimeout(() => {
                pdfPageContainer.style.transition = 'none';
                pdfPageContainer.style.transform = 'translateX(100%)';
                pageNum++;
                queueRenderPage(pageNum);
                requestAnimationFrame(() => {
                    pdfPageContainer.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
                    pdfPageContainer.style.transform = 'translateX(0)';
                    pdfPageContainer.style.opacity = '1';
                });
            }, 300);
        } else if (touchDeltaX > threshold && pageNum > 1) {
            // Swipe right → prev page (slide out right, new page slides in from left)
            pdfPageContainer.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
            pdfPageContainer.style.transform = 'translateX(100%)';
            pdfPageContainer.style.opacity = '0';
            setTimeout(() => {
                pdfPageContainer.style.transition = 'none';
                pdfPageContainer.style.transform = 'translateX(-100%)';
                pageNum--;
                queueRenderPage(pageNum);
                requestAnimationFrame(() => {
                    pdfPageContainer.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
                    pdfPageContainer.style.transform = 'translateX(0)';
                    pdfPageContainer.style.opacity = '1';
                });
            }, 300);
        } else {
            // Snap back
            pdfPageContainer.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
            pdfPageContainer.style.transform = 'translateX(0)';
            pdfPageContainer.style.opacity = '1';
        }

        setTimeout(() => {
            pdfPageContainer.style.transition = '';
        }, 350);

        isSwiping = false;
    }, { passive: true });

    // Auto-load default
    selectBook(currentBook);
});

// --- Phase 6: PWA Service Worker ---
// Only register SW on http/https (file:// protocol does not support Service Workers)
if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then(reg => {
            console.log('ServiceWorker registered with scope: ', reg.scope);

            // Listen for updates
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // New update available, force reload
                        if (confirm('มีเวอร์ชันใหม่พร้อมใช้งาน ต้องการโหลดแอปใหม่หรือไม่?')) {
                            window.location.reload();
                        }
                    }
                });
            });
        }).catch(err => {
            console.log('ServiceWorker registration failed: ', err);
        });
    });
}
