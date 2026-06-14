/* ============================================================
   AMBIENTICA - app.js
   Main application controller for the FX rack.

   Key fixes vs the previous version (see README.md "Apa yang Baru"):
   - TRUE BYPASS: per-effect bypass no longer silences the rest of
     the chain (it used to zero the whole signal path downstream).
   - Removed a duplicate requestAnimationFrame loop that was being
     started every time Play was pressed.
   - Compressor knee/attack/release are now actually applied when
     exporting, and a Knee control was added.
   - Reverb "Size" (decay) now actually changes the impulse length —
     previously it had no audible effect at all.
   - Full session persistence (every parameter, theme, master volume,
     visualizer mode) with backward-compatible migration.
   - Offline-capable PWA: registers a service worker for offline use.
   ============================================================ */

class DAWApp {
    constructor() {
        this.dom = {};
        this.audio = { ctx: null, nodes: {}, masterGain: null, analyser: null, sourceNode: null };
        this.state = {
            isPlaying: false, fileLoaded: false, audioBuffer: null,
            startTime: 0, startOffset: 0,
            fxChainOrder: [], fxParams: {},
            compareMode: false,
            masterVolume: 1, lastVolume: 1
        };
        this.vizEngine = null;
        this.eqCurve = null;
        this.masterVolumeSlider = null;
        this._saveTimer = null;
        this._reverbDebounce = null;
        this._resolveConfirm = () => {};
        this._meterData = null;
    }

    /* ---------------------------------------------------------- INIT */

    init() {
        this.cacheDOM();
        this.initState();
        this.initAudioContext();
        this.initUI();
        this.initMasterVolume();
        this.initEventListeners();
        this.initKeyboardShortcuts();
        this.initDragDropFile();
        this.renderFXChain();
        this.applyTheme(document.documentElement.className, false);
        this.initAudioGate();
        this.registerServiceWorker();
        this.initInstallPrompt();
        this.loop();
    }

    cacheDOM() {
        const $ = (s) => document.querySelector(s);
        this.dom = {
            fileInput: $('#file-input'), uploadBtn: $('#upload-trigger-btn'),
            fileName: $('#file-name'), playBtn: $('#play-pause-btn'), playIcon: $('#play-pause-btn i'),
            downloadBtn: $('#download-btn'),
            waveformContainer: $('#waveform-container'),
            mainCanvas: $('#main-visualizer'),
            vizSelector: $('#viz-type-selector'),
            playhead: $('#playhead'),
            currentTime: $('#current-time'), totalDuration: $('#total-duration'),
            fxChainContainer: $('#fx-chain-container'), moduleTemplate: $('#fx-module-template'),
            themeSelector: $('#theme-selector'),
            masterMeterBar: $('#master-meter-bar'), masterReadout: $('#master-db-readout'),
            emptyMsg: $('#empty-chain-msg'), toastContainer: $('#toast-container'),
            resetBtn: $('#global-reset-btn'),
            overlayLayer: $('#overlay-layer'), overlayText: $('#overlay-text'), overlaySub: $('#overlay-sub'),
            compareBtn: $('#compare-btn'),
            muteBtn: $('#mute-btn'), muteIcon: $('#mute-btn i'),
            masterVolumeSlot: $('#master-volume-slot'), masterVolReadout: $('#master-volume-readout'),
            savePresetBtn: $('#save-preset-btn'), loadPresetBtn: $('#load-preset-btn'), presetInput: $('#preset-input'),
            installBtn: $('#install-btn'),
            confirmModal: $('#confirm-modal'), confirmTitle: $('#confirm-title'),
            confirmMessage: $('#confirm-message'), confirmOk: $('#confirm-ok'), confirmCancel: $('#confirm-cancel'),
            dropZoneOverlay: $('#drop-zone-overlay'),
            themeColorMeta: $('meta[name="theme-color"]')
        };
    }

    /* ---------------------------------------------------------- STATE / PERSISTENCE */

    loadPersisted() {
        try {
            const raw = localStorage.getItem('dawState');
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    initState() {
        const persisted = this.loadPersisted();

        const savedTheme = (persisted && persisted.theme) || localStorage.getItem('theme') || 'theme-dark';
        document.documentElement.className = savedTheme;
        if ([...this.dom.themeSelector.options].some(o => o.value === savedTheme)) {
            this.dom.themeSelector.value = savedTheme;
        }

        const savedViz = (persisted && persisted.vizMode) || 'bars';
        if ([...this.dom.vizSelector.options].some(o => o.value === savedViz)) {
            this.dom.vizSelector.value = savedViz;
        }

        let order = (persisted && persisted.fxChainOrder)
            || JSON.parse(localStorage.getItem('fxChainOrder') || 'null')
            || [...DEFAULT_CHAIN_ORDER];
        order = order.filter(id => EFFECTS_CONFIG[id]);
        Object.keys(EFFECTS_CONFIG).forEach(id => { if (!order.includes(id)) order.push(id); });
        this.state.fxChainOrder = order;

        const savedParams = (persisted && persisted.fxParams) || {};
        for (const fxId of this.state.fxChainOrder) {
            const saved = savedParams[fxId] || {};
            this.state.fxParams[fxId] = { bypass: !!saved.bypass };
            for (const paramId in EFFECTS_CONFIG[fxId].params) {
                this.state.fxParams[fxId][paramId] = (saved[paramId] !== undefined)
                    ? saved[paramId]
                    : EFFECTS_CONFIG[fxId].params[paramId].value;
            }
        }

        const mv = (persisted && typeof persisted.masterVolume === 'number') ? persisted.masterVolume : 1;
        this.state.masterVolume = Math.max(0, Math.min(1.25, mv));
        this.state.lastVolume = this.state.masterVolume > 0 ? this.state.masterVolume : 1;
    }

    _buildStateSnapshot() {
        return {
            version: 2,
            theme: document.documentElement.className,
            vizMode: this.dom.vizSelector.value,
            fxChainOrder: this.state.fxChainOrder,
            fxParams: this.state.fxParams,
            masterVolume: this.state.masterVolume
        };
    }

    saveState() {
        clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => this.flushState(), 300);
    }

    flushState() {
        try {
            localStorage.setItem('dawState', JSON.stringify(this._buildStateSnapshot()));
        } catch (e) { /* storage unavailable or full - non-fatal */ }
    }

    /* ---------------------------------------------------------- AUDIO ENGINE */

    initAudioContext() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.audio.ctx = new AudioContext();
        this.audio.masterGain = this.audio.ctx.createGain();
        this.audio.masterGain.gain.value = this.state.masterVolume;
        this.audio.analyser = this.audio.ctx.createAnalyser();
        this.audio.analyser.fftSize = 2048;
        this.audio.analyser.smoothingTimeConstant = 0.88;
        this.audio.masterGain.connect(this.audio.analyser);
        this.audio.analyser.connect(this.audio.ctx.destination);

        this.createFXNodes(this.audio.ctx, this.audio.nodes);
    }

    createReverbImpulse(ctx, decaySeconds = 2.0) {
        const sampleRate = ctx.sampleRate;
        const length = Math.max(1, Math.floor(sampleRate * decaySeconds));
        const impulse = ctx.createBuffer(2, length, sampleRate);
        for (let channel = 0; channel < 2; channel++) {
            const data = impulse.getChannelData(channel);
            for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
        }
        return impulse;
    }

    /**
     * Builds the node graph for every effect in EFFECTS_CONFIG.
     *
     * Every module exposes: input -> [bypassGain -> processing -> output]
     *                              -> [passGain -------------------> output]
     * bypassGain/passGain are complementary (true bypass): when bypassed,
     * the dry signal flows straight to `output` untouched instead of the
     * whole downstream chain going silent.
     */
    createFXNodes(ctx, targetNodeStorage) {
        for (const fxId in EFFECTS_CONFIG) {
            const input = ctx.createGain();
            const output = ctx.createGain();
            const bypassGain = ctx.createGain();
            const passGain = ctx.createGain();
            passGain.gain.value = 0;

            input.connect(bypassGain);
            input.connect(passGain);
            passGain.connect(output);

            const group = { input, output, bypassGain, passGain, nodes: {} };
            const p = this.state.fxParams[fxId] || {};
            const entry = bypassGain;

            switch (fxId) {
                case 'eq': {
                    const low = ctx.createBiquadFilter();
                    low.type = 'lowshelf'; low.frequency.value = 320;
                    const mid = ctx.createBiquadFilter();
                    mid.type = 'peaking'; mid.frequency.value = 1000; mid.Q.value = 0.85;
                    const high = ctx.createBiquadFilter();
                    high.type = 'highshelf'; high.frequency.value = 3200;
                    entry.connect(low).connect(mid).connect(high).connect(output);
                    group.nodes = { low, mid, high };
                    break;
                }
                case 'compressor': {
                    const comp = ctx.createDynamicsCompressor();
                    entry.connect(comp).connect(output);
                    group.nodes = { comp };
                    break;
                }
                case 'distortion': {
                    const shaper = ctx.createWaveShaper();
                    shaper.curve = makeDistortionCurve(p.drive ?? 20);
                    shaper.oversample = '4x';
                    const tone = ctx.createBiquadFilter();
                    tone.type = 'lowpass'; tone.frequency.value = p.tone ?? 4000;
                    const dry = ctx.createGain(); const wet = ctx.createGain();
                    entry.connect(dry).connect(output);
                    entry.connect(shaper).connect(tone).connect(wet).connect(output);
                    group.nodes = { shaper, tone, dry, wet };
                    break;
                }
                case 'delay': {
                    const delay = ctx.createDelay(2.0);
                    const feedback = ctx.createGain();
                    const wet = ctx.createGain(); const dry = ctx.createGain();
                    entry.connect(dry).connect(output);
                    entry.connect(delay);
                    delay.connect(feedback).connect(delay);
                    delay.connect(wet).connect(output);
                    group.nodes = { delay, feedback, wet, dry };
                    break;
                }
                case 'chorus': {
                    const delay = ctx.createDelay(0.05);
                    delay.delayTime.value = 0.015;
                    const lfo = ctx.createOscillator();
                    lfo.type = 'sine'; lfo.frequency.value = p.rate ?? 1.2;
                    const lfoGain = ctx.createGain();
                    lfoGain.gain.value = p.depth ?? 0.003;
                    lfo.connect(lfoGain).connect(delay.delayTime);
                    lfo.start(0);
                    const dry = ctx.createGain(); const wet = ctx.createGain();
                    entry.connect(dry).connect(output);
                    entry.connect(delay).connect(wet).connect(output);
                    group.nodes = { delay, lfo, lfoGain, dry, wet };
                    break;
                }
                case 'autopan': {
                    const panner = ctx.createStereoPanner();
                    const lfo = ctx.createOscillator();
                    lfo.type = 'sine'; lfo.frequency.value = p.rate ?? 1;
                    const lfoGain = ctx.createGain();
                    lfoGain.gain.value = p.depth ?? 0.8;
                    lfo.connect(lfoGain).connect(panner.pan);
                    lfo.start(0);
                    entry.connect(panner).connect(output);
                    group.nodes = { panner, lfo, lfoGain };
                    break;
                }
                case 'reverb': {
                    const conv = ctx.createConvolver();
                    conv.buffer = this.createReverbImpulse(ctx, p.decay ?? 2.0);
                    const dry = ctx.createGain(); const wet = ctx.createGain();
                    entry.connect(dry).connect(output);
                    entry.connect(conv).connect(wet).connect(output);
                    group.nodes = { conv, dry, wet };
                    break;
                }
            }
            targetNodeStorage[fxId] = group;
        }
    }

    /* ---------------------------------------------------------- UI INIT */

    initUI() {
        this.vizEngine = new VisualizerEngine(this.dom.mainCanvas, this.audio.analyser);
        this.vizEngine.setMode(this.dom.vizSelector.value);
    }

    initMasterVolume() {
        this.masterVolumeSlider = new RangeSlider(this.dom.masterVolumeSlot, {
            min: 0, max: 1.25, step: 0.01,
            value: this.state.masterVolume,
            orientation: 'horizontal',
            defaultValue: 1,
            ariaLabel: 'Master volume',
            onChange: (v) => this.setMasterVolume(v)
        });
        this.updateMasterVolumeReadout(this.state.masterVolume);
        this.updateMuteIcon();
    }

    /* ---------------------------------------------------------- EVENT WIRING */

    initEventListeners() {
        this.dom.uploadBtn.addEventListener('click', () => this.dom.fileInput.click());

        this.dom.fileInput.addEventListener('change', async (e) => {
            if (e.target.files.length > 0) await this.loadAudioFile(e.target.files[0]);
            e.target.value = '';
        });

        this.dom.downloadBtn.addEventListener('click', async () => {
            if (!this.state.fileLoaded) return;
            this.dom.downloadBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Exporting...`;
            await new Promise(r => setTimeout(r, 30));
            await this.handleDownload();
            this.dom.downloadBtn.innerHTML = `<i class="fa-solid fa-file-export"></i> Export WAV`;
        });

        this.dom.playBtn.addEventListener('click', async () => {
            if (this.audio.ctx.state === 'suspended') await this.audio.ctx.resume();
            this.state.isPlaying ? this.pause() : this.play();
        });

        this.dom.themeSelector.addEventListener('change', (e) => this.applyTheme(e.target.value));

        this.dom.vizSelector.addEventListener('change', (e) => {
            this.vizEngine.setMode(e.target.value);
            this.saveState();
        });

        this.dom.resetBtn.addEventListener('click', async () => {
            const ok = await this.showConfirm(
                'Reset everything?',
                'This restores every effect, the theme, master volume and the rack layout to their factory defaults. This cannot be undone.'
            );
            if (ok) {
                localStorage.removeItem('fxChainOrder');
                localStorage.removeItem('dawState');
                location.reload();
            }
        });

        // --- FX chain drag & drop reordering ---
        this.dom.fxChainContainer.addEventListener('dragstart', e => {
            const card = e.target.closest('.fx-card');
            if (!card) return;
            card.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', card.dataset.fxId || '');
        });

        this.dom.fxChainContainer.addEventListener('dragend', e => {
            const card = e.target.closest('.fx-card');
            if (card) card.classList.remove('dragging');
            this.updateChainOrder();
        });

        this.dom.fxChainContainer.addEventListener('dragover', e => {
            e.preventDefault();
            const dragging = this.dom.fxChainContainer.querySelector('.dragging');
            if (!dragging) return;
            const afterElement = this.getDragAfterElement(this.dom.fxChainContainer, e.clientX, e.clientY);
            if (afterElement == null) this.dom.fxChainContainer.appendChild(dragging);
            else this.dom.fxChainContainer.insertBefore(dragging, afterElement);
        });

        // --- Scrubbing ---
        this.dom.waveformContainer.addEventListener('click', e => {
            if (!this.state.fileLoaded) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const wasPlaying = this.state.isPlaying;
            if (wasPlaying) this.pause();
            this.state.startOffset = pct * this.state.audioBuffer.duration;
            if (wasPlaying) {
                this.play();
            } else {
                this.updatePlayhead(pct);
                this.dom.currentTime.textContent = this.formatTime(this.state.startOffset);
            }
        });

        // --- A/B compare (global bypass) ---
        this.dom.compareBtn.addEventListener('click', () => this.toggleCompare());

        // --- Mute ---
        this.dom.muteBtn.addEventListener('click', () => this.toggleMute());

        // --- Presets ---
        this.dom.savePresetBtn.addEventListener('click', () => this.savePreset());
        this.dom.loadPresetBtn.addEventListener('click', () => this.dom.presetInput.click());
        this.dom.presetInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) await this.loadPresetFile(file);
            e.target.value = '';
        });

        // --- Confirm modal ---
        this.dom.confirmCancel.addEventListener('click', () => this._resolveConfirm(false));
        this.dom.confirmOk.addEventListener('click', () => this._resolveConfirm(true));
        this.dom.confirmModal.addEventListener('click', (e) => {
            if (e.target === this.dom.confirmModal) this._resolveConfirm(false);
        });

        // --- Persist on close, even if the debounce hasn't fired yet ---
        window.addEventListener('beforeunload', () => {
            clearTimeout(this._saveTimer);
            this.flushState();
        });
    }

    initKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            const t = e.target;
            const isFormField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.closest('.rs') || t.isContentEditable;
            if (isFormField) return;

            switch (e.key) {
                case ' ':
                case 'Spacebar':
                    if (this.dom.playBtn.disabled) return;
                    e.preventDefault();
                    if (this.audio.ctx.state === 'suspended') this.audio.ctx.resume();
                    this.state.isPlaying ? this.pause() : this.play();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    this.seek(5);
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    this.seek(-5);
                    break;
                case 'm': case 'M':
                    this.toggleMute();
                    break;
                case 'c': case 'C':
                    this.toggleCompare();
                    break;
            }
        });
    }

    initDragDropFile() {
        let counter = 0;
        const show = () => this.dom.dropZoneOverlay.classList.add('active');
        const hide = () => { counter = 0; this.dom.dropZoneOverlay.classList.remove('active'); };

        window.addEventListener('dragenter', (e) => { e.preventDefault(); counter++; show(); });
        window.addEventListener('dragover', (e) => e.preventDefault());
        window.addEventListener('dragleave', () => { counter--; if (counter <= 0) hide(); });
        window.addEventListener('drop', async (e) => {
            e.preventDefault();
            hide();
            const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (!file) return;
            if (file.type.startsWith('audio/')) await this.loadAudioFile(file);
            else this.showToast('Please drop an audio file', 'error');
        });
    }

    /** Gate the audio engine behind a user gesture (browsers start AudioContext suspended).
     *
     * WHY click/touchstart instead of pointerdown:
     * iOS Safari and some Android WebViews only accept 'touchstart', 'touchend',
     * and 'click' as valid user-gesture tokens for AudioContext.resume().
     * Using 'pointerdown' silently fails — resume() returns a resolved promise
     * but the context stays suspended, so the overlay could never be dismissed.
     */
    initAudioGate() {
        if (this.audio.ctx && this.audio.ctx.state === 'running') {
            this.hideOverlay();
            return;
        }

        this.dom.overlayText.textContent = 'Ambientica';
        this.dom.overlaySub.textContent = 'Tap or click anywhere to start';
        this.dom.overlayLayer.classList.add('ready', 'active');

        // Real button inside overlay — most reliable activation on iOS Safari.
        const tapBtn = document.createElement('button');
        tapBtn.className = 'overlay-tap-btn';
        tapBtn.textContent = '\u25b6  Tap to Start';
        this.dom.overlayLayer.querySelector('.overlay-content').appendChild(tapBtn);

        let started = false; // guard: only fire once across all event types
        const start = async () => {
            if (started) return;
            started = true;

            // Clean up all listeners first so they can't re-fire
            ['click', 'touchstart', 'keydown'].forEach(t =>
                document.removeEventListener(t, start));

            try {
                if (this.audio.ctx.state !== 'running') {
                    await this.audio.ctx.resume();
                }
            } catch (err) {
                console.warn('AudioContext.resume() failed:', err);
            }

            this.dom.overlayLayer.classList.remove('ready');
            this.hideOverlay();
        };

        document.addEventListener('click',      start);
        document.addEventListener('touchstart', start, { passive: true });
        document.addEventListener('keydown',    start);
    }

    /** Registers the service worker so the app shell works fully offline once installed. */
    registerServiceWorker() {
        if (!('serviceWorker' in navigator)) return;
        if (location.protocol === 'file:') return; // SW requires http(s)
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').catch(() => { /* offline support unavailable */ });
        });
    }

    /** Shows an "Install App" button when the browser offers the PWA install prompt. */
    initInstallPrompt() {
        const btn = this.dom.installBtn;
        if (!btn) return;
        let deferredPrompt = null;

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            btn.hidden = false;
        });

        btn.addEventListener('click', async () => {
            if (!deferredPrompt) return;
            btn.disabled = true;
            deferredPrompt.prompt();
            try {
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === 'accepted') this.showToast('Ambientica installed');
            } finally {
                deferredPrompt = null;
                btn.hidden = true;
                btn.disabled = false;
            }
        });

        window.addEventListener('appinstalled', () => { btn.hidden = true; });
    }

    /* ---------------------------------------------------------- OVERLAY / TOASTS / MODAL */

    triggerOverlay(text, sub = '', duration = 0) {
        return new Promise(resolve => {
            this.dom.overlayLayer.classList.remove('ready');
            this.dom.overlayText.textContent = text;
            this.dom.overlaySub.textContent = sub;
            this.dom.overlayLayer.classList.add('active');

            if (duration > 0) {
                setTimeout(() => {
                    this.dom.overlayLayer.classList.remove('active');
                    resolve();
                }, duration);
            } else {
                resolve();
            }
        });
    }

    hideOverlay() {
        this.dom.overlayLayer.classList.remove('active');
    }

    showToast(msg, type = 'success') {
        const t = document.createElement('div');
        t.className = `toast toast-${type}`;
        const icon = type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check';
        t.innerHTML = `<i class="fa-solid ${icon}"></i><span>${msg}</span>`;
        this.dom.toastContainer.appendChild(t);
        setTimeout(() => {
            t.classList.add('toast-out');
            setTimeout(() => t.remove(), 300);
        }, 3000);
    }

    /** Theme-aware replacement for window.confirm(). Resolves true/false. */
    showConfirm(title, message) {
        return new Promise((resolve) => {
            this.dom.confirmTitle.textContent = title;
            this.dom.confirmMessage.textContent = message;
            this.dom.confirmModal.classList.add('active');
            this._resolveConfirm = (result) => {
                this.dom.confirmModal.classList.remove('active');
                resolve(result);
            };
        });
    }

    /* ---------------------------------------------------------- THEME */

    applyTheme(themeClass, persist = true) {
        document.documentElement.className = themeClass;
        if ([...this.dom.themeSelector.options].some(o => o.value === themeClass)) {
            this.dom.themeSelector.value = themeClass;
        }
        if (this.dom.themeColorMeta) {
            const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
            if (bg) this.dom.themeColorMeta.setAttribute('content', bg);
        }
        if (this.vizEngine) this.vizEngine.refreshColors();
        this.redrawEQCurve();
        if (persist) {
            localStorage.setItem('theme', themeClass);
            this.saveState();
        }
    }

    /* ---------------------------------------------------------- FILE LOADING */

    async loadAudioFile(file) {
        if (!file) return;
        await this.triggerOverlay('Importing Audio...', `Decoding "${file.name}"`, 0);
        if (this.state.isPlaying) this.pause();
        this.dom.fileName.textContent = file.name;
        this.dom.playBtn.disabled = true;
        try {
            const buffer = await file.arrayBuffer();
            this.state.audioBuffer = await this.audio.ctx.decodeAudioData(buffer);
            this.state.fileLoaded = true;
            this.dom.totalDuration.textContent = this.formatTime(this.state.audioBuffer.duration);
            this.dom.playBtn.disabled = false;
            this.dom.downloadBtn.disabled = false;
            this.state.startOffset = 0;
            this.updatePlayhead(0);
            this.dom.currentTime.textContent = this.formatTime(0);
            this.hideOverlay();
            this.showToast('Audio loaded');
        } catch (err) {
            console.error(err);
            this.dom.fileName.textContent = 'Error loading file';
            this.hideOverlay();
            this.showToast('Could not load that file', 'error');
        }
    }

    /* ---------------------------------------------------------- TRANSPORT */

    play() {
        if (!this.state.fileLoaded) return;
        this.audio.sourceNode = this.audio.ctx.createBufferSource();
        this.audio.sourceNode.buffer = this.state.audioBuffer;
        this.connectFXChain(this.audio.sourceNode, this.audio.masterGain, this.audio.nodes, this.state.compareMode);
        this.state.startTime = this.audio.ctx.currentTime;
        this.audio.sourceNode.start(0, this.state.startOffset);
        this.state.isPlaying = true;
        this.dom.playIcon.className = 'fa-solid fa-pause';
    }

    pause() {
        if (this.audio.sourceNode) {
            try { this.audio.sourceNode.stop(); } catch (e) { /* already stopped */ }
            try { this.audio.sourceNode.disconnect(); } catch (e) { /* already disconnected */ }
        }
        if (this.state.isPlaying) {
            this.state.startOffset += this.audio.ctx.currentTime - this.state.startTime;
            if (this.state.startOffset >= this.state.audioBuffer.duration) this.state.startOffset = 0;
        }
        this.state.isPlaying = false;
        this.dom.playIcon.className = 'fa-solid fa-play';
    }

    seek(delta) {
        if (!this.state.fileLoaded) return;
        const wasPlaying = this.state.isPlaying;
        if (wasPlaying) this.pause();
        let newOffset = this.state.startOffset + delta;
        newOffset = Math.max(0, Math.min(this.state.audioBuffer.duration - 0.001, newOffset));
        this.state.startOffset = newOffset;
        this.updatePlayhead(newOffset / this.state.audioBuffer.duration);
        this.dom.currentTime.textContent = this.formatTime(newOffset);
        if (wasPlaying) this.play();
    }

    /**
     * Wires `source` through the FX chain (or straight to `dest` if `bypassAll`
     * is true — used for the live A/B "Compare" toggle).
     */
    connectFXChain(source, dest, nodeCollection, bypassAll = false) {
        source.disconnect();
        if (bypassAll) {
            source.connect(dest);
            return;
        }
        let head = source;
        this.state.fxChainOrder.forEach(id => {
            const node = nodeCollection[id];
            if (node) { head.connect(node.input); head = node.output; }
        });
        head.connect(dest);
    }

    toggleCompare() {
        this.state.compareMode = !this.state.compareMode;
        this.dom.compareBtn.classList.toggle('active', this.state.compareMode);
        this.dom.compareBtn.setAttribute('aria-pressed', String(this.state.compareMode));
        this.dom.fxChainContainer.classList.toggle('bypassed-all', this.state.compareMode);
        if (this.audio.sourceNode) {
            this.connectFXChain(this.audio.sourceNode, this.audio.masterGain, this.audio.nodes, this.state.compareMode);
        }
        this.showToast(this.state.compareMode ? 'Comparing — hearing the original, unprocessed signal' : 'Effects chain restored');
    }

    /* ---------------------------------------------------------- MASTER VOLUME */

    setMasterVolume(v, persist = true) {
        v = Math.max(0, Math.min(1.25, v));
        this.state.masterVolume = v;
        if (v > 0) this.state.lastVolume = v;
        if (this.audio.masterGain) {
            this.audio.masterGain.gain.setTargetAtTime(v, this.audio.ctx.currentTime, 0.05);
        }
        this.updateMasterVolumeReadout(v);
        this.updateMuteIcon();
        if (this.masterVolumeSlider && this.masterVolumeSlider.value !== v) this.masterVolumeSlider.setValue(v, false);
        if (persist) this.saveState();
    }

    toggleMute() {
        if (this.state.masterVolume > 0) this.setMasterVolume(0);
        else this.setMasterVolume(this.state.lastVolume || 1);
    }

    updateMasterVolumeReadout(v) {
        const db = v <= 0 ? -Infinity : 20 * Math.log10(v);
        this.dom.masterVolReadout.textContent = (db === -Infinity) ? '-\u221e dB' : `${db > 0 ? '+' : ''}${db.toFixed(1)} dB`;
    }

    updateMuteIcon() {
        const v = this.state.masterVolume;
        this.dom.muteIcon.className = v === 0 ? 'fa-solid fa-volume-xmark' : (v < 0.5 ? 'fa-solid fa-volume-low' : 'fa-solid fa-volume-high');
    }

    /* ---------------------------------------------------------- FX RACK RENDERING */

    renderFXChain() {
        this.dom.fxChainContainer.innerHTML = '';
        this.dom.emptyMsg.style.display = this.state.fxChainOrder.length > 0 ? 'none' : 'flex';
        this.state.fxChainOrder.forEach(id => {
            if (EFFECTS_CONFIG[id]) this.dom.fxChainContainer.appendChild(this.createModule(id, EFFECTS_CONFIG[id]));
        });
        this.applyParams();
        this.redrawEQCurve();
    }

    createModule(id, config) {
        const clone = this.dom.moduleTemplate.content.cloneNode(true);
        const card = clone.querySelector('.fx-card');
        card.dataset.fxId = id;
        card.style.setProperty('--fx-color', config.color || 'var(--accent)');
        card.querySelector('.module-icon').className = config.icon;
        card.querySelector('.fx-name').textContent = config.name;

        const toggle = card.querySelector('.bypass-toggle');
        toggle.checked = !this.state.fxParams[id].bypass;
        toggle.setAttribute('aria-label', `Toggle ${config.name}`);
        toggle.addEventListener('change', (e) => {
            this.state.fxParams[id].bypass = !e.target.checked;
            this.updateNodeParam(id, 'bypass', this.state.fxParams[id].bypass);
            card.classList.toggle('bypassed', this.state.fxParams[id].bypass);
            this.saveState();
        });
        if (this.state.fxParams[id].bypass) card.classList.add('bypassed');

        const dragHandle = card.querySelector('.drag-handle');
        if (dragHandle) dragHandle.setAttribute('aria-label', `Drag to reorder ${config.name}`);

        const body = card.querySelector('.fx-body');

        if (id === 'eq') {
            const curveWrap = document.createElement('div');
            curveWrap.className = 'eq-curve-wrap';
            const curveCanvas = document.createElement('canvas');
            curveCanvas.className = 'eq-curve';
            curveCanvas.setAttribute('aria-hidden', 'true');
            curveWrap.appendChild(curveCanvas);
            body.before(curveWrap);
            this.eqCurve = new EQCurveRenderer(curveCanvas, () => (this.audio.nodes.eq && this.audio.nodes.eq.nodes) || null);
        }

        for (const paramId in config.params) {
            body.appendChild(this.createSlider(id, paramId, config.params[paramId]));
        }
        return card;
    }

    createSlider(fxId, paramId, conf) {
        const group = document.createElement('div');
        const isVertical = conf.type === 'v-slider';
        group.className = `slider-group ${isVertical ? 'vertical' : 'horizontal'}`;

        const label = document.createElement('span');
        label.className = 'param-label';
        label.textContent = conf.name;

        const valDisplay = document.createElement('span');
        valDisplay.className = 'param-value';

        const sliderWrap = document.createElement('div');
        sliderWrap.className = 'rs-wrap';

        const updateVal = (v) => {
            let txt;
            switch (conf.unit) {
                case '%':
                    txt = Math.round(v * 100) + '%';
                    break;
                case 'dB': {
                    const decimals = conf.step < 1 ? 1 : 0;
                    txt = (v > 0 ? '+' : '') + v.toFixed(decimals) + 'dB';
                    break;
                }
                case ':1':
                    txt = v.toFixed(1) + ':1';
                    break;
                case 'Hz':
                    txt = v >= 1000 ? (v / 1000).toFixed(2) + 'kHz' : Math.round(v) + 'Hz';
                    break;
                case '':
                    txt = String(Math.round(v));
                    break;
                case 's':
                    txt = v < 0.1 ? (v * 1000).toFixed(1) + 'ms' : v.toFixed(2) + 's';
                    break;
                default:
                    txt = v.toFixed(conf.step < 0.1 ? 2 : 1) + conf.unit;
            }
            valDisplay.textContent = txt;
        };

        const slider = new RangeSlider(sliderWrap, {
            min: conf.min, max: conf.max, step: conf.step,
            value: this.state.fxParams[fxId][paramId],
            orientation: isVertical ? 'vertical' : 'horizontal',
            defaultValue: conf.value,
            ariaLabel: `${EFFECTS_CONFIG[fxId].name} ${conf.name}`,
            onChange: (v) => {
                this.state.fxParams[fxId][paramId] = v;
                this.updateNodeParam(fxId, paramId, v);
                updateVal(v);
                this.saveState();
            }
        });
        updateVal(slider.value);

        if (isVertical) group.append(valDisplay, sliderWrap, label);
        else group.append(label, sliderWrap, valDisplay);
        return group;
    }

    /* ---------------------------------------------------------- PARAM <-> NODE WIRING */

    updateNodeParam(fxId, paramId, value) {
        const group = this.audio.nodes[fxId];
        if (!group) return;
        const t = this.audio.ctx.currentTime;

        if (paramId === 'bypass') {
            group.bypassGain.gain.setTargetAtTime(value ? 0 : 1, t, 0.05);
            group.passGain.gain.setTargetAtTime(value ? 1 : 0, t, 0.05);
            return;
        }

        const nodes = group.nodes;
        switch (fxId) {
            case 'eq':
                if (paramId === 'lowGain') nodes.low.gain.setTargetAtTime(value, t, 0.1);
                if (paramId === 'midGain') nodes.mid.gain.setTargetAtTime(value, t, 0.1);
                if (paramId === 'highGain') nodes.high.gain.setTargetAtTime(value, t, 0.1);
                this.redrawEQCurve();
                break;
            case 'compressor':
                if (nodes.comp[paramId]) nodes.comp[paramId].setTargetAtTime(value, t, 0.1);
                break;
            case 'distortion':
                if (paramId === 'drive') nodes.shaper.curve = makeDistortionCurve(value);
                else if (paramId === 'tone') nodes.tone.frequency.setTargetAtTime(value, t, 0.1);
                else if (paramId === 'mix') {
                    nodes.wet.gain.setTargetAtTime(value, t, 0.05);
                    nodes.dry.gain.setTargetAtTime(1 - value, t, 0.05);
                }
                break;
            case 'delay':
                if (paramId === 'time') nodes.delay.delayTime.setTargetAtTime(value, t, 0.2);
                if (paramId === 'feedback') nodes.feedback.gain.setTargetAtTime(value, t, 0.1);
                if (paramId === 'mix') {
                    nodes.wet.gain.setTargetAtTime(value, t, 0.05);
                    nodes.dry.gain.setTargetAtTime(1 - value, t, 0.05);
                }
                break;
            case 'chorus':
                if (paramId === 'rate') nodes.lfo.frequency.setTargetAtTime(value, t, 0.1);
                if (paramId === 'depth') nodes.lfoGain.gain.setTargetAtTime(value, t, 0.1);
                if (paramId === 'mix') {
                    nodes.wet.gain.setTargetAtTime(value, t, 0.05);
                    nodes.dry.gain.setTargetAtTime(1 - value, t, 0.05);
                }
                break;
            case 'autopan':
                if (paramId === 'rate') nodes.lfo.frequency.setTargetAtTime(value, t, 0.1);
                if (paramId === 'depth') nodes.lfoGain.gain.setTargetAtTime(value, t, 0.1);
                break;
            case 'reverb':
                if (paramId === 'mix') {
                    nodes.wet.gain.setTargetAtTime(value, t, 0.05);
                    nodes.dry.gain.setTargetAtTime(1 - value, t, 0.05);
                } else if (paramId === 'decay') {
                    clearTimeout(this._reverbDebounce);
                    this._reverbDebounce = setTimeout(() => {
                        nodes.conv.buffer = this.createReverbImpulse(this.audio.ctx, value);
                    }, 80);
                }
                break;
        }
    }

    /** Applies the full fxParams snapshot onto a node collection (live or offline). */
    applyParamsToNodes(nodeCollection, time) {
        for (const fxId in this.state.fxParams) {
            const params = this.state.fxParams[fxId];
            const group = nodeCollection[fxId];
            if (!group) continue;

            const bypass = !!params.bypass;
            group.bypassGain.gain.setValueAtTime(bypass ? 0 : 1, time);
            group.passGain.gain.setValueAtTime(bypass ? 1 : 0, time);

            const nodes = group.nodes;
            switch (fxId) {
                case 'eq':
                    nodes.low.gain.setValueAtTime(params.lowGain, time);
                    nodes.mid.gain.setValueAtTime(params.midGain, time);
                    nodes.high.gain.setValueAtTime(params.highGain, time);
                    break;
                case 'compressor':
                    ['threshold', 'knee', 'ratio', 'attack', 'release'].forEach(p => {
                        if (nodes.comp[p] && params[p] !== undefined) nodes.comp[p].setValueAtTime(params[p], time);
                    });
                    break;
                case 'distortion':
                    nodes.shaper.curve = makeDistortionCurve(params.drive);
                    nodes.tone.frequency.setValueAtTime(params.tone, time);
                    nodes.wet.gain.setValueAtTime(params.mix, time);
                    nodes.dry.gain.setValueAtTime(1 - params.mix, time);
                    break;
                case 'delay':
                    nodes.delay.delayTime.setValueAtTime(params.time, time);
                    nodes.feedback.gain.setValueAtTime(params.feedback, time);
                    nodes.wet.gain.setValueAtTime(params.mix, time);
                    nodes.dry.gain.setValueAtTime(1 - params.mix, time);
                    break;
                case 'chorus':
                    nodes.lfo.frequency.setValueAtTime(params.rate, time);
                    nodes.lfoGain.gain.setValueAtTime(params.depth, time);
                    nodes.wet.gain.setValueAtTime(params.mix, time);
                    nodes.dry.gain.setValueAtTime(1 - params.mix, time);
                    break;
                case 'autopan':
                    nodes.lfo.frequency.setValueAtTime(params.rate, time);
                    nodes.lfoGain.gain.setValueAtTime(params.depth, time);
                    break;
                case 'reverb': {
                    nodes.wet.gain.setValueAtTime(params.mix, time);
                    nodes.dry.gain.setValueAtTime(1 - params.mix, time);
                    const currentDuration = nodes.conv.buffer ? nodes.conv.buffer.duration : 0;
                    if (Math.abs(currentDuration - params.decay) > 0.05) {
                        nodes.conv.buffer = this.createReverbImpulse(nodes.conv.context, params.decay);
                    }
                    break;
                }
            }
        }
    }

    applyParams() {
        this.applyParamsToNodes(this.audio.nodes, this.audio.ctx.currentTime);
    }

    redrawEQCurve() {
        if (!this.eqCurve || !this.vizEngine) return;
        this.eqCurve.draw(this.vizEngine.colors.accent, this.vizEngine.colors.muted);
    }

    /* ---------------------------------------------------------- DRAG REORDER */

    updateChainOrder() {
        const newOrder = [...this.dom.fxChainContainer.querySelectorAll('.fx-card')].map(el => el.dataset.fxId);
        this.state.fxChainOrder = newOrder;
        this.saveState();
        if (this.audio.sourceNode) {
            this.connectFXChain(this.audio.sourceNode, this.audio.masterGain, this.audio.nodes, this.state.compareMode);
        }
    }

    /**
     * 2D-aware drop target detection. The original only looked at the X axis,
     * which misbehaves once the FX grid wraps onto multiple rows.
     */
    getDragAfterElement(container, x, y) {
        const candidates = [...container.querySelectorAll('.fx-card:not(.dragging)')];
        let closest = { dist: Infinity, element: null };
        for (const child of candidates) {
            const box = child.getBoundingClientRect();
            const centerX = box.left + box.width / 2;
            const centerY = box.top + box.height / 2;
            const dx = x - centerX;
            const dy = y - centerY;
            const sameRow = Math.abs(dy) < box.height / 2;
            const isBefore = dy < -box.height / 4 || (sameRow && dx < 0);
            if (!isBefore) continue;
            const dist = Math.hypot(dx, dy);
            if (dist < closest.dist) closest = { dist, element: child };
        }
        return closest.element;
    }

    /* ---------------------------------------------------------- EXPORT */

    async handleDownload() {
        await this.triggerOverlay('Rendering High Quality WAV...', 'This can take a moment for longer files', 0);

        const originalBuffer = this.state.audioBuffer;
        const offlineCtx = new OfflineAudioContext(2, originalBuffer.length, originalBuffer.sampleRate);
        const offlineNodes = {};
        this.createFXNodes(offlineCtx, offlineNodes);
        this.applyParamsToNodes(offlineNodes, offlineCtx.currentTime);

        const source = offlineCtx.createBufferSource();
        source.buffer = originalBuffer;
        this.connectFXChain(source, offlineCtx.destination, offlineNodes, false);

        source.start(0);
        try {
            const renderedBuffer = await offlineCtx.startRendering();
            const wavBlob = this.bufferToWave(renderedBuffer, renderedBuffer.length);
            const url = URL.createObjectURL(wavBlob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `Ambientica_Export_${new Date().getTime()}.wav`;
            anchor.click();
            URL.revokeObjectURL(url);

            this.hideOverlay();
            this.showToast('Export complete');
        } catch (err) {
            console.error(err);
            this.hideOverlay();
            this.showToast('Export failed', 'error');
        }
    }

    bufferToWave(abuffer, len) {
        let numOfChan = abuffer.numberOfChannels,
            length = len * numOfChan * 2 + 44,
            buffer = new ArrayBuffer(length),
            view = new DataView(buffer),
            channels = [], i, sample,
            offset = 0, pos = 0;

        setUint32(0x46464952); setUint32(length - 8); setUint32(0x45564157);
        setUint32(0x20746d66); setUint32(16); setUint16(1); setUint16(numOfChan);
        setUint32(abuffer.sampleRate); setUint32(abuffer.sampleRate * 2 * numOfChan); setUint16(numOfChan * 2); setUint16(16);
        setUint32(0x61746164); setUint32(length - pos - 4);

        for (i = 0; i < abuffer.numberOfChannels; i++) channels.push(abuffer.getChannelData(i));

        while (pos < length) {
            for (i = 0; i < numOfChan; i++) {
                sample = Math.max(-1, Math.min(1, channels[i][offset]));
                sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
                view.setInt16(pos, sample, true); pos += 2;
            }
            offset++;
        }
        function setUint16(data) { view.setUint16(pos, data, true); pos += 2; }
        function setUint32(data) { view.setUint32(pos, data, true); pos += 4; }
        return new Blob([buffer], { type: 'audio/wav' });
    }

    /* ---------------------------------------------------------- PRESETS (JSON FILES) */

    savePreset() {
        const data = Object.assign({ type: 'ambientica-preset', createdAt: new Date().toISOString() }, this._buildStateSnapshot());
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ambientica-preset_${new Date().getTime()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.showToast('Preset saved');
    }

    async loadPresetFile(file) {
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            if (!data || typeof data !== 'object' || typeof data.fxParams !== 'object') {
                throw new Error('Invalid preset file');
            }
            this.applyPresetData(data);
            this.showToast('Preset loaded');
        } catch (err) {
            console.error(err);
            this.showToast('Could not read that preset file', 'error');
        }
    }

    applyPresetData(data) {
        if (typeof data.theme === 'string' && [...this.dom.themeSelector.options].some(o => o.value === data.theme)) {
            this.applyTheme(data.theme, false);
        }

        if (Array.isArray(data.fxChainOrder)) {
            let order = data.fxChainOrder.filter(id => EFFECTS_CONFIG[id]);
            Object.keys(EFFECTS_CONFIG).forEach(id => { if (!order.includes(id)) order.push(id); });
            this.state.fxChainOrder = order;
        }

        for (const fxId of this.state.fxChainOrder) {
            const saved = (data.fxParams && data.fxParams[fxId]) || {};
            this.state.fxParams[fxId] = { bypass: !!saved.bypass };
            for (const paramId in EFFECTS_CONFIG[fxId].params) {
                this.state.fxParams[fxId][paramId] = (saved[paramId] !== undefined)
                    ? saved[paramId]
                    : EFFECTS_CONFIG[fxId].params[paramId].value;
            }
        }

        if (typeof data.masterVolume === 'number') this.setMasterVolume(data.masterVolume, false);

        if (typeof data.vizMode === 'string' && [...this.dom.vizSelector.options].some(o => o.value === data.vizMode)) {
            this.dom.vizSelector.value = data.vizMode;
            this.vizEngine.setMode(data.vizMode);
        }

        this.createFXNodes(this.audio.ctx, this.audio.nodes);
        this.renderFXChain();
        if (this.audio.sourceNode) {
            this.connectFXChain(this.audio.sourceNode, this.audio.masterGain, this.audio.nodes, this.state.compareMode);
        }
        this.saveState();
    }

    /* ---------------------------------------------------------- RENDER LOOP */

    loop() {
        requestAnimationFrame(this.loop.bind(this));

        if (this.state.isPlaying) {
            const now = this.audio.ctx.currentTime;
            const elapsed = now - this.state.startTime;
            const progress = (this.state.startOffset + elapsed) / this.state.audioBuffer.duration;
            this.updatePlayhead(progress);
            this.dom.currentTime.textContent = this.formatTime(this.state.startOffset + elapsed);

            if (progress >= 1) {
                this.pause();
                this.updatePlayhead(0);
                this.dom.currentTime.textContent = this.formatTime(0);
            }
        }

        if (this.vizEngine) this.vizEngine.draw();
        this.updateMeter();
    }

    updateMeter() {
        if (!this._meterData) this._meterData = new Float32Array(this.audio.analyser.fftSize);
        const data = this._meterData;
        this.audio.analyser.getFloatTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / data.length);
        let db = 20 * Math.log10(rms);
        if (db < -60) db = -60;
        const pct = ((db + 60) / 60) * 100;
        this.dom.masterMeterBar.style.width = `${Math.max(0, pct)}%`;
        this.dom.masterReadout.textContent = `${Math.round(db)} dB`;
    }

    updatePlayhead(pct = 0) {
        this.dom.playhead.style.left = `${pct * 100}%`;
    }

    formatTime(s) {
        if (isNaN(s)) return '0:00';
        const m = Math.floor(s / 60);
        const sc = Math.floor(s % 60);
        return `${m}:${sc.toString().padStart(2, '0')}`;
    }
}

window.addEventListener('DOMContentLoaded', () => new DAWApp().init());
