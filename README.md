# Ambientica — Audio FX Studio

Ambientica adalah rack efek audio berbasis Web Audio API yang berjalan 100% di browser — tanpa server, tanpa upload. Muat file audio, susun ulang chain efek dengan drag & drop, atur tiap parameter secara real-time, lalu export hasilnya sebagai WAV.

Aplikasi ini bisa **diinstal sebagai PWA** dan tetap berfungsi penuh secara **offline** setelah dibuka sekali.

---

## ✨ Apa yang Baru di Versi Ini

### 🐛 Perbaikan Bug Kritis
- **True bypass** — sebelumnya, menonaktifkan (bypass) satu efek apa pun akan membuat **seluruh chain setelahnya menjadi bisu total** (sinyal jadi 0 dan menyebar ke semua modul berikutnya). Sekarang setiap modul punya jalur *passthrough* sendiri, jadi bypass benar-benar hanya melewatkan sinyal tanpa diproses.
- **Loop animasi ganda** — sebelumnya `requestAnimationFrame` loop baru dipicu setiap kali tombol Play ditekan, menumpuk loop paralel tiap kali Play/Pause ditekan berulang (lama-lama berat). Sekarang loop hanya berjalan sekali.
- **Reverb "Size" tidak berbunyi** — parameter `decay` pada Reverb sebelumnya tidak memengaruhi audio sama sekali. Sekarang ukuran impulse benar-benar berubah sesuai slider.
- **Export WAV tidak akurat** — Attack/Release/Knee pada Compressor tidak ikut diterapkan saat export offline, hasil export bisa berbeda dari yang didengar saat live.
- **Slider vertikal rusak di Chrome terbaru** — `-webkit-appearance: slider-vertical` sudah tidak didukung. Diganti komponen slider custom (lihat di bawah).
- Tema **Midnight** sudah ada di CSS tapi tidak pernah muncul di pilihan tema — sekarang muncul di grup "Vibrant".
- `meter` master sebelumnya membuat `Float32Array` baru 60×/detik; sekarang di-cache.
- `lang="id"` diganti `lang="en"` karena seluruh teks UI memang berbahasa Inggris (lebih akurat untuk pembaca skrin).

### ⚡ Optimasi
- Warna tema untuk visualizer di-cache dan hanya dibaca ulang saat tema berganti (sebelumnya `getComputedStyle` dipanggil tiap frame).
- Drag-reorder chain efek sekarang **sadar posisi 2D** (X & Y) — sebelumnya hanya X, jadi berantakan kalau grid efek sudah lebih dari satu baris.
- Penyimpanan state digabung jadi satu key `dawState` di localStorage (tema, urutan efek, **semua** parameter, volume master, mode visualizer) — sebelumnya hanya urutan efek & tema yang tersimpan.
- CSS dipecah jadi `themes.css` (token & 21 tema) dan `style.css` (komponen), JS dipecah jadi 4 modul (`effects-config`, `slider`, `visualizer`, `app`) — semua tetap memakai `<script defer>` biasa (bukan ES module) supaya tetap jalan walau dibuka langsung via `file://`.

### 🎛️ Fitur & Efek Baru
- **3 efek baru**: Distortion (drive/tone/mix), Chorus (rate/depth/mix), Auto-Pan (rate/width) — semua mengikuti arsitektur efek yang sudah ada (true bypass, persist, export).
- **Knee** ditambahkan ke Compressor.
- **EQ Curve** — grafik respons frekuensi EQ secara live (pakai `getFrequencyResponse`), bukan cuma 3 slider abstrak.
- **Master Volume + Mute** dengan readout dB.
- **A/B Compare** — tombol untuk membandingkan sinyal asli vs. yang sudah diproses secara instan.
- **Spectrum Analyzer** — mode visualizer baru dengan sumbu frekuensi (Hz) berskala log.
- **Drag & drop file audio** langsung ke halaman.
- **Keyboard shortcuts**: `Space` play/pause, `←/→` seek ±5s, `M` mute, `C` compare.
- **Save/Load Preset** sebagai file `.json` (selain auto-save ke localStorage).
- Dialog konfirmasi custom (mengganti `window.confirm` bawaan browser) untuk "Reset All".
- Komponen **RangeSlider** custom: mendukung mouse, touch, keyboard (arrow/Home/End/PageUp/Down), scroll wheel, dan double-click untuk reset ke default.
- Label ARIA & gaya `:focus-visible` ditambahkan ke kontrol-kontrol interaktif.

### 📱 PWA & Branding
- Rebrand total ke **Ambientica** (judul, branding di sidebar, nama PWA, prefix file export/preset).
- `manifest.json` + `sw.js` (service worker) — app shell ter-cache, bisa diinstal & dipakai offline.
- Ikon app (192/512, termasuk varian *maskable*) + favicon SVG bertema EQ-bar.
- Tombol **Install App** muncul otomatis saat browser menawarkan instalasi PWA.

---

## 🗂️ Struktur Folder (untuk GitHub Pages)

Semua path memakai path relatif, jadi struktur ini bisa langsung di-push sebagai repo dan otomatis jalan baik di `username.github.io` (root) maupun `username.github.io/nama-repo/` (project page):

```
ambientica/
│
├── index.html
├── manifest.json
├── sw.js                 ← service worker (offline cache)
├── favicon.svg
│
├── css/
│   ├── themes.css        ← design tokens + 21 tema
│   └── style.css         ← semua komponen & layout
│
├── js/
│   ├── effects-config.js ← definisi semua efek (tambah efek baru di sini)
│   ├── slider.js         ← komponen RangeSlider custom
│   ├── visualizer.js     ← visualizer + EQ curve renderer
│   └── app.js            ← controller utama
│
├── icons/
│   ├── icon-192.png
│   ├── icon-512.png
│   ├── icon-maskable-192.png
│   └── icon-maskable-512.png
│
├── .gitignore
└── README.md
```

---

## 🚀 Menjalankan Secara Lokal

Service worker (offline mode) **tidak berjalan** di `file://`, jadi gunakan server lokal sederhana:

```bash
cd ambientica
python3 -m http.server 8000
# buka http://localhost:8000
```

Tanpa server lokal, aplikasi tetap berfungsi penuh (audio engine, efek, export) — hanya fitur offline/PWA yang membutuhkan `http(s)://` atau `localhost`.

## 🌐 Deploy ke GitHub Pages

1. Push folder ini ke repo GitHub (mis. `ambientica`).
2. Buka **Settings → Pages**.
3. Source: pilih branch `main`, folder `/ (root)`.
4. Tunggu beberapa menit — situs akan tersedia di `https://<username>.github.io/ambientica/`.

Karena semua path relatif, tidak perlu konfigurasi tambahan apa pun.

## 📱 Instal sebagai App

- **Android/Desktop Chrome/Edge**: klik tombol **"Install App"** yang muncul di sidebar, atau ikon install di address bar.
- **iOS Safari**: tombol Share → **Add to Home Screen**.

Setelah diinstal, Ambientica akan tampil dengan nama & ikon sendiri, dan tetap bisa dibuka tanpa koneksi internet (CDN font/ikon akan memakai versi yang sempat di-cache).

## ⌨️ Keyboard Shortcuts

| Tombol | Aksi |
|---|---|
| `Space` | Play / Pause |
| `←` / `→` | Mundur / maju 5 detik |
| `M` | Mute / unmute |
| `C` | A/B Compare (bypass semua efek) |

## 🎛️ Daftar Efek

| Efek | Parameter |
|---|---|
| Parametric EQ | High, Mid, Low (dB) + grafik respons live |
| Compressor | Threshold, Ratio, Knee, Attack, Release |
| Distortion | Drive, Tone, Mix |
| Stereo Delay | Time, Feedback, Mix |
| Chorus | Rate, Depth, Mix |
| Auto-Pan | Rate, Width |
| Reverb | Size (decay), Mix |

Urutan efek bisa diubah lewat drag & drop pada kartu masing-masing efek.
