/**
 * Decipher Premium PDF Magazine Engine
 * Custom dependency-free 3D flipbook reader.
 */

class MagazineEngine {
    constructor() {
        // Core State
        const urlParams = new URLSearchParams(window.location.search);
        this.pdfUrl = urlParams.get('pdf') || '';
        this.pdfDoc = null;
        this.totalPages = 0;
        
        // Layout State
        this.isDoublePage = true; // Always true to mimic physical book flow
        this.totalSheets = 0;
        this.currentSheetIndex = 0;
        this.currentPage = 1;
        
        // Cache & DOM
        this.canvasElements = [];
        this.renderPromises = {};
        this.sheets = [];
        
        // Zoom/Pan State
        this.zoomLevel = 1;
        this.translateX = 0;
        this.translateY = 0;
        this.isDragging = false;
        
        this.initDOM();
        this.applySecurity();
        this.bindEvents();
        this.startIdleTimer();
        
        if (this.pdfUrl) {
            this.setFilename();
            this.loadPDF();
        } else {
            this.showError("No valid PDF supplied.");
        }
    }

    isMobileDevice() {
        return window.innerWidth < 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry/i.test(navigator.userAgent);
    }

    initDOM() {
        this.stage = document.getElementById('viewerStage');
        this.panZoomWrapper = document.getElementById('panZoomWrapper');
        this.flipbook = document.getElementById('flipbook');
        this.toolbar = document.getElementById('glassToolbar');
        this.loader = document.getElementById('viewerLoader');
        
        this.elTitle = document.getElementById('pdfFileName');
        this.elZoom = document.getElementById('zoomLevel');
        this.elPageCur = document.getElementById('pageCurrent');
        this.elPageTot = document.getElementById('pageTotal');
        
        this.btnZoomToggle = document.getElementById('btnZoomToggle');
        this.zoomPopup = document.getElementById('zoomPopup');
        this.zoomSliderInput = document.getElementById('zoomSliderInput');
        this.btnZoomOutSlider = document.getElementById('btnZoomOutSlider');
        this.btnZoomInSlider = document.getElementById('btnZoomInSlider');
        
        this.btnFullScreen = document.getElementById('btnFullScreen');
        this.btnPrev = document.getElementById('btnPrevDoc');
        this.btnNext = document.getElementById('btnNextDoc');
        
        this.ambientGlow = document.getElementById('ambientGlow');
        this.progressFill = document.getElementById('progressFill');
    }

    applySecurity() {
        const prevent = (e) => {
            if (e.target.closest('.sp-header') || e.target.closest('.sp-bottom-toolbar') || e.target.closest('.side-nav-btn')) return true;
            e.preventDefault(); return false;
        };
        document.addEventListener('contextmenu', prevent);
        document.addEventListener('dragstart', prevent);
        document.addEventListener('selectstart', prevent);
        document.addEventListener('copy', prevent);
        
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && ['p','s','u','c','j','i'].includes(e.key.toLowerCase())) prevent(e);
            if (e.key === 'F12' || e.key === 'PrintScreen') prevent(e);
        });
        if (window.self !== window.top) window.top.location = window.self.location;
    }

    bindEvents() {
        // UI Buttons
        this.btnZoomToggle?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.zoomPopup?.classList.toggle('show');
        });
        
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.zoom-wrapper')) {
                this.zoomPopup?.classList.remove('show');
            }
        });
        
        this.zoomSliderInput?.addEventListener('input', (e) => {
            let val = parseFloat(e.target.value);
            this.setZoom(val);
        });
        
        this.btnZoomOutSlider?.addEventListener('click', () => {
            let val = parseFloat(this.zoomSliderInput.value);
            this.setZoom(val - 0.2);
        });
        
        this.btnZoomInSlider?.addEventListener('click', () => {
            let val = parseFloat(this.zoomSliderInput.value);
            this.setZoom(val + 0.2);
        });
        
        this.btnFullScreen?.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(err => {
                    console.log(`Error attempting to enable full-screen mode: ${err.message}`);
                });
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                }
            }
        });
        
        this.btnPrev?.addEventListener('click', () => this.flipPrev());
        this.btnNext?.addEventListener('click', () => this.flipNext());
        
        // Keyboard mapping
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') this.flipPrev();
            if (e.key === 'ArrowRight') this.flipNext();
        });

        // Thumbnail Sidebar
        this.btnGrid = document.getElementById('btnGrid');
        this.thumbSidebar = document.getElementById('thumbnailSidebar');
        this.thumbGrid = document.getElementById('thumbnailGrid');
        this.btnCloseThumbnails = document.getElementById('btnCloseThumbnails');
        
        this.btnGrid?.addEventListener('click', () => {
            this.thumbSidebar?.classList.toggle('open');
            this.renderThumbnails();
        });
        this.btnCloseThumbnails?.addEventListener('click', () => {
            this.thumbSidebar?.classList.remove('open');
        });

        // Interactive Pan & Zoom Engine
        this.setupGestures();
    }

    startIdleTimer() {
        const resetIdle = () => {
            this.toolbar?.classList.remove('hide-on-idle');
            const navbar = document.querySelector('.sp-header');
            if(navbar) navbar.style.transform = 'translateY(0)';
            
            clearTimeout(this.idleTimeout);
            this.idleTimeout = setTimeout(() => {
                this.toolbar?.classList.add('hide-on-idle');
                if(navbar) navbar.style.transform = 'translateY(-100%)';
            }, 3000);
        };
        
        document.addEventListener('mousemove', resetIdle);
        document.addEventListener('touchstart', resetIdle, {passive: true});
        document.addEventListener('keydown', resetIdle);
        resetIdle();
        
        window.addEventListener('resize', () => {
            const wasMobile = this.isMobileViewport;
            this.isMobileViewport = this.isMobileDevice();
            
            // Toggle double page view for mobile portrait
            if (this.isMobileViewport && window.innerHeight > window.innerWidth) {
                this.isDoublePage = false;
            } else {
                this.isDoublePage = true;
            }
            
            if (this.pageRatio) {
                if (wasMobile !== this.isMobileViewport || !this.isDoublePage) {
                    this.buildFlipbookDom(); // Re-build for single/double toggle
                } else {
                    this.updateFlipbookDimensions();
                }
            }
        });

        // Trigger initial layout check
        this.isMobileViewport = this.isMobileDevice();
        if (this.isMobileViewport && window.innerHeight > window.innerWidth) {
            this.isDoublePage = false;
        }
    }

    setupGestures() {
        let touchStartX = 0;
        let initialPinch = null;

        const onStart = (e) => {
            if (e.touches && e.touches.length === 2) {
                initialPinch = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                return;
            }
            if (this.zoomLevel > 1) {
                const pt = e.touches ? e.touches[0] : e;
                if (e.target.closest('.sp-bottom-toolbar') || e.target.closest('.sp-header')) return;
                this.isDragging = true;
                this.dragStartX = pt.clientX - this.translateX;
                this.dragStartY = pt.clientY - this.translateY;
                this.panZoomWrapper.classList.add('dragging');
            } else if (e.touches) {
                touchStartX = e.touches[0].screenX;
            }
        };

        const onMove = (e) => {
            if (e.touches && e.touches.length === 2) {
                e.preventDefault();
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                if (initialPinch) {
                    const delta = dist - initialPinch;
                    if (Math.abs(delta) > 5) { // Increased sensitivity
                        this.setZoom(this.zoomLevel + (delta > 0 ? 0.08 : -0.08));
                        initialPinch = dist;
                    }
                }
                return;
            }

            if (this.isDragging && this.zoomLevel > 1) {
                e.preventDefault();
                const pt = e.touches ? e.touches[0] : e;
                this.translateX = pt.clientX - this.dragStartX;
                this.translateY = pt.clientY - this.dragStartY;
                this.updateTransform();
            }
        };

        const onEnd = (e) => {
            initialPinch = null;
            if (this.isDragging) {
                this.isDragging = false;
                this.panZoomWrapper.classList.remove('dragging');
            } else if (this.zoomLevel === 1 && e.changedTouches) {
                const touchEndX = e.changedTouches[0].screenX;
                if (touchEndX < touchStartX - 50) this.flipNext();
                if (touchEndX > touchStartX + 50) this.flipPrev();
            }
        };

        this.stage.addEventListener('mousedown', onStart);
        window.addEventListener('mousemove', onMove, {passive: false});
        window.addEventListener('mouseup', onEnd);
        
        this.stage.addEventListener('touchstart', onStart, {passive: false});
        window.addEventListener('touchmove', onMove, {passive: false});
        window.addEventListener('touchend', onEnd);
        
        let wheelTimeout;
        this.stage.addEventListener('wheel', (e) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                this.setZoom(this.zoomLevel + (e.deltaY > 0 ? -0.1 : 0.1));
            } else if (this.zoomLevel === 1) {
                if (wheelTimeout) return;
                wheelTimeout = setTimeout(() => wheelTimeout = null, 300);
                if (e.deltaY > 20) this.flipNext();
                else if (e.deltaY < -20) this.flipPrev();
            }
        }, {passive: false});
    }

    setZoom(level) {
        this.zoomLevel = Math.max(1.0, Math.min(level, 4));
        if (this.zoomSliderInput) {
            this.zoomSliderInput.value = this.zoomLevel;
        }
        
        if (this.zoomLevel === 1) {
            this.translateX = 0;
            this.translateY = 0;
            document.body.classList.remove('is-zoomed');
        } else {
            document.body.classList.add('is-zoomed');
        }
        this.updateTransform();
    }

    updateTransform() {
        if(this.panZoomWrapper) {
            if (this.zoomLevel <= 1) {
                // Instantly reset if not zoomed
                this.translateX = 0;
                this.translateY = 0;
            } else {
                // Apply strict bounding box constraints to prevent flying off screen
                let maxDistX = window.innerWidth * (this.zoomLevel - 1) * 0.6;
                let maxDistY = window.innerHeight * (this.zoomLevel - 1) * 0.6;
                
                // Guarantee a soft minimum bounds to avoid getting stuck if window is small
                maxDistX = Math.max(150, maxDistX);
                maxDistY = Math.max(150, maxDistY);
                
                this.translateX = Math.max(-maxDistX, Math.min(this.translateX, maxDistX));
                this.translateY = Math.max(-maxDistY, Math.min(this.translateY, maxDistY));
            }
            this.panZoomWrapper.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.zoomLevel})`;
        }
    }

    setFilename() {
        if (!this.elTitle) return;
        try {
            let name = this.pdfUrl.split('/').pop().split('?')[0];
            this.elTitle.textContent = decodeURIComponent(name).replace('.pdf', '') || 'Magazine';
        } catch(e) {}
    }

    showError(msg) {
        if(this.loader) {
            this.loader.innerHTML = `<p style="color: #e74c3c; font-weight:bold;">${msg}</p>`;
        }
    }

    async loadPDF() {
        if (typeof pdfjsLib === 'undefined') {
            this.showError("PDF.js engine is not loaded correctly. Please check network/cache.");
            return;
        }
        
        try {
            this.pdfDoc = await pdfjsLib.getDocument(this.pdfUrl).promise;
            
            // Calculate uncropped native aspect ratio
            const page1 = await this.pdfDoc.getPage(1);
            const vp = page1.getViewport({scale: 1});
            this.pageRatio = vp.width / vp.height;
            
            this.totalPages = this.pdfDoc.numPages;
            if (this.elPageTot) this.elPageTot.textContent = this.totalPages;
            this.buildFlipbookDom();
            
            // Analytics tracking
            if (window.magazineTracker && typeof window.magazineTracker.incrementView === 'function') {
                let magName = this.elTitle ? this.elTitle.textContent : this.pdfUrl;
                window.magazineTracker.incrementView(magName);
            }
        } catch (e) {
            console.error("PDF Load Error:", e);
            this.showError(`Failed to load PDF.<br>URL: ${this.pdfUrl}<br>Reason: ${e.message || String(e)}`);
        }
    }

    buildFlipbookDom() {
        this.flipbook.innerHTML = '';
        this.canvasElements = new Array(this.totalPages + 1).fill(null);
        this.sheets = [];
        
        if (this.isDoublePage) {
            this.flipbook.classList.remove('single-page');
            this.totalSheets = Math.ceil(this.totalPages / 2);
        } else {
            this.flipbook.classList.add('single-page');
            this.totalSheets = this.totalPages;
        }

        this.currentSheetIndex = 0;

        for (let i = 0; i < this.totalSheets; i++) {
            const sheet = document.createElement('div');
            sheet.className = 'sheet';
            
            const front = document.createElement('div');
            front.className = 'face front';
            const back = document.createElement('div');
            back.className = 'face back';

            sheet.appendChild(front);
            sheet.appendChild(back);
            this.flipbook.appendChild(sheet);
            this.sheets.push(sheet);
        }

        this.updateZIndices();
        this.updatePagingStatus();
        this.updateFlipbookDimensions();
        
        if(this.loader) this.loader.style.display = 'none';
        this.lazyRender();
    }

    updateFlipbookDimensions() {
        if(!this.pageRatio || !this.flipbook) return;
        
        // Use 85vh and 90vw bounds natively to prevent page explosion
        const maxH = window.innerHeight * 0.85;
        const maxW = window.innerWidth * 0.90;
        
        const currentRatio = this.isDoublePage ? (this.pageRatio * 2) : this.pageRatio;
        
        let targetH = maxH;
        let targetW = targetH * currentRatio;
        
        if (targetW > maxW) {
            targetW = maxW;
            targetH = targetW / currentRatio;
        }
        
        this.flipbook.style.width = `${targetW}px`;
        this.flipbook.style.height = `${targetH}px`;
        
        // Centering logic for spreads that show a single odd cover page
        let shiftX = 0;
        if (this.isDoublePage) {
            if (this.currentSheetIndex === 0 && this.totalPages > 1) {
                // Front cover (right side) - shift left to center the right half
                shiftX = -25;
            } else if (this.currentSheetIndex === this.totalSheets) {
                // Back cover (left side) - shift right to center the left half
                shiftX = 25;
            }
        }
        this.flipbook.style.transform = `translateX(${shiftX}%)`;
    }

    async lazyRender() {
        let targets = [this.currentSheetIndex - 1, this.currentSheetIndex, this.currentSheetIndex + 1];
        let operations = [];
        
        for (let idx of targets) {
            if (idx >= 0 && idx < this.totalSheets) {
                if (this.isDoublePage) {
                    let p1 = idx * 2 + 1;
                    let p2 = idx * 2 + 2;
                    if (p1 <= this.totalPages) {
                        operations.push(this.ensureCanvas(p1, this.sheets[idx].querySelector('.front')));
                    }
                    if (p2 <= this.totalPages) {
                        operations.push(this.ensureCanvas(p2, this.sheets[idx].querySelector('.back')));
                    }
                } else {
                    let p = idx + 1;
                    if (p <= this.totalPages) {
                        operations.push(this.ensureCanvas(p, this.sheets[idx].querySelector('.front')));
                    }
                }
            }
        }
        await Promise.all(operations);
    }

    async ensureCanvas(pageNum, node) {
        if (this.canvasElements[pageNum]) {
            if (!node.contains(this.canvasElements[pageNum])) {
                node.innerHTML = '';
                node.appendChild(this.canvasElements[pageNum]);
            }
            return;
        }

        if (!this.renderPromises[pageNum]) {
            if (!node.querySelector('.page-loader')) {
                node.innerHTML = '<div class="page-loader"></div>';
            }
            this.renderPromises[pageNum] = (async () => {
                const page = await this.pdfDoc.getPage(pageNum);
                const viewport = page.getViewport({ scale: 1.5 });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                
                // willReadFrequently set to natively extract pixel data for Ambilight without breaking rendering pipe
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                await page.render({ canvasContext: ctx, viewport }).promise;
                this.canvasElements[pageNum] = canvas;
                
                // Ambilight projection from active center sheets
                if (this.ambientGlow && (pageNum === this.currentPage || pageNum === this.currentPage + 1)) {
                    try {
                        let w = Math.floor(canvas.width / 2);
                        let h = Math.floor(canvas.height / 2);
                        let data = ctx.getImageData(w, h, 1, 1).data;
                        this.ambientGlow.style.setProperty('--glow-color', `rgba(${data[0]}, ${data[1]}, ${data[2]}, 0.35)`);
                    } catch(e) {}
                }
                
                if (node.querySelector('.page-loader')) {
                    node.innerHTML = '';
                    node.appendChild(canvas);
                }
            })();
        }
        await this.renderPromises[pageNum];
    }

    async renderThumbnails() {
        if (this.thumbnailsRendered || !this.pdfDoc) return;
        this.thumbnailsRendered = true;
        
        for (let i = 1; i <= this.totalPages; i++) {
            const item = document.createElement('div');
            item.className = 'thumb-item';
            
            const canvas = document.createElement('canvas');
            const label = document.createElement('span');
            label.textContent = "Page " + i;
            
            item.appendChild(canvas);
            item.appendChild(label);
            
            item.addEventListener('click', () => {
                this.gotoPage(i);
                this.thumbSidebar?.classList.remove('open');
            });
            
            this.thumbGrid.appendChild(item);
            
            this.pdfDoc.getPage(i).then(page => {
                const viewport = page.getViewport({ scale: 0.3 }); // Small thumbnail
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const ctx = canvas.getContext('2d');
                page.render({ canvasContext: ctx, viewport });
            });
        }
    }

    gotoPage(pageNum) {
        if(pageNum < 1 || pageNum > this.totalPages) return;
        let targetSheet;
        if (this.isDoublePage) {
            targetSheet = Math.floor(pageNum / 2);
        } else {
            targetSheet = pageNum - 1;
        }
        if (targetSheet >= this.totalSheets) targetSheet = this.totalSheets - 1;
        if (targetSheet < 0) targetSheet = 0;

        for(let i=0; i<this.totalSheets; i++) {
            if(i < targetSheet) {
                this.sheets[i].classList.add('flipped');
            } else {
                this.sheets[i].classList.remove('flipped');
            }
        }
        this.currentSheetIndex = targetSheet;
        this.updateZIndices();
        this.updatePagingStatus();
        this.updateFlipbookDimensions();
        this.lazyRender();
    }

    flipNext() {
        const maxIdx = this.isDoublePage ? this.totalSheets : (this.totalSheets - 1);
        if (this.currentSheetIndex < maxIdx) {
            let s = this.sheets[this.currentSheetIndex];
            if(s) s.classList.add('flipped');
            this.currentSheetIndex++;
            this.updateZIndices();
            this.updatePagingStatus();
            this.updateFlipbookDimensions();
            this.lazyRender();
        }
    }

    flipPrev() {
        if (this.currentSheetIndex > 0) {
            this.currentSheetIndex--;
            let s = this.sheets[this.currentSheetIndex];
            if(s) s.classList.remove('flipped');
            this.updateZIndices();
            this.updatePagingStatus();
            this.updateFlipbookDimensions();
            this.lazyRender();
        }
    }

    updateZIndices() {
        for (let i = 0; i < this.totalSheets; i++) {
            this.sheets[i].style.zIndex = (i < this.currentSheetIndex) ? i : (this.totalSheets - i);
        }
    }

    updatePagingStatus() {
        if (this.isDoublePage) {
            this.currentPage = (this.currentSheetIndex === 0) ? 1 : (this.currentSheetIndex * 2);
            let endPage = this.currentSheetIndex > 0 && this.currentSheetIndex < this.totalSheets ? `-${this.currentPage+1}` : "";
            if (this.totalPages === 1) endPage = "";
            
            if (this.elPageCur) {
                if(this.currentPage === 1 && this.totalPages > 1) {
                    this.elPageCur.textContent = "1";
                } else {
                    this.elPageCur.textContent = `${this.currentPage}${endPage}`;
                }
            }
        } else {
            this.currentPage = this.currentSheetIndex + 1;
            if (this.elPageCur) {
                this.elPageCur.textContent = `${this.currentPage}`;
            }
        }
        
        if (this.currentSheetIndex > 0 && this.currentSheetIndex < this.totalSheets) {
            this.flipbook.classList.add('is-open');
        } else {
            this.flipbook.classList.remove('is-open');
        }
        
        // Show/hide arrows based on position
        const maxIdx = this.isDoublePage ? this.totalSheets : (this.totalSheets - 1);
        if (this.btnPrev) {
            this.btnPrev.style.display = (this.currentSheetIndex > 0) ? 'flex' : 'none';
        }
        if (this.btnNext) {
            this.btnNext.style.display = (this.currentSheetIndex < maxIdx) ? 'flex' : 'none';
        }
        
        if (this.progressFill && this.totalSheets > 0) {
            let progress = (this.currentSheetIndex / this.totalSheets) * 100;
            this.progressFill.style.width = Math.min(progress, 100) + '%';
        }
        
        this.extractAmbilightColor();
    }

    extractAmbilightColor() {
        if (!this.ambientGlow) return;
        let targetNum = (this.currentSheetIndex === 0) ? 1 : this.currentPage;
        const canvas = this.canvasElements[targetNum];
        if (canvas) {
            try {
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                let w = Math.floor(canvas.width / 2);
                let h = Math.floor(canvas.height / 2);
                let data = ctx.getImageData(w, h, 1, 1).data;
                this.ambientGlow.style.setProperty('--glow-color', `rgba(${data[0]}, ${data[1]}, ${data[2]}, 0.35)`);
            } catch(e) {}
        }
    }
}

// Boot engine securely
document.addEventListener('DOMContentLoaded', () => {
    window.magazineEngine = new MagazineEngine();
});

// Mobile menu toggle
function toggleMenu() {
    const nav = document.querySelector('nav');
    const menuToggle = document.querySelector('.menu-toggle');
    if (nav) {
        nav.classList.toggle('show');
        const isExpanded = nav.classList.contains('show');
        if (menuToggle) menuToggle.setAttribute('aria-expanded', isExpanded);
    }
}
