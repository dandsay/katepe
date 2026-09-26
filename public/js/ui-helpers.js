/**
 * UI Helpers & Utility Functions
 * Modul untuk badge visual (RW, Pengambil), notifikasi toast, clipboard, dan statistik DB
 */

// ==============================================================================
// KEAMANAN OUTPUT (ANTI-XSS)
// ==============================================================================
// escapeHtml: mengubah karakter HTML spesial menjadi entitas teks, sehingga data
// dinamis (nama, alamat, keterangan, dll) ditampilkan sebagai TEKS dan TIDAK
// dieksekusi sebagai tag/script saat disisipkan ke innerHTML.
function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// escapeForJsAttr: untuk data yang disisipkan ke DALAM string JS pada atribut
// inline (mis. onclick="fn('DATA')"). Meng-escape konteks JS sekaligus HTML
// agar tidak bisa keluar dari string maupun atribut.
function escapeForJsAttr(str) {
    return String(str === null || str === undefined ? "" : str)
        .replace(/\\/g, "\\\\")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/'/g, "\\'")
        .replace(/"/g, "&quot;")
        .replace(/\r?\n/g, "\\n");
}

window.escapeHtml = escapeHtml;
window.escapeForJsAttr = escapeForJsAttr;

// Badge Warna RW (001 - 006) - Bersih dan Monokrom agar tidak bertabrakan dengan latar baris
function getRWBadge(rw) {
    const rwNum = String(rw || "").padStart(3, '0');
    return `<span class="px-2 py-0.5 rounded-md font-semibold text-xs bg-slate-100/90 text-slate-700 border border-slate-200/80 inline-block">RW ${escapeHtml(rwNum)}</span>`;
}

// Aksen Border-Left Berdasarkan RW
function getRWBorderClass(rw) {
    const rwNum = String(rw || "").padStart(3, '0');
    const borderMap = {
        "001": "border-l-indigo-500",
        "002": "border-l-sky-500",
        "003": "border-l-teal-500",
        "004": "border-l-amber-500",
        "005": "border-l-rose-500",
        "006": "border-l-violet-500"
    };
    return borderMap[rwNum] || "border-l-slate-400";
}

// Badge Status & Hubungan Pengambil Berkas - Rapi dan Tenang
function getPengambilBadge(hubungan, tglAmbil) {
    if (!tglAmbil || tglAmbil.trim() === "") {
        return `<span class="text-slate-400 text-xs italic font-medium">-</span>`;
    }

    const h = String(hubungan || "Belum Diketahui").trim();
    const isSpecial = (h === "ARSIP");
    const isWarga = (h === "Yang Bersangkutan" || h === "Keluarga");
    const badgeCls = isSpecial 
        ? "bg-slate-200 text-slate-700 border-slate-300" 
        : (isWarga ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-slate-100 text-slate-700 border-slate-200");

    return `
        <div class="space-y-0.5">
            <span class="px-2 py-0.5 rounded-md font-semibold text-xs border inline-block ${badgeCls}">${escapeHtml(h)}</span>
            <div class="text-[11px] text-slate-500 font-medium">Diterima: ${escapeHtml(formatDate(tglAmbil))}</div>
        </div>
    `;
}

// Format Tanggal (YYYY-MM-DD -> DD-MM-YYYY)
function formatDate(d) {
    if (!d) return "-";
    const parts = d.split("-");
    if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return d;
}

// Modal Konfirmasi Generik (pengganti confirm() bawaan browser)
// Pemakaian:
//   openModalKonfirmasi({
//     judul: "Hapus Berkas?",
//     isi: "<b>Nama</b> akan dihapus permanen.",
//     labelYa: "Hapus",       // opsional
//     warna: "rose"|"amber"|"blue",  // opsional (default rose)
//     onYa: () => { ... }     // dipanggil saat tombol ya ditekan
//   });
let konfirmasiHandler = null;

function openModalKonfirmasi({ judul = "Konfirmasi", subjudul = "Periksa kembali sebelum melanjutkan.", isi = "", labelYa = "Ya, Lanjutkan", warna = "rose", onYa = null }) {
    document.getElementById("konfJudul").innerText = judul;
    document.getElementById("konfSubjudul").innerText = subjudul;
    document.getElementById("konfIsi").innerHTML = isi;
    document.getElementById("konfLabelYa").innerText = labelYa;

    const palet = {
        rose:  { box: "bg-rose-100 text-rose-700",   tombol: "bg-rose-600 hover:bg-rose-700" },
        amber: { box: "bg-amber-100 text-amber-700", tombol: "bg-amber-600 hover:bg-amber-700" },
        blue:  { box: "bg-blue-100 text-blue-700",   tombol: "bg-blue-600 hover:bg-blue-700" }
    };
    const p = palet[warna] || palet.rose;
    document.getElementById("konfIkonBox").className = `w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${p.box}`;
    document.getElementById("btnKonfYa").className = `flex-1 py-3 active:scale-98 text-white font-bold rounded-xl transition text-sm flex items-center justify-center gap-1.5 shadow-sm ${p.tombol}`;

    konfirmasiHandler = onYa;
    document.getElementById("modalKonfirmasi").classList.remove("hidden");
    lucide.createIcons();
}

function closeModalKonfirmasi() {
    document.getElementById("modalKonfirmasi").classList.add("hidden");
    konfirmasiHandler = null;
}

async function executeKonfirmasiYa() {
    const handler = konfirmasiHandler;
    closeModalKonfirmasi();
    if (handler) await handler();
}

// Notifikasi Toast
function showToast(message, type = "success") {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-white text-xs font-bold transition-all duration-300 transform translate-y-2 opacity-0 ${
        type === "success" ? "bg-slate-900 border border-slate-700" : "bg-rose-600 border border-rose-500"
    }`;
    const icon = type === "success" 
        ? '<i data-lucide="check" class="w-4 h-4 text-emerald-400 shrink-0"></i>' 
        : '<i data-lucide="alert-triangle" class="w-4 h-4 text-rose-200 shrink-0"></i>';
    toast.innerHTML = `${icon}<span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    lucide.createIcons();

    requestAnimationFrame(() => {
        toast.classList.remove("translate-y-2", "opacity-0");
    });

    setTimeout(() => {
        toast.classList.add("translate-y-2", "opacity-0");
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

// Salin NIK atau Nama ke Clipboard
function copyToClipboard(text, e) {
    if (e) e.stopPropagation();
    if (!text || text.startsWith("[") || text.includes("Terenkripsi")) {
        showToast("Data belum siap disalin", "error");
        return;
    }

    const cleanText = String(text).trim();
    const isNIK = /^\d{16}$/.test(cleanText);
    const label = isNIK ? `NIK ${cleanText}` : `"${cleanText}"`;

    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(cleanText).then(() => {
            showToast(`${label} berhasil disalin ke clipboard!`, "success");
        }).catch(() => fallbackCopy(cleanText, label));
    } else {
        fallbackCopy(cleanText, label);
    }
}

function fallbackCopy(text, label) {
    const displayLabel = label || `"${text}"`;
    try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        showToast(`${displayLabel} berhasil disalin!`, "success");
    } catch (err) {
        prompt("Salin teks manual:", text);
    }
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 Menit TTL Cache

// Manajer Cache Lokal Browser per Tahun (Zero Quota Read D1 untuk Data Cached)
const AppCache = {
    getKey(year) {
        // Mode ARSIP memegang dataset lintas-tahun → default ke cache "ALL"
        if (!year && typeof activeJenis !== "undefined" && activeJenis === "ARSIP") year = "ALL";
        const yr = year || (typeof activeYear !== "undefined" ? activeYear : new Date().getFullYear().toString());
        return `ktp_cache_data_${yr}`;
    },
    getStatsKey(jenis, year) {
        return `ktp_cache_stats_${jenis || "KTP"}_${year || "ALL"}`;
    },
    get(key) {
        try {
            const raw = sessionStorage.getItem(key);
            if (!raw) return null;
            const item = JSON.parse(raw);
            if (!item || !item.timestamp || (Date.now() - item.timestamp > CACHE_TTL_MS)) {
                sessionStorage.removeItem(key);
                return null;
            }
            return item.data;
        } catch {
            return null;
        }
    },
    set(key, data) {
        try {
            sessionStorage.setItem(key, JSON.stringify({
                timestamp: Date.now(),
                data: data
            }));
        } catch (e) {
            console.warn("Storage quota exceeded, clearing cache", e);
            AppCache.clearAll();
        }
    },
    clearAll() {
        try {
            const keysToRemove = [];
            for (let i = 0; i < sessionStorage.length; i++) {
                const k = sessionStorage.key(i);
                if (k && k.startsWith("ktp_cache_")) {
                    keysToRemove.push(k);
                }
            }
            keysToRemove.forEach(k => sessionStorage.removeItem(k));
        } catch (e) {
            console.warn("Error clearing cache", e);
        }
    }
};

// Set tahun yang tersedia di database (Persisten di session agar tidak hilang saat filter per tahun)
var availableYearsSet = new Set([new Date().getFullYear().toString()]);
try {
    const cachedYears = JSON.parse(sessionStorage.getItem("ktp_available_years") || "[]");
    if (Array.isArray(cachedYears)) {
        cachedYears.forEach(y => { if (y) availableYearsSet.add(String(y)); });
    }
} catch (e) {}

// Hitung Statistik Dashboard Langsung di Sisi Klien (Model Register Surat: 0 Rows Read D1)
function updateStatsFromClient(data = allData) {
    if (!Array.isArray(data)) return;

    const yr = typeof activeYear !== "undefined" ? activeYear : new Date().getFullYear().toString();
    const isAllYear = yr === "ALL";
    const jns = typeof activeJenis !== "undefined" ? activeJenis : "KTP";

    // Mode ARSIP: satu angka TOTAL lintas semua tahun (KTP+KIA gabungan)
    if (jns === "ARSIP") {
        let totalArsip = 0;
        data.forEach(item => {
            const itemYear = item.tgl_datang ? item.tgl_datang.substring(0, 4) : "";
            if (itemYear && itemYear.length === 4) {
                availableYearsSet.add(itemYear);
            }
            if (item.hubungan_pengambil === "ARSIP") totalArsip++;
        });

        const statTotal = document.getElementById("statTotal");
        const statSent = document.getElementById("statSent");
        const statPending = document.getElementById("statPending");
        const stat17 = document.getElementById("stat17");

        if (statTotal) statTotal.innerText = totalArsip.toLocaleString("id-ID");
        if (statSent) statSent.innerText = (0).toLocaleString("id-ID");
        if (statPending) statPending.innerText = (0).toLocaleString("id-ID");
        if (stat17) stat17.innerText = (0).toLocaleString("id-ID");

        updateYearDropdown();
        return;
    }

    let total = 0;
    let sent = 0;
    let pending = 0;
    let ikd = 0;
    let totalKtp = 0;
    let totalKia = 0;

    data.forEach(item => {
        const itemYear = item.tgl_datang ? item.tgl_datang.substring(0, 4) : "";
        if (itemYear && itemYear.length === 4) {
            availableYearsSet.add(itemYear);
        }

        // Arsip keluar dari antrean aktif → tidak dihitung di tab normal
        if (item.hubungan_pengambil === "ARSIP") return;

        if (item.jenis_berkas === "KTP") totalKtp++;
        else if (item.jenis_berkas === "KIA") totalKia++;

        const matchesYear = isAllYear || itemYear === yr || (!item.tgl_ambil || item.tgl_ambil.trim() === "");
        const matchesJenis = jns === "ALL" || item.jenis_berkas === jns;

        if (matchesYear && matchesJenis) {
            total++;
            const isSent = item.tgl_ambil && item.tgl_ambil.trim() !== "";
            if (isSent) {
                sent++;
            } else {
                pending++;
            }

            if (item.keterangan === "Perekaman Baru 17 Tahun") {
                ikd++;
            }
        }
    });

    const statTotal = document.getElementById("statTotal");
    const statSent = document.getElementById("statSent");
    const statPending = document.getElementById("statPending");
    const stat17 = document.getElementById("stat17");
    const elTotal = document.getElementById("cfDbTotal");
    const elKtp = document.getElementById("cfDbKtp");
    const elKia = document.getElementById("cfDbKia");

    if (statTotal) statTotal.innerText = total.toLocaleString("id-ID");
    if (statSent) statSent.innerText = sent.toLocaleString("id-ID");
    if (statPending) statPending.innerText = pending.toLocaleString("id-ID");
    if (stat17) stat17.innerText = ikd.toLocaleString("id-ID");
    if (elTotal) elTotal.innerText = data.length.toLocaleString("id-ID");
    if (elKtp) elKtp.innerText = totalKtp.toLocaleString("id-ID");
    if (elKia) elKia.innerText = totalKia.toLocaleString("id-ID");

    updateYearDropdown();
}

// Render Data Statistik ke Elemen UI (Legacy Fallback)
function applyStatsToUI(data) {
    if (!data) return;
    updateStatsFromClient(allData);
}

// Muat Ringkasan Statistik Database (Kini Dihitung di Sisi Klien untuk 0 Read D1)
async function loadDatabaseStats(forceRefresh = false) {
    updateStatsFromClient(allData);
}

// Sinkronkan Pilihan Tahun di Navbar (Mempertahankan seluruh tahun database)
function updateYearDropdown(years = []) {
    const sel = document.getElementById("selectTahun");
    if (!sel) return;

    if (Array.isArray(years) && years.length > 0) {
        years.forEach(y => { if (y) availableYearsSet.add(String(y)); });
        try {
            sessionStorage.setItem("ktp_available_years", JSON.stringify(Array.from(availableYearsSet)));
        } catch (e) {}
    }

    const currentYr = new Date().getFullYear().toString();
    availableYearsSet.add(currentYr);

    const sortedYears = Array.from(availableYearsSet).sort((a, b) => b.localeCompare(a));

    const prevVal = (typeof activeYear !== "undefined" && activeYear) ? activeYear : (sel.value || currentYr);
    sel.innerHTML = "";

    sortedYears.forEach(y => {
        const opt = document.createElement("option");
        opt.value = y;
        opt.innerText = y;
        opt.className = "bg-slate-900 text-white font-bold py-1";
        if (y === prevVal) opt.selected = true;
        sel.appendChild(opt);
    });

    const optAll = document.createElement("option");
    optAll.value = "ALL";
    optAll.innerText = "Semua";
    optAll.className = "bg-slate-900 text-white font-bold py-1";
    if (prevVal === "ALL") optAll.selected = true;
    sel.appendChild(optAll);
}
