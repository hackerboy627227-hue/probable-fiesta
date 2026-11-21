(() => {
    const existing = document.getElementById('pro-bot-root');
    if (existing) existing.remove();

    const CONFIG = {
        API_KEY: 'AQ.Ab8RN6LUXzvAwn_HdAbHSrLpz91EjpMKZrXPBVkvu-6Gjp72Yg',
        MODELS: [
            'gemini-3.5-flash-lite',
            'gemini-3.1-flash-lite',
            'gemini-2.5-flash-lite',
            'gemini-3.6-flash',
            'gemini-2.5-flash',
            'gemini-3.8-flash'
        ]
    };

    let isScanning = false;
    let panelMovedManually = false;
    let textPriceTicks = [];
    let pillYTicks = [];

    // ==========================================
    // ১. WebGL ও 2D লাইভ ক্যাপচার হুক
    // ==========================================
    window.__rhpCapturePending = false;
    window.__rhpCapturedGL = null;
    let glMicrotaskQueued = false;

    function countVividPixels(canvas) {
        try {
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let hits = 0;
            for (let i = 0; i < data.length; i += 16) {
                const r = data[i], g = data[i + 1], b = data[i + 2];
                if ((g > 75 && g - r > 15 && g >= b - 15) || (r > 85 && r - g > 15 && r >= b - 15)) hits++;
            }
            return hits;
        } catch (_) {
            return 0;
        }
    }

    function captureFromGLContext(gl) {
        try {
            const c = gl.canvas;
            if (!c || c.width < 200 || c.height < 150) return;

            const ratio = c.height / Math.max(1, c.width);
            const targetW = Math.min(Math.max(c.width, 420), 900);
            const targetH = Math.round(targetW * ratio);

            const off = document.createElement('canvas');
            off.width = targetW;
            off.height = targetH;
            const octx = off.getContext('2d', { willReadFrequently: true });
            octx.fillStyle = '#131722';
            octx.fillRect(0, 0, targetW, targetH);

            octx.drawImage(c, 0, 0, targetW, targetH);
            let hits = countVividPixels(off);

            if (hits < 12) {
                const bw = gl.drawingBufferWidth;
                const bh = gl.drawingBufferHeight;
                if (bw >= 200 && bh >= 150) {
                    const raw = new Uint8Array(bw * bh * 4);
                    gl.readPixels(0, 0, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, raw);

                    const tmp = document.createElement('canvas');
                    tmp.width = bw;
                    tmp.height = bh;
                    const tctx = tmp.getContext('2d');
                    const imgData = tctx.createImageData(bw, bh);
                    const dst = imgData.data;
                    const rowBytes = bw * 4;
                    for (let y = 0; y < bh; y++) {
                        const srcOff = (bh - 1 - y) * rowBytes;
                        dst.set(raw.subarray(srcOff, srcOff + rowBytes), y * rowBytes);
                    }
                    tctx.putImageData(imgData, 0, 0);

                    octx.fillStyle = '#131722';
                    octx.fillRect(0, 0, targetW, targetH);
                    octx.drawImage(tmp, 0, 0, targetW, targetH);
                    hits = countVividPixels(off);
                }
            }

            if (hits >= 12) {
                window.__rhpCapturedGL = { canvas: off, colorPixels: hits, t: performance.now() };
                window.__rhpCapturePending = false;
            }
        } catch (_) {}
    }

    function hookGLDraw(proto, fnName) {
        if (!proto || !proto[fnName] || proto[`__rhp_${fnName}`]) return;
        proto[`__rhp_${fnName}`] = true;
        const orig = proto[fnName];
        proto[fnName] = function () {
            if (window.__rhpCapturePending && !glMicrotaskQueued) {
                const gl = this;
                if (gl && gl.canvas && gl.canvas.width >= 200 && gl.canvas.height >= 150) {
                    glMicrotaskQueued = true;
                    queueMicrotask(() => {
                        glMicrotaskQueued = false;
                        if (window.__rhpCapturePending) {
                            captureFromGLContext(gl);
                        }
                    });
                }
            }
            return orig.apply(this, arguments);
        };
    }

    if (window.WebGLRenderingContext) {
        hookGLDraw(WebGLRenderingContext.prototype, 'drawArrays');
        hookGLDraw(WebGLRenderingContext.prototype, 'drawElements');
    }
    if (window.WebGL2RenderingContext) {
        hookGLDraw(WebGL2RenderingContext.prototype, 'drawArrays');
        hookGLDraw(WebGL2RenderingContext.prototype, 'drawElements');
        hookGLDraw(WebGL2RenderingContext.prototype, 'drawArraysInstanced');
        hookGLDraw(WebGL2RenderingContext.prototype, 'drawElementsInstanced');
    }

    if (!HTMLCanvasElement.prototype.__rhpGetCtxHooked) {
        HTMLCanvasElement.prototype.__rhpGetCtxHooked = true;
        const origGetCtx = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, attrs) {
            if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
                attrs = Object.assign({}, attrs, { preserveDrawingBuffer: true });
            }
            return origGetCtx.call(this, type, attrs);
        };
    }

    if (!CanvasRenderingContext2D.prototype.__rhpTextHooked) {
        CanvasRenderingContext2D.prototype.__rhpTextHooked = true;
        const origFillText = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (text, x, y) {
            try {
                const c = this.canvas;
                const str = String(text || '').trim();
                const fs = String(this.fillStyle || '').toLowerCase();
                const isWhite = fs === '#ffffff' || fs === '#fff' || fs === 'rgb(255, 255, 255)';
                if (c && c.width >= 200 && isWhite && x > c.width * 0.70 && /^\d{1,5}\.\d{2,6}$/.test(str)) {
                    const val = parseFloat(str);
                    if (!isNaN(val) && val > 0) {
                        window.__rhpLastLivePrice = { val, t: performance.now() };
                    }
                }
            } catch (_) {}
            return origFillText.apply(this, arguments);
        };
    }

    // ==========================================
    // ২. CSS স্টাইল
    // ==========================================
    const style = document.createElement('style');
    style.textContent = `
        #pro-bot-root * { box-sizing: border-box; font-family: 'Segoe UI', Roboto, sans-serif; user-select: none; -webkit-tap-highlight-color: transparent; }
        #pro-bot-toggle {
            position: fixed; top: 68px; left: 20px; width: 56px; height: 56px; border-radius: 50%;
            background: rgba(6, 38, 28, 0.94); border: 2px solid #00e676;
            box-shadow: 0 4px 12px rgba(0,0,0,0.45), inset 0 0 0 2px rgba(0,230,118,0.22);
            color: #00e676; font-weight: 800; font-size: 15px; letter-spacing: 1px;
            display: flex; align-items: center; justify-content: center; cursor: grab; z-index: 9999999; touch-action: none;
        }
        @keyframes spin360 { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        #pro-bot-panel {
            position: fixed; top: 136px; left: 50%; transform: translateX(-50%);
            width: min(300px, calc(100vw - 24px));
            background: linear-gradient(165deg, rgba(10, 24, 34, 0.94) 0%, rgba(6, 15, 22, 0.97) 100%);
            backdrop-filter: blur(16px); border: 2px solid #00ff88; border-radius: 18px;
            box-shadow: 0 0 26px rgba(0,255,136,0.5), inset 0 0 20px rgba(0,255,136,0.12);
            padding: 15px 16px 14px; color: #fff; z-index: 9999998; display: none; text-align: center;
        }
        #pro-bot-panel.active { display: block; }
        .bot-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 10px; border-bottom: 1px solid rgba(0,255,136,0.18); position: relative; cursor: move; touch-action: none; }
        .bot-header::after { content: ''; position: absolute; bottom: -1.5px; left: 0; width: 48%; height: 2.5px; background: #00ff88; }
        .bot-title { font-size: 14.5px; font-weight: 900; letter-spacing: 1px; }
        .bot-title span { color: #00e676; }
        .bot-close { width: 28px; height: 28px; border-radius: 50%; background: rgba(255,255,255,0.14); border: 1px solid rgba(255,255,255,0.22); color: #fff; font-size: 17px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .top-status { margin-top: 13px; font-size: 12px; font-weight: 800; letter-spacing: 3.5px; color: #00ff88; }
        .top-status.ready { color: #facc15; }
        .radar-wrap { display: flex; justify-content: center; margin: 13px 0 11px; cursor: pointer; }
        .radar-circle { width: 88px; height: 88px; border-radius: 50%; border: 2.5px solid #00ff88; box-shadow: 0 0 22px rgba(0,255,136,0.65), inset 0 0 18px rgba(0,255,136,0.3); position: relative; display: flex; align-items: center; justify-content: center; overflow: hidden; }
        .radar-inner { width: 54px; height: 54px; border-radius: 50%; border: 1.5px solid rgba(0,255,136,0.65); }
        .radar-sweep { position: absolute; inset: 0; border-radius: 50%; background: conic-gradient(from 0deg, rgba(0,255,136,0.65) 0deg, rgba(0,255,136,0.12) 50deg, transparent 85deg); opacity: 0; }
        .radar-sweep.spinning { opacity: 1; animation: spin360 1s linear infinite; }
        .radar-hand { position: absolute; top: 50%; left: 50%; width: 48%; height: 2.5px; background: linear-gradient(90deg, #00ff88, rgba(0,255,136,0.2)); transform-origin: 0% 50%; box-shadow: 0 0 10px #00ff88; }
        .radar-hand.spinning { animation: spin360 1s linear infinite; }
        .radar-dot { width: 9px; height: 9px; background: #00ffaa; border-radius: 50%; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); box-shadow: 0 0 12px #00ff88; }
        .sub-status { font-size: 13px; font-weight: 800; letter-spacing: 2.5px; color: #00ff88; margin-bottom: 10px; }
        .premium-label { font-size: 11px; font-weight: 800; letter-spacing: 2px; color: #fbbf24; margin-bottom: 8px; min-height: 15px; }
        .signal-wrap { position: relative; display: flex; justify-content: center; align-items: center; min-height: 64px; }
        .big-signal { position: relative; z-index: 2; font-size: 48px; font-weight: 900; letter-spacing: 3px; line-height: 1; padding: 4px 18px; }
        .big-signal.scanning { font-size: 18px; letter-spacing: 2px; color: #facc15; }
        .big-signal.up { color: #7dffb3; text-shadow: 0 0 10px #00ff88, 0 0 26px #00ff88, 0 0 55px rgba(0,255,136,0.95); }
        .big-signal.up::before { content: ''; position: absolute; inset: -6px -22px; border-radius: 50%; background: rgba(0,255,136,0.38); filter: blur(20px); z-index: -1; }
        .big-signal.down { color: #ff7a8a; text-shadow: 0 0 10px #ff1e3c, 0 0 26px #ff1e3c, 0 0 55px rgba(255,30,60,0.95); }
        .big-signal.down::before { content: ''; position: absolute; inset: -6px -22px; border-radius: 50%; background: rgba(255,30,60,0.44); filter: blur(20px); z-index: -1; }
        .bot-footer { margin-top: 10px; font-size: 10.5px; font-weight: 700; color: #e2e8f0; background: rgba(255,255,255,0.06); padding: 5px 8px; border-radius: 8px; }
    `;

    const root = document.createElement('div');
    root.id = 'pro-bot-root';
    root.innerHTML = `
        <div id="pro-bot-toggle">PRO</div>
        <div id="pro-bot-panel">
            <div class="bot-header" id="bot-drag-handle">
                <div class="bot-title">RABIT HASAN <span>PRO</span></div>
                <button class="bot-close" id="bot-close-btn">×</button>
            </div>
            <div class="top-status" id="top-status">SCANNING</div>
            <div class="radar-wrap" id="radar-rescan">
                <div class="radar-circle">
                    <div class="radar-sweep" id="radar-sweep"></div>
                    <div class="radar-inner"></div>
                    <div class="radar-hand" id="radar-hand"></div>
                    <div class="radar-dot"></div>
                </div>
            </div>
            <div class="sub-status" id="sub-status">SCANNING...</div>
            <div class="premium-label" id="premium-label"></div>
            <div class="signal-wrap"><div class="big-signal scanning" id="big-signal">...</div></div>
            <div class="bot-footer" id="bot-diag">READY</div>
        </div>
    `;
    document.head.appendChild(style);
    document.body.appendChild(root);

    function makeDraggable(targetEl, handleEl, onTapCallback, onMoveDone) {
        let startX = 0, startY = 0, origLeft = 0, origTop = 0, activePointerId = null, hasMoved = false;
        const clamp = (l, t) => ({
            left: Math.max(6, Math.min(l, window.innerWidth - targetEl.offsetWidth - 6)),
            top: Math.max(6, Math.min(t, window.innerHeight - targetEl.offsetHeight - 6))
        });
        handleEl.addEventListener('pointerdown', (e) => {
            if (e.target.closest('button')) return;
            activePointerId = e.pointerId;
            try { handleEl.setPointerCapture(e.pointerId); } catch (_) {}
            const r = targetEl.getBoundingClientRect();
            startX = e.clientX; startY = e.clientY; origLeft = r.left; origTop = r.top; hasMoved = false;
        });
        handleEl.addEventListener('pointermove', (e) => {
            if (e.pointerId !== activePointerId) return;
            const dx = e.clientX - startX, dy = e.clientY - startY;
            if (Math.abs(dx) > 14 || Math.abs(dy) > 14) hasMoved = true;
            if (hasMoved) {
                const pos = clamp(origLeft + dx, origTop + dy);
                targetEl.style.left = pos.left + 'px'; targetEl.style.top = pos.top + 'px'; targetEl.style.transform = 'none';
                if (onMoveDone) onMoveDone();
            }
        });
        const endP = (e) => {
            if (e.pointerId !== activePointerId) return;
            activePointerId = null;
            try { handleEl.releasePointerCapture(e.pointerId); } catch (_) {}
            if (!hasMoved && onTapCallback) onTapCallback();
        };
        handleEl.addEventListener('pointerup', endP);
        handleEl.addEventListener('pointercancel', endP);
    }

    function collectAllCanvases() {
        const list = [...document.querySelectorAll('canvas')];
        document.querySelectorAll('iframe').forEach(f => {
            try { if (f.contentDocument) list.push(...f.contentDocument.querySelectorAll('canvas')); } catch (_) {}
        });
        return list.filter(c => {
            const r = c.getBoundingClientRect();
            return r.width >= 150 && r.height >= 120 && window.getComputedStyle(c).display !== 'none';
        });
    }

    function readLivePillPrice(canvas) {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const w = canvas.width, h = canvas.height, xStart = Math.floor(w * 0.78), stripW = w - xStart;
        if (stripW <= 5) return null;
        const img = ctx.getImageData(xStart, 0, stripW, h).data;
        let sumY = 0, matchRows = 0;
        for (let y = Math.floor(h * 0.08); y < Math.floor(h * 0.92); y++) {
            let blueInRow = 0;
            for (let x = 0; x < stripW; x++) {
                const idx = (y * stripW + x) * 4;
                const r = img[idx], g = img[idx + 1], b = img[idx + 2];
                if (b > 130 && (b - r) > 50 && g > 50 && g < 225) blueInRow++;
            }
            if (blueInRow >= Math.max(4, stripW * 0.12)) { sumY += y; matchRows++; }
        }
        return matchRows >= 3 ? h - (sumY / matchRows) : null;
    }

    function try2DCapture(canvases) {
        if (canvases.length === 0) return null;
        const base = canvases[0];
        const ratio = base.height / Math.max(1, base.width);
        const targetW = Math.min(Math.max(base.width, 420), 900);
        const targetH = Math.round(targetW * ratio);
        const off = document.createElement('canvas');
        off.width = targetW; off.height = targetH;
        const ctx = off.getContext('2d', { willReadFrequently: true });
        ctx.fillStyle = '#131722';
        ctx.fillRect(0, 0, targetW, targetH);
        for (const c of canvases) {
            try { ctx.drawImage(c, 0, 0, targetW, targetH); } catch (_) {}
        }
        const px = countVividPixels(off);
        return { canvas: off, colorPixels: px };
    }

    async function captureChartFrameAsync() {
        const canvases = collectAllCanvases();
        if (canvases.length === 0) return null;

        const direct2D = try2DCapture(canvases);
        if (direct2D && direct2D.colorPixels >= 12) {
            const hooked = window.__rhpLastLivePrice;
            const textVal = (hooked && (performance.now() - hooked.t) < 2000) ? hooked.val : null;
            return { canvas: direct2D.canvas, colorPixels: direct2D.colorPixels, textVal, pillY: readLivePillPrice(direct2D.canvas), canvasCount: canvases.length };
        }

        window.__rhpCapturedGL = null;
        window.__rhpCapturePending = true;

        const targetC = canvases[0];
        const rect = targetC.getBoundingClientRect();
        try {
            const rx = rect.left + rect.width * (0.35 + Math.random() * 0.1);
            const ry = rect.top + rect.height * 0.5;
            targetC.dispatchEvent(new MouseEvent('mousemove', { clientX: rx, clientY: ry, bubbles: true }));
            targetC.dispatchEvent(new PointerEvent('pointermove', { clientX: rx, clientY: ry, bubbles: true }));
        } catch (_) {}

        for (let i = 0; i < 24; i++) {
            if (window.__rhpCapturedGL) break;
            await new Promise(r => setTimeout(r, 55));
        }
        window.__rhpCapturePending = false;

        if (window.__rhpCapturedGL) {
            const glSnap = window.__rhpCapturedGL;
            const hooked = window.__rhpLastLivePrice;
            const textVal = (hooked && (performance.now() - hooked.t) < 2000) ? hooked.val : null;
            return { canvas: glSnap.canvas, colorPixels: glSnap.colorPixels, textVal, pillY: readLivePillPrice(glSnap.canvas), canvasCount: canvases.length };
        }

        return { canvas: direct2D ? direct2D.canvas : null, colorPixels: 0, textVal: null, pillY: null, canvasCount: canvases.length };
    }

    function extractCandlesFromCanvas(canvas) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        const img = ctx.getImageData(0, 0, w, h).data;
        const xStart = Math.floor(w * 0.01), xEnd = Math.floor(w * 0.90);
        const yStart = Math.floor(h * 0.08), yEnd = Math.floor(h * 0.90);

        const cols = [];
        for (let x = xStart; x < xEnd; x++) {
            let gCount = 0, rCount = 0, minY = yEnd, maxY = yStart, maxRun = 0, curRun = 0;
            const yHits = [];
            for (let y = yStart; y < yEnd; y++) {
                const idx = (y * w + x) * 4;
                const r = img[idx], g = img[idx + 1], b = img[idx + 2];
                const isGreen = g > 75 && (g - r) > 15 && g >= (b - 15);
                const isRed = r > 85 && (r - g) > 15 && r >= (b - 15);
                if (isGreen || isRed) {
                    if (isGreen) gCount++; else rCount++;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                    yHits.push(y);
                    curRun++;
                    if (curRun > maxRun) maxRun = curRun;
                } else { curRun = 0; }
            }
            if (maxRun >= 3 && yHits.length >= 3) {
                cols.push({ x, type: gCount >= rCount ? 'G' : 'R', minY, maxY, yHits });
            }
        }

        const maxW = Math.max(100, Math.floor(w * 0.25));
        const groups = [];
        let cur = null;
        for (const col of cols) {
            if (!cur || (col.x - cur.lastX) > 2 || col.type !== cur.type) {
                if (cur && cur.cols.length >= 1 && cur.cols.length <= maxW) groups.push(cur);
                cur = { type: col.type, firstX: col.x, lastX: col.x, cols: [col] };
            } else { cur.lastX = col.x; cur.cols.push(col); }
        }
        if (cur && cur.cols.length >= 1 && cur.cols.length <= maxW) groups.push(cur);

        return groups.map(grp => {
            const width = grp.cols.length;
            let topY = yEnd, bottomY = yStart;
            const rowDensity = new Map();
            for (const col of grp.cols) {
                if (col.minY < topY) topY = col.minY;
                if (col.maxY > bottomY) bottomY = col.maxY;
                for (const y of col.yHits) rowDensity.set(y, (rowDensity.get(y) || 0) + 1);
            }
            const bodyThreshold = Math.max(1, Math.floor(width * 0.45));
            let bodyMinY = bottomY, bodyMaxY = topY, foundBody = false;
            for (const [y, cnt] of rowDensity.entries()) {
                if (cnt >= bodyThreshold) {
                    if (y < bodyMinY) bodyMinY = y;
                    if (y > bodyMaxY) bodyMaxY = y;
                    foundBody = true;
                }
            }
            if (!foundBody) { bodyMinY = topY; bodyMaxY = bottomY; }
            const high = h - topY, low = h - bottomY, bodyTop = h - bodyMinY, bodyBottom = h - bodyMaxY;
            const open = grp.type === 'G' ? bodyBottom : bodyTop;
            const close = grp.type === 'G' ? bodyTop : bodyBottom;
            return {
                type: grp.type, firstX: grp.firstX, lastX: grp.lastX, topY, bottomY,
                open, high, low, close,
                bodySize: Math.abs(close - open),
                upperWick: Math.max(0, high - Math.max(open, close)),
                lowerWick: Math.max(0, Math.min(open, close) - low)
            };
        });
    }

    function cropCandlesForAI(canvas, candles) {
        if (!candles || candles.length === 0) return canvas;
        const minX = Math.max(0, candles[0].firstX - 30);
        const maxX = Math.min(canvas.width, candles[candles.length - 1].lastX + 60);
        const minY = Math.max(0, Math.min(...candles.map(c => c.topY)) - 40);
        const maxY = Math.min(canvas.height, Math.max(...candles.map(c => c.bottomY)) + 40);
        const cw = maxX - minX, ch = maxY - minY;
        if (cw < 120 || ch < 100) return canvas;
        const cropped = document.createElement('canvas');
        cropped.width = Math.min(720, Math.max(360, cw));
        cropped.height = Math.round(cropped.width * (ch / cw));
        cropped.getContext('2d').drawImage(canvas, minX, minY, cw, ch, 0, 0, cropped.width, cropped.height);
        return cropped;
    }

    function calcEMAArray(values, period) {
        if (values.length === 0) return [];
        const p = Math.min(period, values.length), k = 2 / (p + 1), out = [];
        let ema = values.slice(0, p).reduce((a, b) => a + b, 0) / p;
        for (let i = 0; i < values.length; i++) {
            if (i < p) out.push(ema);
            else { ema = values[i] * k + ema * (1 - k); out.push(ema); }
        }
        return out;
    }

    function calcRSI(values, period = 7) {
        if (values.length < 4) return 50;
        const p = Math.min(period, values.length - 1), slice = values.slice(-(p + 1));
        let gains = 0, losses = 0;
        for (let i = 1; i < slice.length; i++) {
            const d = slice[i] - slice[i - 1];
            if (d >= 0) gains += d; else losses += Math.abs(d);
        }
        if (losses === 0) return 85;
        if (gains === 0) return 15;
        return 100 - (100 / (1 + (gains / p) / (losses / p)));
    }

    // সংশোধিত ব্যালেন্সড প্রাইস-অ্যাকশন ইঞ্জিন (জুম করা ও ব্রেকআউট ফিক্সসহ)
    function runQuantEngine(candles, scanTextTicks, scanPillTicks) {
        let bull = 0, bear = 0;

        if (candles.length >= 2) {
            const last = candles[candles.length - 1];
            const prev = candles[candles.length - 2];

            // ২-৫টি জুম করা ক্যান্ডেল থাকলে সরাসরি ক্যান্ডেল মোমেন্টাম ও উইক দেখবে
            if (candles.length <= 5) {
                if (last.close > prev.close && last.type === 'G') bull += 2.0;
                else if (last.close < prev.close && last.type === 'R') bear += 2.0;
                else if (last.type === 'G') bull += 1.0;
                else bear += 1.0;

                if (last.lowerWick > last.bodySize * 1.2) bull += 1.5;
                if (last.upperWick > last.bodySize * 1.2) bear += 1.5;
            } else {
                const closes = candles.map(c => c.close);
                const ema3 = calcEMAArray(closes, 3).pop();
                const ema9 = calcEMAArray(closes, 9).pop();
                const rsi7 = calcRSI(closes, 7);

                // ১. ফাস্ট ট্রেন্ড (EMA3 বনাম EMA9)
                if (ema3 > ema9) bull += 1.4;
                else if (ema3 < ema9) bear += 1.4;

                // ২. RSI শুধু ৮+ ক্যান্ডেল থাকলে এক্সট্রিম ওভারবট/ওভারসোল্ড চেক করবে
                if (candles.length >= 8) {
                    if (rsi7 >= 76) bear += 1.9;
                    else if (rsi7 <= 24) bull += 1.9;
                }

                // ৩. উইক রিজেকশন (Hammer / Shooting Star)
                if (last.lowerWick > last.bodySize * 1.3 && last.lowerWick > last.upperWick * 1.2) bull += 2.0;
                if (last.upperWick > last.bodySize * 1.3 && last.upperWick > last.lowerWick * 1.2) bear += 2.0;

                // ৪. এনগালফিং প্যাটার্ন
                if (prev.type === 'R' && last.type === 'G' && last.close > prev.open) bull += 2.1;
                if (prev.type === 'G' && last.type === 'R' && last.close < prev.open) bear += 2.1;

                // ৫. ব্রেকআউট বনাম রিজেকশন (শক্তিশালী সবুজ ব্রেকআউটকে আর DOWN ধরবে না!)
                const lb = candles.slice(-16, -1);
                if (lb.length >= 3) {
                    const res = Math.max(...lb.map(c => c.high)), sup = Math.min(...lb.map(c => c.low));
                    const span = Math.max(15, res - sup);

                    if (last.close > res && last.type === 'G' && last.bodySize > last.upperWick) {
                        bull += 2.0;
                    } else if ((res - last.high) < span * 0.12 && (last.type === 'R' || last.upperWick > last.bodySize * 0.9)) {
                        bear += 1.9;
                    }

                    if (last.close < sup && last.type === 'R' && last.bodySize > last.lowerWick) {
                        bear += 2.0;
                    } else if ((last.low - sup) < span * 0.12 && (last.type === 'G' || last.lowerWick > last.bodySize * 0.9)) {
                        bull += 1.9;
                    }
                }
            }
        }

        const tSrc = scanTextTicks.length >= 2 ? [...textPriceTicks.slice(-5), ...scanTextTicks] : [...pillYTicks.slice(-5), ...scanPillTicks];
        if (tSrc.length >= 2) {
            const net = tSrc[tSrc.length - 1] - tSrc[0];
            if (net > 0) bull += 1.7;
            else if (net < 0) bear += 1.7;
        }
        return { bull, bear };
    }

    async function analyzeWithGemini(croppedCanvas) {
        const base64Image = croppedCanvas.toDataURL('image/jpeg', 0.90).split(',')[1];
        const prompt = `Analyze the rightmost candlesticks on this 1-minute chart objectively (50/50 prior).
Return ONLY valid JSON: {"signal":"UP"} or {"signal":"DOWN"}`;
        const payload = {
            contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: base64Image } }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 2048, responseMimeType: 'application/json' }
        };
        let lastErr = 'NET';
        for (const model of CONFIG.MODELS) {
            try {
                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': CONFIG.API_KEY },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) { lastErr = `HTTP ${res.status}`; continue; }
                const data = await res.json();
                const parts = data?.candidates?.[0]?.content?.parts || [];
                const textPart = parts.find(p => !p.thought && p.text) || parts[parts.length - 1];
                const raw = (textPart?.text || '').replace(/```json|```/gi, '').trim();
                const m = raw.match(/\{[\s\S]*\}/);
                if (!m) continue;
                const sig = String(JSON.parse(m[0])?.signal || '').toUpperCase().trim();
                if (sig === 'UP' || sig === 'DOWN') return { ok: true, signal: sig };
            } catch (_) { continue; }
        }
        return { ok: false, reason: lastErr };
    }

    const toggleBtn = document.getElementById('pro-bot-toggle');
    const panel = document.getElementById('pro-bot-panel');
    const dragHandle = document.getElementById('bot-drag-handle');
    const closeBtn = document.getElementById('bot-close-btn');
    const radarWrap = document.getElementById('radar-rescan');
    const radarHand = document.getElementById('radar-hand');
    const radarSweep = document.getElementById('radar-sweep');
    const topStatus = document.getElementById('top-status');
    const subStatus = document.getElementById('sub-status');
    const premiumLabel = document.getElementById('premium-label');
    const bigSignal = document.getElementById('big-signal');
    const diagEl = document.getElementById('bot-diag');

    async function runAutoScan() {
        if (isScanning) return;
        isScanning = true;

        if (!panelMovedManually) {
            const tbRect = toggleBtn.getBoundingClientRect();
            const safeTop = Math.min(window.innerHeight - 340, tbRect.bottom + 10);
            panel.style.top = Math.max(70, safeTop) + 'px';
        }
        if (!panel.classList.contains('active')) panel.classList.add('active');

        radarHand.classList.add('spinning');
        radarSweep.classList.add('spinning');
        topStatus.className = 'top-status'; topStatus.textContent = 'SCANNING';
        subStatus.textContent = 'SCANNING...';
        premiumLabel.textContent = '';
        bigSignal.className = 'big-signal scanning'; bigSignal.textContent = 'ANALYZING...';
        diagEl.textContent = 'Capturing Live Chart...';

        const scanTextTicks = [], scanPillTicks = [];
        let latestFrame = null;

        for (let i = 0; i < 3; i++) {
            const fr = await captureChartFrameAsync();
            if (fr) {
                latestFrame = fr;
                if (fr.textVal !== null) {
                    scanTextTicks.push(fr.textVal);
                    textPriceTicks.push(fr.textVal);
                    if (textPriceTicks.length > 60) textPriceTicks.shift();
                }
                if (fr.pillY !== null) {
                    scanPillTicks.push(fr.pillY);
                    pillYTicks.push(fr.pillY);
                    if (pillYTicks.length > 60) pillYTicks.shift();
                }
            }
            if (i < 2) await new Promise(r => setTimeout(r, 550));
        }

        let finalSignal = null, candleCount = 0, gCnt = 0, rCnt = 0, aiStatus = 'OFF', bScore = 0, sScore = 0;

        if (latestFrame && latestFrame.canvas && latestFrame.colorPixels >= 12) {
            const candles = extractCandlesFromCanvas(latestFrame.canvas);
            candleCount = candles.length;
            gCnt = candles.filter(c => c.type === 'G').length;
            rCnt = candles.filter(c => c.type === 'R').length;

            const quant = runQuantEngine(candles, scanTextTicks, scanPillTicks);
            const aiRes = await analyzeWithGemini(cropCandlesForAI(latestFrame.canvas, candles));
            if (aiRes.ok) {
                aiStatus = aiRes.signal;
                if (aiRes.signal === 'UP') quant.bull += 2.5;
                else quant.bear += 2.5;
            } else {
                aiStatus = aiRes.reason;
            }

            bScore = quant.bull; sScore = quant.bear;
            if (candleCount >= 2 || aiRes.ok) {
                if (bScore > sScore) finalSignal = 'UP';
                else if (sScore > bScore) finalSignal = 'DOWN';
                else if (aiRes.ok) finalSignal = aiRes.signal;
                else finalSignal = candles[candles.length - 1].type === 'G' ? 'UP' : 'DOWN';
            }
        }

        radarHand.classList.remove('spinning');
        radarSweep.classList.remove('spinning');

        if (!finalSignal) {
            topStatus.className = 'top-status'; topStatus.textContent = 'NO SIGNAL DATA';
            subStatus.textContent = 'SCAN ERROR';
            premiumLabel.textContent = 'RABIT HASAN PRO';
            bigSignal.className = 'big-signal scanning'; bigSignal.textContent = 'NO DATA';
            const px = latestFrame ? latestFrame.colorPixels : 0;
            const cc = latestFrame ? latestFrame.canvasCount : 0;
            diagEl.textContent = `Canvases:${cc} • Px:${px} • C:${candleCount} • AI:${aiStatus}`;
        } else {
            topStatus.className = 'top-status ready'; topStatus.textContent = 'SIGNAL READY';
            subStatus.textContent = 'SCAN COMPLETE';
            premiumLabel.textContent = 'RABIT HASAN PRO';
            bigSignal.className = finalSignal === 'UP' ? 'big-signal up' : 'big-signal down';
            bigSignal.textContent = finalSignal;
            diagEl.textContent = `C:${candleCount}(G${gCnt}/R${rCnt}) • B:${bScore.toFixed(1)} S:${sScore.toFixed(1)} • AI:${aiStatus}`;
        }
        isScanning = false;
    }

    makeDraggable(toggleBtn, toggleBtn, runAutoScan);
    makeDraggable(panel, dragHandle, null, () => { panelMovedManually = true; });
    radarWrap.addEventListener('click', runAutoScan);
    closeBtn.addEventListener('click', () => panel.classList.remove('active'));
})();