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
    const highlightLayerDiv = document.getElementById('highlightLayer');

    const addBookmarkBtn = document.getElementById('addBookmarkBtn');
    const bookmarksList = document.getElementById('bookmarksList');
    const notePageNum = document.getElementById('notePageNum');
    const pageNoteInput = document.getElementById('pageNoteInput');
    const saveNoteBtn = document.getElementById('saveNoteBtn');
    const noteSaveStatus = document.getElementById('noteSaveStatus');

    // Phase 4 & 5 Extra Elements
    const highlightTools = document.getElementById('highlightTools');
    const translationLayer = document.getElementById('translationLayer');
    const toggleTranslationBtn = document.getElementById('toggleTranslationBtn');
    const transPageNum = document.getElementById('transPageNum');

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
    let currentSelectionRange = null;

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
    const renderPage = (num) => {
        pageRendering = true;

        // Check in-memory cache first (instant)
        const cacheKey = `${currentBook}_${num}_${scale}`;
        if (pageCanvasCache[cacheKey]) {
            const cached = pageCanvasCache[cacheKey];
            pdfCanvas.width = cached.bitmap.width;
            pdfCanvas.height = cached.bitmap.height;
            pdfCanvas.style.width = cached.cssWidth + "px";
            pdfCanvas.style.height = cached.cssHeight + "px";
            pdfPageContainer.style.width = cached.cssWidth + "px";
            pdfPageContainer.style.height = cached.cssHeight + "px";
            pdfCtx.imageSmoothingEnabled = true;
            pdfCtx.imageSmoothingQuality = 'high';
            pdfCtx.drawImage(cached.bitmap, 0, 0);
            pageRendering = false;
            if (pageNumPending !== null) { renderPage(pageNumPending); pageNumPending = null; }
            if (pdfDoc) {
                pdfDoc.getPage(num).then(page => {
                    const viewport = page.getViewport({ scale: scale });
                    return page.getTextContent().then(tc => { buildTextLayer(tc, viewport); loadHighlights(num); });
                });
            }
            // Update Page Select Dropdown
            pageNumSelect.value = num;
            notePageNum.textContent = num;
            loadNoteForCurrentPage();
            highlightTools.style.display = 'none';
            translationLayer.style.display = 'none';
            return;
        }

        // Check IndexedDB cache (very fast, ~5ms)
        const bookForRender = currentBook;
        idbLoadPage(currentBook, num).then(cached => {
            if (cached && currentBook === bookForRender) {
                // Draw from IndexedDB cache instantly
                return drawCachedImage(cached).then(() => {
                    pageRendering = false;
                    if (pageNumPending !== null) { renderPage(pageNumPending); pageNumPending = null; }
                    // Load text layer in background for selection
                    if (pdfDoc) {
                        pdfDoc.getPage(num).then(page => {
                            const viewport = page.getViewport({ scale: scale });
                            return page.getTextContent().then(tc => { buildTextLayer(tc, viewport); loadHighlights(num); });
                        });
                    }
                });
            }

            // No cache — render from PDF
            if (!pdfDoc) { pageRendering = false; return; }
            pdfDoc.getPage(num).then((page) => {
                const viewport = page.getViewport({ scale: scale });
                const outputScale = getOutputScale(viewport.width, viewport.height);
                pdfCanvas.width = Math.floor(viewport.width * outputScale);
                pdfCanvas.height = Math.floor(viewport.height * outputScale);
                pdfCanvas.style.width = Math.floor(viewport.width) + "px";
                pdfCanvas.style.height = Math.floor(viewport.height) + "px";
                pdfPageContainer.style.width = Math.floor(viewport.width) + "px";
                pdfPageContainer.style.height = Math.floor(viewport.height) + "px";
                pdfCtx.imageSmoothingEnabled = true;
                pdfCtx.imageSmoothingQuality = 'high';
                const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;
                const renderContext = { canvasContext: pdfCtx, transform: transform, viewport: viewport };

                page.render(renderContext).promise.then(() => {
                    // Cache in memory
                    createImageBitmap(pdfCanvas).then(bitmap => {
                        pageCanvasCache[cacheKey] = { bitmap, cssWidth: Math.floor(viewport.width), cssHeight: Math.floor(viewport.height) };
                    }).catch(() => { });
                    // Cache in IndexedDB for instant loading next time
                    idbSavePage(currentBook, num, pdfCanvas, Math.floor(viewport.width), Math.floor(viewport.height));

                    pageRendering = false;
                    if (pageNumPending !== null) { renderPage(pageNumPending); pageNumPending = null; }
                    return page.getTextContent();
                }).then((textContent) => {
                    buildTextLayer(textContent, viewport);
                    loadHighlights(num);
                });
            });
        });

        // Update Page Select Dropdown
        pageNumSelect.value = num;
        notePageNum.textContent = num;
        loadNoteForCurrentPage();
        highlightTools.style.display = 'none';
        translationLayer.style.display = 'none';
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

    zoomInBtn.addEventListener('click', () => { scale += 0.2; queueRenderPage(pageNum); });
    zoomOutBtn.addEventListener('click', () => { if (scale > 0.5) { scale -= 0.2; queueRenderPage(pageNum); } });

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
        const { bookName, pdfDocument, pageNum: pNum } = bgRenderQueue.shift();
        const cacheKey = `${bookName}_${pNum}_${scale}`;
        if (pageCanvasCache[cacheKey]) { bgRenderNext(); return; }

        // Check IndexedDB first
        idbLoadPage(bookName, pNum).then(cached => {
            if (cached) { bgRenderNext(); return; }

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
                });
            }).then(() => {
                bgRendering = false;
                // Small delay to avoid blocking the main thread
                setTimeout(bgRenderNext, 50);
            }).catch(() => {
                bgRendering = false;
                setTimeout(bgRenderNext, 100);
            });
        });
    };

    const prerenderPages = (bookName, pdfDocument, startPage, endPage) => {
        for (let i = startPage; i <= Math.min(endPage, pdfDocument.numPages); i++) {
            bgRenderQueue.push({ bookName, pdfDocument, pageNum: i });
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
            // Pre-render first 10 pages in background for instant navigation
            prerenderPages(bookName, pdfDoc_, 2, 10);
            // Then pre-render the rest
            setTimeout(() => prerenderPages(bookName, pdfDoc_, 11, pdfDoc_.numPages), 2000);
        } else {
            // Pre-render first 10 pages of non-active book in background
            prerenderPages(bookName, pdfDoc_, 1, 10);
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
                        return pdfjsLib.getDocument({ data: data }).promise;
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
            disableStream: false
        }).promise.then(pdfDoc_ => {
            pdfCache[bookName] = pdfDoc_;
            // Pre-render first 10 pages in background
            prerenderPages(bookName, pdfDoc_, 1, 10);
            return pdfDoc_;
        }).catch(err => {
            console.warn('Range-request PDF load failed, trying full download...', err);
            return loadFileAsArrayBuffer(pdfUrl).then(data => {
                return pdfjsLib.getDocument({ data: data }).promise;
            }).then(pdfDoc_ => {
                pdfCache[bookName] = pdfDoc_;
                prerenderPages(bookName, pdfDoc_, 1, 10);
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
        highlightLayerDiv.innerHTML = '';
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
        notesObj[pageNum] = pageNoteInput.value;
        localStorage.setItem(getStorageKey('notes'), JSON.stringify(notesObj));
        noteSaveStatus.textContent = 'บันทึกเรียบร้อย';
        setTimeout(() => noteSaveStatus.textContent = '', 2000);
    });

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

    // --- Highlighting (Phase 4) ---
    document.addEventListener('selectionchange', () => {
        const selection = window.getSelection();
        if (selection.rangeCount > 0 && selection.toString().trim().length > 0) {
            // Check if selection is inside textLayer
            if (textLayerDiv.contains(selection.anchorNode)) {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                const containerRect = pdfViewerWrapper.getBoundingClientRect();

                highlightTools.style.display = 'flex';
                // Center tool above selection relative to wrapper
                const scrollLeft = pdfViewerWrapper.scrollLeft;
                const scrollTop = pdfViewerWrapper.scrollTop;
                highlightTools.style.left = `${rect.left - containerRect.left + (rect.width / 2) + scrollLeft}px`;
                highlightTools.style.top = `${rect.top - containerRect.top + scrollTop}px`;

                currentSelectionRange = range.cloneRange();
            }
        } else {
            highlightTools.style.display = 'none';
        }
    });

    document.querySelectorAll('.hl-color').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const color = e.target.getAttribute('data-color');
            if (currentSelectionRange) {
                saveHighlight(currentSelectionRange, color);
                window.getSelection().removeAllRanges();
                highlightTools.style.display = 'none';
                loadHighlights(pageNum);
            }
        });
    });

    const saveHighlight = (range, color) => {
        const rects = range.getClientRects();
        const containerRect = pdfPageContainer.getBoundingClientRect();

        let hls = JSON.parse(localStorage.getItem(getStorageKey('highlights')) || '{}');
        if (!hls[pageNum]) hls[pageNum] = [];

        // Save relative to base scale 1.0 so we can re-render at any scale
        const relativeRects = Array.from(rects).map(r => ({
            top: (r.top - containerRect.top) / scale,
            left: (r.left - containerRect.left) / scale,
            width: r.width / scale,
            height: r.height / scale,
            color: color,
            isMask: color.endsWith('_mask') // Flag for phase 5 feature
        }));

        hls[pageNum].push(...relativeRects);
        localStorage.setItem(getStorageKey('highlights'), JSON.stringify(hls));
    };

    const loadHighlights = (num) => {
        highlightLayerDiv.innerHTML = '';
        const hls = JSON.parse(localStorage.getItem(getStorageKey('highlights')) || '{}');
        if (hls[num]) {
            hls[num].forEach(rect => {
                const div = document.createElement('div');
                div.className = 'highlight-rect';

                if (rect.isMask) {
                    div.classList.add('memorization-mask');
                    div.style.backgroundColor = rect.color.replace('_mask', '');
                } else {
                    div.style.backgroundColor = rect.color;
                }

                div.style.left = `${rect.left * scale}px`;
                div.style.top = `${rect.top * scale}px`;
                div.style.width = `${rect.width * scale}px`;
                div.style.height = `${rect.height * scale}px`;
                highlightLayerDiv.appendChild(div);
            });
        }
    };

    // Phase 5: Delegated click handler for Memorization Masks
    highlightLayerDiv.addEventListener('click', (e) => {
        if (e.target.classList.contains('memorization-mask')) {
            e.target.classList.toggle('revealed');
        }
    });

    // --- Translation (Phase 5) ---
    toggleTranslationBtn.addEventListener('click', () => {
        transPageNum.textContent = pageNum;
        if (translationLayer.style.display === 'none') translationLayer.style.display = 'flex';
        else translationLayer.style.display = 'none';
    });

    translationLayer.addEventListener('click', (e) => {
        // close if clicked outside the box
        if (e.target === translationLayer) {
            translationLayer.style.display = 'none';
        }
    });

    // --- Phase 2: Focus Mode ---
    let isFocusMode = false;
    pdfPageContainer.addEventListener('click', (e) => {
        // Prevent toggle if clicking on highlight tools or translating
        if (e.target.closest('#highlightTools') || e.target.closest('#translationLayer')) return;

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
