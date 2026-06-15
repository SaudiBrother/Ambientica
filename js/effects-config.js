/* ============================================================
   EFFECTS CONFIG
   Single source of truth for every FX module: its UI controls,
   value ranges, units and accent color.

   To add a brand new effect:
     1. Add an entry here (params drive the sliders automatically)
     2. Build its audio graph in app.js -> createFXNodes()
     3. Wire its parameters in applyParamsToNodes() / updateNodeParam()
   That's it — the rack UI, drag-reorder, presets and export all
   pick it up automatically.
   ============================================================ */

const EFFECTS_CONFIG = {
    eq: {
        id: 'eq', name: 'Parametric EQ', icon: 'fa-solid fa-sliders', color: '#ffb703',
        params: {
            highGain: { name: 'High', type: 'v-slider', min: -24, max: 24, value: 0, step: 0.1, unit: 'dB' },
            midGain:  { name: 'Mid',  type: 'v-slider', min: -24, max: 24, value: 0, step: 0.1, unit: 'dB' },
            lowGain:  { name: 'Low',  type: 'v-slider', min: -24, max: 24, value: 0, step: 0.1, unit: 'dB' }
        }
    },
    compressor: {
        id: 'compressor', name: 'Compressor', icon: 'fa-solid fa-compress', color: '#fb8500',
        params: {
            threshold: { name: 'Thresh', type: 'v-slider', min: -60, max: 0, value: -24, step: 1, unit: 'dB' },
            ratio:     { name: 'Ratio',  type: 'v-slider', min: 1, max: 20, value: 4, step: 0.1, unit: ':1' },
            knee:      { name: 'Knee',   type: 'h-slider', min: 0, max: 40, value: 30, step: 1, unit: 'dB' },
            attack:    { name: 'Atk',    type: 'h-slider', min: 0, max: 1, value: 0.003, step: 0.001, unit: 's' },
            release:   { name: 'Rel',    type: 'h-slider', min: 0.01, max: 1, value: 0.25, step: 0.001, unit: 's' }
        }
    },
    distortion: {
        id: 'distortion', name: 'Distortion', icon: 'fa-solid fa-bolt', color: '#ff5d8f',
        params: {
            drive: { name: 'Drive', type: 'v-slider', min: 0, max: 100, value: 20, step: 1, unit: '' },
            tone:  { name: 'Tone',  type: 'h-slider', min: 500, max: 12000, value: 4000, step: 50, unit: 'Hz' },
            mix:   { name: 'Mix',   type: 'h-slider', min: 0, max: 1, value: 0.5, step: 0.01, unit: '%' }
        }
    },
    delay: {
        id: 'delay', name: 'Stereo Delay', icon: 'fa-solid fa-stopwatch', color: '#219ebc',
        params: {
            time:     { name: 'Time',   type: 'h-slider', min: 0.01, max: 1.0, value: 0.3, step: 0.01, unit: 's' },
            feedback: { name: 'F.Back', type: 'h-slider', min: 0, max: 0.9, value: 0.4, step: 0.01, unit: '%' },
            mix:      { name: 'Mix',    type: 'h-slider', min: 0, max: 1, value: 0.4, step: 0.01, unit: '%' }
        }
    },
    chorus: {
        id: 'chorus', name: 'Chorus', icon: 'fa-solid fa-water', color: '#80ed99',
        params: {
            rate:  { name: 'Rate',  type: 'h-slider', min: 0.05, max: 5,    value: 1.2,   step: 0.01,   unit: 'Hz' },
            depth: { name: 'Depth', type: 'h-slider', min: 0,    max: 0.01, value: 0.003, step: 0.0001, unit: 's'  },
            mix:   { name: 'Mix',   type: 'h-slider', min: 0,    max: 1,    value: 0.5,   step: 0.01,   unit: '%'  }
        }
    },
    autopan: {
        id: 'autopan', name: 'Auto-Pan', icon: 'fa-solid fa-arrows-left-right', color: '#9d4edd',
        params: {
            rate:  { name: 'Rate',  type: 'h-slider', min: 0.05, max: 10, value: 1,   step: 0.01, unit: 'Hz' },
            depth: { name: 'Width', type: 'h-slider', min: 0,    max: 1,  value: 0.8, step: 0.01, unit: '%'  }
        }
    },
    reverb: {
        id: 'reverb', name: 'Reverb', icon: 'fa-solid fa-mountain-sun', color: '#8ecae6',
        params: {
            decay: { name: 'Size', type: 'h-slider', min: 0.5, max: 5, value: 2,   step: 0.1,  unit: 's' },
            mix:   { name: 'Mix',  type: 'h-slider', min: 0,   max: 1, value: 0.3, step: 0.01, unit: '%' }
        }
    }
};

/* Sensible default signal-flow order for a brand new session.
   Tone-shaping first, modulation in the middle, time-based last. */
const DEFAULT_CHAIN_ORDER = ['eq', 'compressor', 'distortion', 'chorus', 'autopan', 'delay', 'reverb'];

/* Classic WaveShaper distortion curve generator (MDN-style formula).
   `amount` (0-100) controls how aggressive the clipping is. */
function makeDistortionCurve(amount) {
    const k = typeof amount === 'number' ? amount : 0;
    const n = 1024;
    const curve = new Float32Array(n);
    const deg = Math.PI / 180;
    for (let i = 0; i < n; i++) {
        const x = (i * 2) / n - 1;
        curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
}
