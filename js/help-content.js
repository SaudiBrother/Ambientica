/* ============================================================
   HELP PAGE CONTENT (Bahasa Indonesia)
   Data only — rendered into #help-content by app.js's
   renderHelpPage(). Keeping this separate from app.js makes it
   easy to update the wording without touching any logic.

   Conventions:
   - General UI text is in Indonesian.
   - Audio/technical terms (effect names, parameter names, units
     like dB/Hz/s, "Mix", "Gain", etc.) stay in English, matching
     the labels shown in the rack itself.
   - `icon` values are Font Awesome 6 classes already loaded by the
     app, so the help page reuses the exact same glyphs seen
     elsewhere in the UI (effect icons come from EFFECTS_CONFIG).
   ============================================================ */

/* General, non-effect sections — rendered in this order. */
const HELP_GENERAL_SECTIONS = [
    {
        id: 'theme',
        icon: 'fa-solid fa-palette',
        title: 'Tema',
        body: 'Pilih skema warna tampilan Ambientica sesuai selera — mulai dari yang gelap & netral hingga yang penuh warna. Pilihan tema disimpan otomatis di perangkatmu, jadi akan tetap sama saat kamu membuka aplikasi lagi.'
    },
    {
        id: 'presets',
        icon: 'fa-solid fa-wand-magic-sparkles',
        title: 'Audio Presets',
        body: 'Kumpulan pengaturan instan untuk seluruh rantai efek dan volume utama sekaligus — cocok untuk langsung mengubah "karakter" suara tanpa mengatur satu per satu. "Cave" adalah preset bawaan yang cocok untuk banyak kebutuhan. Begitu kamu mengubah pengaturan apa pun (efek mana pun, atau volume utama) saat sebuah preset sedang aktif, pilihan akan otomatis berpindah ke "Custom" — pengaturan terakhirmu tetap tersimpan di sana, dan kamu bisa kembali ke preset bawaan kapan saja dari menu ini.'
    },
    {
        id: 'audio-io',
        icon: 'fa-solid fa-file-audio',
        title: 'Muat Audio & Ekspor WAV',
        body: 'Muat Audio: pilih berkas audio dari perangkatmu untuk mulai diproses — atau cukup seret & lepas berkas ke mana saja di halaman ini. Ekspor WAV: render hasil akhir, lengkap dengan semua efek yang sedang aktif di rantai efek, menjadi satu berkas .wav yang bisa diunduh dan disimpan.'
    },
    {
        id: 'project-io',
        icon: 'fa-solid fa-floppy-disk',
        title: 'Simpan & Muat Pengaturan',
        body: 'Simpan: menyimpan seluruh pengaturan saat ini (rantai efek, tema, preset, dan volume utama) ke sebuah berkas kecil. Muat: membaca kembali berkas tersebut untuk mengembalikan pengaturan itu — berguna untuk membuat cadangan, atau memindahkan pengaturanmu ke perangkat lain.'
    },
    {
        id: 'master',
        icon: 'fa-solid fa-volume-high',
        title: 'MASTER OUT',
        body: 'Menampilkan level output akhir secara real-time (meter berjalan dari kiri ke kanan), dan berisi kontrol volume keseluruhan sebelum suara keluar ke speaker atau headphone. Gunakan tombol speaker untuk mute/unmute dengan cepat.'
    },
    {
        id: 'rack',
        icon: 'fa-solid fa-layer-group',
        title: 'Rantai Efek (Effects Chain)',
        body: 'Setiap kartu di sini adalah satu efek audio yang diproses secara berurutan dari atas/kiri ke bawah/kanan. Tahan ikon genggam (⠿) untuk menggeser urutan efek. Sakelar di pojok kanan atas setiap kartu mem-bypass efek itu sementara tanpa menghapus pengaturannya. Tombol "Compare" membiarkanmu mendengar sinyal asli (sebelum semua efek) untuk perbandingan cepat, dan "Reset Semua" mengembalikan seluruh rantai efek, tema, dan volume ke pengaturan awal aplikasi.'
    },
    {
        id: 'visualizer',
        icon: 'fa-solid fa-chart-simple',
        title: 'Visualizer',
        body: 'Menampilkan representasi visual dari audio yang sedang diputar. Pilih salah satu mode dari menu di atas area visual: Digital Bars, Waveform, Circular, Mirror, Nebula, atau Spectrum Analyzer — murni soal tampilan, tidak memengaruhi suara.'
    },
    {
        id: 'install',
        icon: 'fa-solid fa-arrow-down-to-line',
        title: 'Instal Aplikasi',
        body: 'Pasang Ambientica sebagai aplikasi di perangkatmu agar bisa dibuka langsung dari layar utama dan tetap berjalan tanpa koneksi internet setelah dibuka pertama kali. Tombol ini (di samping tombol Bantuan) hanya muncul jika browser-mu mendukung dan menawarkan pemasangan PWA saat ini.'
    },
    {
        id: 'shortcuts',
        icon: 'fa-solid fa-keyboard',
        title: 'Pintasan Keyboard',
        body: 'Beberapa pintasan keyboard tersedia saat fokus tidak sedang berada di salah satu kontrol (tombol, slider, atau menu):'
    }
];

/* Keyboard shortcuts table. */
const HELP_SHORTCUTS = [
    { keys: 'Space', desc: 'Putar / pause audio' },
    { keys: '\u2190 / \u2192', desc: 'Mundur / maju 5 detik' },
    { keys: 'M', desc: 'Mute / unmute volume utama' },
    { keys: 'C', desc: 'Aktifkan mode Compare (dengar sinyal asli)' }
];

/* Per-effect descriptions + per-parameter explanations.
   Keyed by the same effect id used in EFFECTS_CONFIG, so the help
   page can pull each effect's name/icon/color/param list straight
   from there and only needs the explanatory text from here. */
const HELP_EFFECT_DETAILS = {
    eq: {
        description: 'Equalizer 3-band untuk menyeimbangkan warna nada audio dengan menaikkan atau menurunkan level pada rentang frekuensi rendah, tengah, dan tinggi.',
        params: {
            highGain: 'Level frekuensi tinggi (treble). Naikkan untuk suara yang lebih cerah & detail, turunkan untuk suara yang lebih lembut.',
            midGain: 'Level frekuensi tengah — area yang paling memengaruhi kejelasan vokal dan instrumen utama.',
            lowGain: 'Level frekuensi rendah (bass). Naikkan untuk suara yang lebih hangat & penuh, turunkan untuk mengurangi dengung.'
        }
    },
    compressor: {
        description: 'Meratakan dinamika audio dengan menurunkan bagian yang terlalu keras secara otomatis, sehingga volume terdengar lebih konsisten.',
        params: {
            threshold: 'Ambang batas level audio sebelum compressor mulai bekerja. Semakin rendah nilainya, semakin sering compressor aktif.',
            ratio: 'Seberapa kuat sinyal di atas ambang batas ditekan. Misalnya 4:1 berarti setiap kelebihan 4dB ditekan menjadi sekitar 1dB.',
            knee: 'Mengatur transisi di sekitar ambang batas. Nilai tinggi membuat efek compressor masuk lebih halus dan bertahap.',
            attack: 'Seberapa cepat compressor merespons begitu sinyal melewati ambang batas.',
            release: 'Seberapa cepat compressor berhenti bekerja setelah sinyal kembali turun di bawah ambang batas.'
        }
    },
    distortion: {
        description: 'Menambahkan karakter "kotor" / overdrive pada audio — dari kehangatan yang halus hingga distorsi yang agresif.',
        params: {
            drive: 'Intensitas distorsi. Semakin tinggi nilainya, semakin agresif dan "pecah" karakter suaranya.',
            tone: 'Titik tekuk nada dari distorsi. Memengaruhi apakah karakter efek ini terdengar lebih terang atau lebih gelap.',
            mix: 'Perbandingan sinyal yang sudah didistorsi dengan sinyal asli. 0% berarti efek tidak terdengar, 100% sepenuhnya terdistorsi.'
        }
    },
    delay: {
        description: 'Menduplikasi audio dan memutarnya ulang setelah jeda waktu tertentu, menciptakan efek gema/echo yang berulang.',
        params: {
            time: 'Jarak waktu antara sinyal asli dan gema (echo) pertamanya.',
            feedback: 'Berapa banyak hasil echo yang dikirim kembali ke input. Semakin tinggi, semakin banyak pengulangan gema yang terdengar.',
            mix: 'Perbandingan suara echo dengan sinyal asli.'
        }
    },
    chorus: {
        description: 'Menggandakan sinyal dengan sedikit perbedaan waktu dan nada yang terus bergerak, membuat audio terdengar lebih lebar dan kaya.',
        params: {
            rate: 'Kecepatan gerakan modulasi chorus. Semakin tinggi, semakin cepat "goyangan" nadanya.',
            depth: 'Seberapa jauh nada digeser oleh modulasi. Semakin besar, semakin terasa efek melayang (wobble)-nya.',
            mix: 'Perbandingan suara chorus dengan sinyal asli.'
        }
    },
    autopan: {
        description: 'Memindahkan posisi audio secara otomatis dan berulang antara sisi kiri dan kanan.',
        params: {
            rate: 'Kecepatan perpindahan posisi kiri-kanan. Semakin tinggi, semakin cepat berpindahnya.',
            depth: 'Seberapa jauh audio berpindah ke kiri & kanan. 0% diam di tengah, 100% berpindah penuh ke tiap sisi.'
        }
    },
    reverb: {
        description: 'Menambahkan ambience/gema ruangan, mensimulasikan pantulan suara di berbagai jenis ruang — dari kamar kecil hingga aula besar.',
        params: {
            decay: 'Seberapa lama gema bertahan. Semakin besar nilainya, semakin terasa seperti berada di ruangan yang luas.',
            mix: 'Perbandingan suara reverb dengan sinyal asli.'
        }
    }
};
