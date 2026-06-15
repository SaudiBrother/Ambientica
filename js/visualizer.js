/* ============================================================
   VISUALIZER ENGINE
   Draws the main waveform/frequency visualizer.

   Optimization note: the original implementation called
   getComputedStyle() on every animation frame (60x / second) just
   to read the current theme's accent/surface colors. That forces a
   style recalculation every frame. Here, colors are cached and only
   refreshed when the theme actually changes (see refreshColors()).
   ============================================================ */

class VisualizerEngine {
    constructor(canvas, analyser) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false });
        this.analyser = analyser;
        this.mode = 'bars';
        this.dataArray = new Uint8Array(analyser.frequencyBinCount);
        this.colors = { accent: '#66fcf1', surface: '#23262e', muted: '#8b949e' };

        this.refreshColors();
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    /** Re-read theme colors from CSS custom properties. Call after a theme switch. */
    refreshColors() {
        const cs = getComputedStyle(document.documentElement);
        this.colors.accent = cs.getPropertyValue('--accent').trim() || this.colors.accent;
        this.colors.surface = cs.getPropertyValue('--surface').trim() || this.colors.surface;
        this.colors.muted = cs.getPropertyValue('--muted').trim() || this.colors.muted;
    }

    resize() {
        const parent = this.canvas.parentElement;
        this.canvas.width = parent.offsetWidth;
        this.canvas.height = parent.offsetHeight;
    }

    setMode(mode) {
        this.mode = mode;
    }

    draw() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const ctx = this.ctx;

        ctx.fillStyle = this.colors.surface;
        ctx.fillRect(0, 0, w, h);

        const accent = this.colors.accent;

        if (this.mode === 'wave') this.analyser.getByteTimeDomainData(this.dataArray);
        else this.analyser.getByteFrequencyData(this.dataArray);

        if (this.mode === 'bars') this.drawBars(ctx, w, h, accent);
        else if (this.mode === 'wave') this.drawWave(ctx, w, h, accent);
        else if (this.mode === 'circular') this.drawCircular(ctx, w, h, accent);
        else if (this.mode === 'mirror') this.drawMirror(ctx, w, h, accent);
        else if (this.mode === 'nebula') this.drawNebula(ctx, w, h, accent);
        else if (this.mode === 'spectrum') this.drawSpectrum(ctx, w, h, accent);
    }

    drawBars(ctx, w, h, color) {
        const bufferLength = this.analyser.frequencyBinCount;
        const barWidth = (w / bufferLength) * 2.5;
        let x = 0;
        ctx.fillStyle = color;
        for (let i = 0; i < bufferLength; i++) {
            const barHeight = (this.dataArray[i] / 255) * h;
            ctx.fillRect(x, h - barHeight, barWidth, barHeight);
            x += barWidth + 1;
        }
    }

    drawWave(ctx, w, h, color) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = color;
        ctx.beginPath();
        const sliceWidth = w * 1.0 / this.analyser.frequencyBinCount;
        let x = 0;
        for (let i = 0; i < this.analyser.frequencyBinCount; i++) {
            const v = this.dataArray[i] / 128.0;
            const y = v * h / 2;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            x += sliceWidth;
        }
        ctx.stroke();
    }

    drawCircular(ctx, w, h, color) {
        const cx = w / 2;
        const cy = h / 2;
        const radius = Math.min(w, h) / 3;
        const bars = 64;
        const step = Math.floor(this.analyser.frequencyBinCount / bars);

        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';

        for (let i = 0; i < bars; i++) {
            const value = this.dataArray[i * step];
            const angle = (i / bars) * Math.PI * 2;
            const barH = (value / 255) * (radius * 0.8);

            const x1 = cx + Math.cos(angle) * radius;
            const y1 = cy + Math.sin(angle) * radius;
            const x2 = cx + Math.cos(angle) * (radius + barH);
            const y2 = cy + Math.sin(angle) * (radius + barH);

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }
    }

    drawMirror(ctx, w, h, color) {
        const bufferLength = this.analyser.frequencyBinCount;
        const barWidth = (w / bufferLength) * 4;
        let x = 0;
        ctx.fillStyle = color;
        for (let i = 0; i < bufferLength; i++) {
            const barHeight = (this.dataArray[i] / 255) * (h / 2);
            ctx.globalAlpha = 0.8;
            ctx.fillRect(w / 2 + x, h / 2 - barHeight, barWidth, barHeight * 2);
            ctx.fillRect(w / 2 - x, h / 2 - barHeight, barWidth, barHeight * 2);
            x += barWidth + 1;
        }
        ctx.globalAlpha = 1;
    }

    drawNebula(ctx, w, h, color) {
        const bars = 30;
        const step = Math.floor(this.analyser.frequencyBinCount / bars);
        ctx.fillStyle = color;
        ctx.shadowBlur = 20;
        ctx.shadowColor = color;

        for (let i = 0; i < bars; i++) {
            const value = this.dataArray[i * step];
            if (value < 20) continue;

            const x = (Math.sin(i) * w / 2) + w / 2;
            const y = (Math.cos(i * Date.now() * 0.0001) * h / 2) + h / 2;
            const size = (value / 255) * 20;

            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.shadowBlur = 0;
    }

    /* New: log-scaled spectrum analyzer with Hz axis labels — closer to
       what a "Pro Audio Processor" actually shows than the linear bars. */
    drawSpectrum(ctx, w, h, color) {
        const bufferLength = this.analyser.frequencyBinCount;
        const sampleRate = this.analyser.context.sampleRate;
        const nyquist = sampleRate / 2;
        const minFreq = 30, maxFreq = Math.min(20000, nyquist);
        const labelH = 16;
        const plotH = h - labelH;
        const numBars = 80;
        const gap = 1;

        ctx.fillStyle = color;
        for (let i = 0; i < numBars; i++) {
            const freq = minFreq * Math.pow(maxFreq / minFreq, i / (numBars - 1));
            const bin = Math.min(bufferLength - 1, Math.round((freq / nyquist) * bufferLength));
            const value = this.dataArray[bin] / 255;
            const barH = value * plotH;
            const x = (i / numBars) * w;
            const barW = Math.max(1, w / numBars - gap);
            ctx.fillRect(x, plotH - barH, barW, barH);
        }

        // Frequency axis
        ctx.fillStyle = this.colors.muted;
        ctx.font = '10px var(--font-mono, monospace)';
        ctx.textBaseline = 'bottom';
        const marks = [50, 100, 250, 500, '1k', '2k', '5k', '10k', '20k'];
        const markValues = [50, 100, 250, 500, 1000, 2000, 5000, 10000, 20000];
        markValues.forEach((f, idx) => {
            if (f < minFreq || f > maxFreq) return;
            const pct = Math.log(f / minFreq) / Math.log(maxFreq / minFreq);
            const x = pct * w;
            const label = String(marks[idx]);
            const textW = ctx.measureText(label).width;
            ctx.fillText(label, Math.min(Math.max(0, x - textW / 2), w - textW), h - 2);
        });

        // Faint baseline
        ctx.strokeStyle = this.colors.muted;
        ctx.globalAlpha = 0.25;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, plotH + 0.5);
        ctx.lineTo(w, plotH + 0.5);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }
}

/* ============================================================
   EQ CURVE RENDERER
   Draws the *actual* combined frequency response of the EQ's
   three biquad filters using BiquadFilterNode.getFrequencyResponse().
   This turns three abstract gain sliders into a real, live EQ curve —
   exactly what every hardware/software EQ shows.
   ============================================================ */
class EQCurveRenderer {
    /** @param {HTMLCanvasElement} canvas @param {() => {low:BiquadFilterNode, mid:BiquadFilterNode, high:BiquadFilterNode}} getNodes */
    constructor(canvas, getNodes) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.getNodes = getNodes;

        this.N = 96;
        this.freqs = new Float32Array(this.N);
        for (let i = 0; i < this.N; i++) {
            this.freqs[i] = 20 * Math.pow(1000, i / (this.N - 1)); // 20Hz -> 20kHz, log scale
        }
        this.magLow = new Float32Array(this.N);
        this.magMid = new Float32Array(this.N);
        this.magHigh = new Float32Array(this.N);
        this.phaseScratch = new Float32Array(this.N);

        this._lastColors = { accent: '#66fcf1', muted: 'rgba(255,255,255,0.15)' };

        if (window.ResizeObserver) {
            this._ro = new ResizeObserver(() => { this.resize(); this.draw(); });
            this._ro.observe(canvas);
        } else {
            window.addEventListener('resize', () => { this.resize(); this.draw(); });
        }
        this.resize();
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        const w = Math.max(1, Math.round(rect.width));
        const h = Math.max(1, Math.round(rect.height));
        this.canvas.width = w * dpr;
        this.canvas.height = h * dpr;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this._w = w;
        this._h = h;
    }

    /** @param {string} [accent] @param {string} [muted] */
    draw(accent, muted) {
        if (accent) this._lastColors.accent = accent;
        if (muted) this._lastColors.muted = muted;

        const nodes = this.getNodes();
        if (!nodes) return;

        const w = this._w, h = this._h;
        const ctx = this.ctx;
        ctx.clearRect(0, 0, w, h);

        nodes.low.getFrequencyResponse(this.freqs, this.magLow, this.phaseScratch);
        nodes.mid.getFrequencyResponse(this.freqs, this.magMid, this.phaseScratch);
        nodes.high.getFrequencyResponse(this.freqs, this.magHigh, this.phaseScratch);

        // 0 dB reference line
        ctx.strokeStyle = this._lastColors.muted;
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;

        const dbRange = 24; // +/-24dB maps to full height, matching slider range
        const curveY = (i) => {
            const totalMag = this.magLow[i] * this.magMid[i] * this.magHigh[i];
            const db = 20 * Math.log10(Math.max(totalMag, 1e-6));
            const clamped = Math.max(-dbRange, Math.min(dbRange, db));
            return h / 2 - (clamped / dbRange) * (h / 2);
        };

        // Fill under the curve
        ctx.beginPath();
        ctx.moveTo(0, curveY(0));
        for (let i = 1; i < this.N; i++) ctx.lineTo((i / (this.N - 1)) * w, curveY(i));
        ctx.lineTo(w, h / 2);
        ctx.lineTo(0, h / 2);
        ctx.closePath();
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = this._lastColors.accent;
        ctx.fill();
        ctx.globalAlpha = 1;

        // Stroke the curve line on top
        ctx.beginPath();
        ctx.moveTo(0, curveY(0));
        for (let i = 1; i < this.N; i++) ctx.lineTo((i / (this.N - 1)) * w, curveY(i));
        ctx.lineWidth = 2;
        ctx.strokeStyle = this._lastColors.accent;
        ctx.stroke();
    }
}
