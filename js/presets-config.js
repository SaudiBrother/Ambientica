/* ============================================================
   AUDIO PRESETS CONFIG
   Built-in "Audio Presets" for the rack: each one is a full
   snapshot of every effect's parameters plus the master volume.

   - `fx[effectId]` keys must match the param keys in
     EFFECTS_CONFIG (js/effects-config.js). Any param not listed
     for an effect is left untouched when the preset is applied.
   - `masterVolume` is the linear gain value used by
     DAWApp.setMasterVolume() (0 - 1.25, where 1 = 0 dB).
   - "Cave" is the curated starting point for brand-new installs (and
     after "Reset Semua") — DAWApp.initState() applies its values on
     top of the raw EFFECTS_CONFIG defaults, which remain available
     per-parameter via each slider's own double-click-to-reset.
   - "Custom" is NOT defined here: it represents "whatever the user
     has set right now, not tied to a named preset". DAWApp switches
     to it automatically the moment the user edits any value while a
     named preset is selected (see maybeSwitchToCustomPreset()).

   To add a new preset: add an entry below (any subset of effects /
   params is fine) and add its key to PRESET_ORDER. The dropdown,
   help page and "switch to Custom on edit" logic all pick it up
   automatically.
   ============================================================ */

const AUDIO_PRESETS = {
    cave: {
        id: 'cave',
        label: 'Cave',
        description: 'Gema hangat & dalam, seperti berada di dalam gua batu. Cocok sebagai titik awal untuk hampir semua jenis audio.',
        masterVolume: 1.0,
        fx: {
            eq:         { lowGain: 3, midGain: -2, highGain: -4 },
            compressor: { threshold: -22, ratio: 3,   knee: 24, attack: 0.01, release: 0.3 },
            distortion: { drive: 10, tone: 3000, mix: 0 },
            chorus:     { rate: 0.3, depth: 0.002, mix: 0.15 },
            autopan:    { rate: 0.2, depth: 0.15 },
            delay:      { time: 0.45, feedback: 0.55, mix: 0.35 },
            reverb:     { decay: 4.5, mix: 0.6 }
        }
    },
    dream: {
        id: 'dream',
        label: 'Dream',
        description: 'Lapang, lembut, dan melayang — chorus tebal dengan reverb panjang untuk suasana yang ethereal.',
        masterVolume: 0.9,
        fx: {
            eq:         { lowGain: -2, midGain: -1, highGain: 3 },
            compressor: { threshold: -28, ratio: 2,   knee: 30, attack: 0.02, release: 0.4 },
            distortion: { drive: 0, tone: 6000, mix: 0 },
            chorus:     { rate: 0.8, depth: 0.006, mix: 0.6 },
            autopan:    { rate: 0.15, depth: 0.5 },
            delay:      { time: 0.6, feedback: 0.35, mix: 0.3 },
            reverb:     { decay: 5, mix: 0.7 }
        }
    },
    hall: {
        id: 'hall',
        label: 'Hall',
        description: 'Bersih dan luas seperti aula konser — reverb besar dengan warna minimal, hampir semua efek lain dijaga halus.',
        masterVolume: 1.0,
        fx: {
            eq:         { lowGain: 0, midGain: 0, highGain: 1 },
            compressor: { threshold: -18, ratio: 2.5, knee: 20, attack: 0.005, release: 0.2 },
            distortion: { drive: 0, tone: 4000, mix: 0 },
            chorus:     { rate: 0.5, depth: 0.001, mix: 0 },
            autopan:    { rate: 1, depth: 0 },
            delay:      { time: 0.25, feedback: 0.2, mix: 0.15 },
            reverb:     { decay: 3, mix: 0.4 }
        }
    },
    lofi: {
        id: 'lofi',
        label: 'Lo-Fi',
        description: 'Hangat, sedikit kasar, dan bernuansa vintage — kompresi kuat, treble dipotong, dan delay pendek bergaya tape.',
        masterVolume: 1.1,
        fx: {
            eq:         { lowGain: 2, midGain: 1, highGain: -6 },
            compressor: { threshold: -30, ratio: 8,   knee: 10, attack: 0.001, release: 0.15 },
            distortion: { drive: 35, tone: 2500, mix: 0.25 },
            chorus:     { rate: 2, depth: 0.004, mix: 0.2 },
            autopan:    { rate: 0.1, depth: 0 },
            delay:      { time: 0.15, feedback: 0.25, mix: 0.2 },
            reverb:     { decay: 1.2, mix: 0.2 }
        }
    }
};

/* Dropdown order for the named presets. "Custom" is appended after
   these, last, by the code that builds the <select> (it has no
   entry in AUDIO_PRESETS since it isn't a fixed snapshot). */
const PRESET_ORDER = ['cave', 'dream', 'hall', 'lofi'];

/* Which preset a brand-new install starts on. */
const DEFAULT_PRESET = 'cave';

/* Shown on the help page next to the other preset descriptions. */
const CUSTOM_PRESET_DESCRIPTION = 'Pengaturanmu sendiri. Aktif otomatis begitu kamu mengubah parameter efek apa pun atau volume utama saat sebuah preset bawaan sedang dipilih, dan menyimpan pengaturan terakhirmu.';
