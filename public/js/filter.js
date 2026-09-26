/**
 * Modul Filter, Sorting, Pemuatan Data & Pencarian Arsip On-Demand
 * Menangani pengambilan data dari Worker, dekripsi client-side, serta filter/sorting interaktif
 */

var searchedQueries = new Set();

// Status filter terakhir tab normal sebelum masuk ARSIP.
// Dipakai agar mode ARSIP selalu tampil sebagai tabel TOTAL (ALL),
// lalu filter semula dikembalikan saat keluar ARSIP.
var savedStatusBeforeArsip = null;

// Muat dan Dekripsi Data Berkas dari Cloudflare D1 (Model Register Surat: 1x Load per Tahun Terpilih)
async function loadData(forceRefresh = false) {
    // Mode ARSIP memegang dataset lintas-tahun → alihkan ke pemuat arsip
    if (typeof activeJenis !== "undefined" && activeJenis === "ARSIP" && typeof loadArsipAll === "function") {
        await loadArsipAll(forceRefresh);
        return;
    }
    searchedQueries.clear();
    hideDeepPromptBanner();
    hideSearchOnDemandBanner();

    const overlay = document.getElementById("loadingOverlay");
    const targetYear = activeYear || new Date().getFullYear().toString();
    const cacheKey = AppCache.getKey(targetYear);
    const cachedData = !forceRefresh ? AppCache.get(cacheKey) : null;

    // 1. Jika ada cache lokal valid untuk tahun terpilih, tampilkan seketika (0 ms render, 0 rows read D1)
    if (cachedData && Array.isArray(cachedData) && cachedData.length > 0) {
        if (overlay) overlay.classList.add("hidden");
        allData = cachedData;
        applyClientFilters(false);
        updateStatsFromClient(allData);
        return;
    }

    if (overlay) overlay.classList.remove("hidden");

    try {
        // Ambil data sesuai tahun terpilih (+ berkas fisik pending) secara efisien (1x Query per Tahun)
        const endpoint = targetYear === "ALL" 
            ? `/api/berkas?scope=all` 
            : `/api/berkas?year=${targetYear}`;

        const res = await fetch(endpoint, {
            headers: getAuthHeaders()
        });

        const result = await res.json();
        if (!result.success) {
            showToast(result.error || "Gagal memuat data", "error");
            return;
        }

        // Dekripsi data sensitif di sisi klien secara paralel menggunakan kunci lokal
        allData = await Promise.all(result.data.map(async (row) => {
            const nama = await AppCrypto.decrypt(row.nama_encrypted, appKey);
            const nik = await AppCrypto.decrypt(row.nik_encrypted, appKey);
            const alamat = await AppCrypto.decrypt(row.alamat_encrypted, appKey);

            return {
                ...row,
                nama_decrypted: (nama || "").toUpperCase(),
                nik_decrypted: nik,
                alamat_decrypted: (alamat || "").toUpperCase()
            };
        }));

        // Simpan hasil dekripsi ke cache lokal tahun ini
        AppCache.set(cacheKey, allData);

        if (Array.isArray(result.years) && result.years.length > 0) {
            updateYearDropdown(result.years);
        }

        applyClientFilters(false);
        updateStatsFromClient(allData);
    } catch (err) {
        console.error("Gagal load data:", err);
        showToast("Terjadi kesalahan saat memuat data: " + (err.message || err), "error");
    } finally {
        if (overlay) overlay.classList.add("hidden");
    }
}

// Terapkan Visual Tab E-KTP vs KIA vs ARSIP (gabungan KTP+KIA)
function applyTabUI(jenis) {
    const card17 = document.getElementById("card17");
    const cardContainer = document.getElementById("filterCardContainer");
    const cardSent = document.getElementById("cardStatSent");
    const cardPending = document.getElementById("cardStatPending");
    const cardTotal = document.getElementById("cardStatTotal");
    const labelTotal = document.getElementById("labelStatTotal");
    if (card17) card17.classList.remove("ring-2", "ring-rose-500", "bg-rose-100", "border-rose-500");

    const BASE = "flex-1 min-w-0 truncate text-xs sm:text-sm font-bold px-2 sm:px-4 py-2 rounded-lg transition-all";
    const ON_BLUE = "bg-white text-blue-600 shadow-sm";
    const ON_PURPLE = "bg-white text-purple-700 shadow-sm";
    const OFF = "text-slate-600 hover:text-slate-900";
    const ARSIP_FLEX = "flex items-center justify-center gap-1";
    const btnKTP = document.getElementById("btnFilterKTP");
    const btnKIA = document.getElementById("btnFilterKIA");
    const btnArsip = document.getElementById("btnFilterArsip");

    // Bekukan kontrol yang tidak berlaku di mode ARSIP (semua tahun, tanpa cetak)
    const isArsip = (jenis === "ARSIP");
    setArsipModeFrozen(isArsip);

    if (isArsip) {
        // Mode ARSIP: satu kartu TOTAL saja (KTP+KIA gabungan, semua tahun)
        filter17Active = false;
        if (cardSent) cardSent.classList.add("hidden");
        if (cardPending) cardPending.classList.add("hidden");
        if (card17) card17.classList.add("hidden");
        if (cardTotal) cardTotal.classList.remove("hidden");
        if (labelTotal) labelTotal.innerText = "Total Arsip";
        if (cardContainer) cardContainer.style.gridTemplateColumns = "repeat(1, minmax(0, 1fr))";
    } else if (jenis === "KIA") {
        // KIA tidak mengenal perekaman 17 tahun / IKD → card disembunyikan, grid jadi 3 kolom
        filter17Active = false;
        if (cardSent) cardSent.classList.remove("hidden");
        if (cardPending) cardPending.classList.remove("hidden");
        if (card17) card17.classList.add("hidden");
        if (cardTotal) cardTotal.classList.remove("hidden");
        if (labelTotal) labelTotal.innerText = "Total";
        if (cardContainer) cardContainer.style.gridTemplateColumns = "repeat(3, minmax(0, 1fr))";
    } else {
        if (cardSent) cardSent.classList.remove("hidden");
        if (cardPending) cardPending.classList.remove("hidden");
        if (card17) card17.classList.remove("hidden");
        if (cardTotal) cardTotal.classList.remove("hidden");
        if (labelTotal) labelTotal.innerText = "Total";
        if (cardContainer) cardContainer.style.gridTemplateColumns = "";
    }

    if (!btnKTP || !btnKIA || !btnArsip) return;

    // Kembalikan class tepat tanpa duplikasi (aktif vs idle) — basis responsif dipertahankan
    if (jenis === "KTP") {
        btnKTP.className = `${BASE} ${ON_BLUE}`;
        btnKIA.className = `${BASE} ${OFF}`;
        btnArsip.className = `${BASE} ${ARSIP_FLEX} ${OFF}`;
    } else if (jenis === "KIA") {
        btnKIA.className = `${BASE} ${ON_BLUE}`;
        btnKTP.className = `${BASE} ${OFF}`;
        btnArsip.className = `${BASE} ${ARSIP_FLEX} ${OFF}`;
    } else {
        btnArsip.className = `${BASE} ${ARSIP_FLEX} ${ON_PURPLE}`;
        btnKTP.className = `${BASE} ${OFF}`;
        btnKIA.className = `${BASE} ${OFF}`;
    }
    if (window.lucide) lucide.createIcons();
}

// Bekukan / cairkan kontrol tahun & tombol aksi saat mode ARSIP aktif
function setArsipModeFrozen(isArsip) {
    const wrapperTahun = document.getElementById("wrapperSelectTahun");
    const btnPrint = document.getElementById("btnPrintRW");
    const btnUnsync = document.getElementById("btnUnsyncAll");
    if (wrapperTahun) {
        wrapperTahun.classList.toggle("opacity-40", isArsip);
        wrapperTahun.classList.toggle("pointer-events-none", isArsip);
        wrapperTahun.classList.toggle("select-none", isArsip);
        wrapperTahun.title = isArsip ? "Mode ARSIP menampilkan semua tahun" : "";
    }
    if (btnPrint) {
        btnPrint.disabled = isArsip;
        btnPrint.classList.toggle("opacity-40", isArsip);
        btnPrint.classList.toggle("cursor-not-allowed", isArsip);
        btnPrint.title = isArsip ? "Cetak Laporan RW tidak tersedia di mode ARSIP" : "Cetak Laporan RW";
    }
    if (btnUnsync) {
        btnUnsync.disabled = isArsip;
        btnUnsync.classList.toggle("opacity-40", isArsip);
        btnUnsync.classList.toggle("cursor-not-allowed", isArsip);
        btnUnsync.title = isArsip ? "Reset Cek Fisik tidak tersedia di mode ARSIP" : "Reset status pencocokan berkas fisik menjadi BELUM";
    }
}

// Muat seluruh arsip lintas tahun langsung dari database (scope=all + dekripsi)
async function loadArsipAll(ignoreCache = false) {
    searchedQueries.clear();
    hideDeepPromptBanner();
    hideSearchOnDemandBanner();

    const overlay = document.getElementById("loadingOverlay");
    const cacheKey = AppCache.getKey("ALL");
    const cachedData = !ignoreCache ? AppCache.get(cacheKey) : null;

    // Cache ALL valid → tampilkan seketika tanpa hit D1
    if (cachedData && Array.isArray(cachedData) && cachedData.length > 0) {
        if (overlay) overlay.classList.add("hidden");
        allData = cachedData;
        if (typeof updateYearDropdown === "function") updateYearDropdown();
        applyClientFilters(false);
        updateStatsFromClient(allData);
        return;
    }

    if (overlay) overlay.classList.remove("hidden");
    try {
        const res = await fetch(`/api/berkas?scope=all`, {
            headers: getAuthHeaders()
        });
        const result = await res.json();
        if (!result.success) {
            showToast(result.error || "Gagal memuat data arsip", "error");
            return;
        }

        allData = await Promise.all(result.data.map(async (row) => {
            const nama = await AppCrypto.decrypt(row.nama_encrypted, appKey);
            const nik = await AppCrypto.decrypt(row.nik_encrypted, appKey);
            const alamat = await AppCrypto.decrypt(row.alamat_encrypted, appKey);

            return {
                ...row,
                nama_decrypted: (nama || "").toUpperCase(),
                nik_decrypted: nik,
                alamat_decrypted: (alamat || "").toUpperCase()
            };
        }));

        AppCache.set(cacheKey, allData);

        if (Array.isArray(result.years) && result.years.length > 0) {
            updateYearDropdown(result.years);
        }

        applyClientFilters(false);
        updateStatsFromClient(allData);
    } catch (err) {
        console.error("Gagal load arsip:", err);
        showToast("Terjadi kesalahan saat memuat arsip: " + (err.message || err), "error");
    } finally {
        if (overlay) overlay.classList.add("hidden");
    }
}

// Filter Tab: E-KTP vs KIA vs ARSIP (ARSIP = gabungan KTP+KIA, semua tahun dari DB)
async function filterJenis(jenis) {
    if (jenis !== "KTP" && jenis !== "KIA" && jenis !== "ARSIP") jenis = "KTP";
    activeJenis = jenis;
    sessionStorage.setItem("ktp_active_jenis", jenis);
    filter17Active = false;
    currentPage = 1;
    sessionStorage.setItem("ktp_current_page", "1");

    const selStatus = document.getElementById("selectStatus");
    if (jenis === "ARSIP") {
        // ARSIP selalu memakai tabel TOTAL — jangan bawa filter Diambil/Belum
        // dari tab sebelumnya (nilai itu mengatur kolom tabel di renderUI).
        if (selStatus && selStatus.value !== "ALL") savedStatusBeforeArsip = selStatus.value;
        if (selStatus) selStatus.value = "ALL";
    } else if (savedStatusBeforeArsip && selStatus) {
        // Keluar ARSIP: kembalikan filter terakhir tab normal
        selStatus.value = savedStatusBeforeArsip;
        savedStatusBeforeArsip = null;
    }

    applyTabUI(jenis);
    if (jenis === "ARSIP") {
        await loadArsipAll();
        return;
    }
    applyClientFilters(true);
    updateStatsFromClient(allData);
}

// Ubah Tahun dari Dropdown Navbar (Memuat per-tahun secara hemat & terisolasi)
async function changeTahun(year) {
    // Mode ARSIP menampilkan semua tahun → dropdown dibekukan
    if (typeof activeJenis !== "undefined" && activeJenis === "ARSIP") return;
    activeYear = year;
    sessionStorage.setItem("ktp_active_year", year);
    currentPage = 1;
    sessionStorage.setItem("ktp_current_page", "1");

    await loadData();
}

// Ubah Jumlah Data per Halaman (10 atau 50)
function changePageSize(newSize) {
    pageSize = parseInt(newSize, 10) || 10;
    currentPage = 1;
    sessionStorage.setItem("ktp_current_page", "1");
    renderUI();
}

// Navigasi Pindah Halaman
function changePage(newPage) {
    const totalPages = Math.ceil(filteredData.length / pageSize) || 1;
    if (newPage < 1) newPage = 1;
    if (newPage > totalPages) newPage = totalPages;
    currentPage = newPage;
    sessionStorage.setItem("ktp_current_page", currentPage.toString());
    renderUI();

    // Scroll halus ke atas tabel
    const el = document.getElementById("mobileList");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// Toggle Filter Khusus: Perekaman 17 Tahun (AJUKAN IKD) — hanya berlaku untuk E-KTP
function toggleFilter17() {
    if (activeJenis === "KIA" || activeJenis === "ARSIP") return;
    filter17Active = !filter17Active;
    currentPage = 1;

    if (filter17Active) {
        document.getElementById("selectStatus").value = "ALL";
    }

    applyClientFilters();
}

// Filter Cepat melalui Klik Card Statistik
function filterByCard(status) {
    // Mode ARSIP hanya punya satu kartu TOTAL → klik card tidak memfilter
    if (typeof activeJenis !== "undefined" && activeJenis === "ARSIP") return;
    if (filter17Active) {
        filter17Active = false;
    }
    document.getElementById("selectStatus").value = status;
    if (status === "SENT") {
        currentSortCol = "tgl_ambil";
        currentSortDir = "desc";
    } else if (currentSortCol === "tgl_ambil") {
        currentSortCol = "tgl_datang";
        currentSortDir = "desc";
    }
    currentPage = 1;
    applyClientFilters();
}

// Buka / Tutup Modal Filter Bottom Sheet di Mobile
function openFilterModal() {
    const modal = document.getElementById("filterModal");
    if (modal) {
        modal.classList.remove("hidden");
    }
}

function closeFilterModal() {
    const modal = document.getElementById("filterModal");
    if (modal) {
        modal.classList.add("hidden");
    }
}

// Reset Seluruh Filter ke Default
function resetFilters() {
    const selectRW = document.getElementById("selectRW");
    const selectStatus = document.getElementById("selectStatus");
    const selectSync = document.getElementById("selectSync");
    if (selectRW) selectRW.value = "ALL";
    // Mode ARSIP hanya punya tabel TOTAL — reset tidak boleh mengembalikan
    // filter Diambil/Belum di sini
    if (selectStatus) selectStatus.value = (typeof activeJenis !== "undefined" && activeJenis === "ARSIP") ? "ALL" : "PENDING";
    if (selectSync) selectSync.value = "ALL";

    selectedRW = "ALL";
    sessionStorage.setItem("ktp_active_rw", "ALL");
    currentPage = 1;
    sessionStorage.setItem("ktp_current_page", "1");

    if (filter17Active) {
        toggleFilter17();
    } else {
        applyClientFilters();
    }
    updateFilterUIState();
    closeFilterModal();
}

// Filter Status Cepat
function setFilterStatus(status) {
    // Mode ARSIP hanya punya satu kartu TOTAL → abaikan filter status
    if (typeof activeJenis !== "undefined" && activeJenis === "ARSIP") return;
    if (filter17Active) {
        filter17Active = false;
    }
    const sel = document.getElementById("selectStatus");
    if (sel) sel.value = status;
    if (status === "SENT") {
        currentSortCol = "tgl_ambil";
        currentSortDir = "desc";
    } else if (currentSortCol === "tgl_ambil") {
        currentSortCol = "tgl_datang";
        currentSortDir = "desc";
    }
    currentPage = 1;
    applyClientFilters();
}

// Sinkronkan Status Visual Filter UI (Dot Indikator & Active Card)
function updateFilterUIState() {
    const rw = document.getElementById("selectRW")?.value || "ALL";
    const sync = document.getElementById("selectSync")?.value || "ALL";

    // Indikator Titik Biru pada Tombol Filter Mobile jika ada filter non-default
    const dot = document.getElementById("filterActiveDot");
    if (dot) {
        if (rw !== "ALL" || sync !== "ALL") {
            dot.classList.remove("hidden");
        } else {
            dot.classList.add("hidden");
        }
    }

    updateCardStatsActiveState();
}

// Mempertegas Card Statistik yang sedang aktif menyaring data
function updateCardStatsActiveState() {
    const status = document.getElementById("selectStatus")?.value || "ALL";
    const cardTotal = document.getElementById("cardStatTotal");
    const cardSent = document.getElementById("cardStatSent");
    const cardPending = document.getElementById("cardStatPending");
    const card17 = document.getElementById("card17");

    const dotTotal = document.getElementById("dotStatTotal");
    const dotSent = document.getElementById("dotStatSent");
    const dotPending = document.getElementById("dotStatPending");
    const dot17 = document.getElementById("dotStat17");

    const labelTotal = document.getElementById("labelStatTotal");
    const labelSent = document.getElementById("labelStatSent");
    const labelPending = document.getElementById("labelStatPending");
    const label17 = document.getElementById("labelStat17");

    const numTotal = document.getElementById("statTotal");
    const numSent = document.getElementById("statSent");
    const numPending = document.getElementById("statPending");
    const num17 = document.getElementById("stat17");

    function resetCard(card, dot, label, num) {
        if (!card) return;
        card.className = "stat-card relative bg-white hover:bg-slate-50 border border-slate-200/90 rounded-xl py-2 sm:py-3 px-1.5 sm:px-3 cursor-pointer transition select-none shadow-xs";
        if (dot) dot.classList.add("hidden");
        if (label) label.className = "block text-[11px] uppercase tracking-wider font-semibold text-slate-500 leading-none";
        if (num) num.className = "text-sm sm:text-2xl font-bold text-slate-800 leading-none";
    }

    resetCard(cardTotal, dotTotal, labelTotal, numTotal);
    resetCard(cardSent, dotSent, labelSent, numSent);
    resetCard(cardPending, dotPending, labelPending, numPending);
    resetCard(card17, dot17, label17, num17);

    if (filter17Active) {
        if (card17) {
            card17.className = "stat-card relative bg-rose-50/70 border-2 border-rose-600 ring-2 ring-rose-500/20 rounded-xl py-2 sm:py-3 px-1.5 sm:px-3 cursor-pointer transition select-none shadow-xs";
            if (dot17) dot17.classList.remove("hidden");
            if (label17) label17.className = "block text-[11px] uppercase tracking-wider font-bold text-rose-700 leading-none";
            if (num17) num17.className = "text-sm sm:text-2xl font-extrabold text-rose-900 leading-none";
        }
    } else if (status === "PENDING") {
        if (cardPending) {
            cardPending.className = "stat-card relative bg-amber-50/70 border-2 border-amber-600 ring-2 ring-amber-500/20 rounded-xl py-2 sm:py-3 px-1.5 sm:px-3 cursor-pointer transition select-none shadow-xs";
            if (dotPending) dotPending.classList.remove("hidden");
            if (labelPending) labelPending.className = "block text-[11px] uppercase tracking-wider font-bold text-amber-700 leading-none";
            if (numPending) numPending.className = "text-sm sm:text-2xl font-extrabold text-amber-900 leading-none";
        }
    } else if (status === "SENT") {
        if (cardSent) {
            cardSent.className = "stat-card relative bg-emerald-50/70 border-2 border-emerald-600 ring-2 ring-emerald-500/20 rounded-xl py-2 sm:py-3 px-1.5 sm:px-3 cursor-pointer transition select-none shadow-xs";
            if (dotSent) dotSent.classList.remove("hidden");
            if (labelSent) labelSent.className = "block text-[11px] uppercase tracking-wider font-bold text-emerald-700 leading-none";
            if (numSent) numSent.className = "text-sm sm:text-2xl font-extrabold text-emerald-900 leading-none";
        }
    } else {
        if (cardTotal) {
            cardTotal.className = "stat-card relative bg-blue-50/70 border-2 border-blue-600 ring-2 ring-blue-500/20 rounded-xl py-2 sm:py-3 px-1.5 sm:px-3 cursor-pointer transition select-none shadow-xs";
            if (dotTotal) dotTotal.classList.remove("hidden");
            if (labelTotal) labelTotal.className = "block text-[11px] uppercase tracking-wider font-bold text-blue-700 leading-none";
            if (numTotal) numTotal.className = "text-sm sm:text-2xl font-extrabold text-blue-900 leading-none";
        }
    }

    // Penegakan akhir: fungsi ini menimpa className via resetCard, jadi status
    // sembunyi card untuk tab KIA / ARSIP harus diterapkan ulang di sini
    if (typeof activeJenis !== "undefined" && activeJenis === "ARSIP") {
        const cSent = document.getElementById("cardStatSent");
        const cPending = document.getElementById("cardStatPending");
        const c17 = document.getElementById("card17");
        const container = document.getElementById("filterCardContainer");
        const labelTotal = document.getElementById("labelStatTotal");
        if (cSent) cSent.classList.add("hidden");
        if (cPending) cPending.classList.add("hidden");
        if (c17) c17.classList.add("hidden");
        if (labelTotal) labelTotal.innerText = "Total Arsip";
        if (container) container.style.gridTemplateColumns = "repeat(1, minmax(0, 1fr))";
        // Sorot satu-satunya kartu TOTAL sebagai aktif
        if (cardTotal) {
            cardTotal.className = "stat-card relative bg-purple-50/70 border-2 border-purple-600 ring-2 ring-purple-500/20 rounded-xl py-2 sm:py-3 px-1.5 sm:px-3 cursor-pointer transition select-none shadow-xs";
            if (dotTotal) dotTotal.classList.remove("hidden");
            if (labelTotal) labelTotal.className = "block text-[11px] uppercase tracking-wider font-bold text-purple-700 leading-none";
            if (numTotal) numTotal.className = "text-sm sm:text-2xl font-extrabold text-purple-900 leading-none";
        }
        return;
    }
    if (typeof activeJenis !== "undefined" && activeJenis === "KIA") {
        const c17 = document.getElementById("card17");
        const container = document.getElementById("filterCardContainer");
        if (c17) c17.classList.add("hidden");
        if (container) container.style.gridTemplateColumns = "repeat(3, minmax(0, 1fr))";
    }
}

// Toggle Urutan Kolom (RW, Tgl Datang, atau Tgl Ambil/Pengambil)
function toggleSort(column) {
    if (currentSortCol === column) {
        currentSortDir = currentSortDir === "asc" ? "desc" : "asc";
    } else {
        currentSortCol = column;
        currentSortDir = (column === "tgl_datang" || column === "tgl_ambil") ? "desc" : "asc";
    }

    updateSortIcons();
    applyClientFilters(false);
}

// Update Simbol Panah Sortir di Header Tabel
function updateSortIcons() {
    const iconRw = document.getElementById("sort-rw-icon");
    const iconTgl = document.getElementById("sort-tgl_datang-icon");
    const iconPengambil = document.getElementById("sort-pengambil-icon");
    if (iconRw) iconRw.innerText = "";
    if (iconTgl) iconTgl.innerText = "";
    if (iconPengambil) iconPengambil.innerText = "";

    const arrow = currentSortDir === "asc" ? "▲" : "▼";
    if (currentSortCol === "rw" && iconRw) iconRw.innerText = arrow;
    if (currentSortCol === "tgl_datang" && iconTgl) iconTgl.innerText = arrow;
    if (currentSortCol === "tgl_ambil" && iconPengambil) iconPengambil.innerText = arrow;
}

// Terapkan Filter & Urutan Data di Browser
function applyClientFilters(resetPage = true, allowOnDemand = true) {
    if (resetPage) {
        currentPage = 1;
        sessionStorage.setItem("ktp_current_page", "1");
    }

    const selectRWEl = document.getElementById("selectRW");
    const rw = selectRWEl ? selectRWEl.value : (selectedRW || "ALL");
    selectedRW = rw;
    sessionStorage.setItem("ktp_active_rw", rw);
    const status = document.getElementById("selectStatus").value;
    const sync = document.getElementById("selectSync").value;
    const searchRaw = document.getElementById("searchInput") ? document.getElementById("searchInput").value : "";
    const search = searchRaw.toLowerCase().trim();
    const isSearching = (search.length > 0);

    const btnClear = document.getElementById("btnClearSearch");
    const bannerInfo = document.getElementById("searchInfoBanner");
    const kwHighlight = document.getElementById("searchKeywordHighlight");
    const btnRefreshData = document.getElementById("btnRefreshData");
    const wrapperFilterJenis = document.getElementById("wrapperFilterJenis");
    const wrapperSelectTahun = document.getElementById("wrapperSelectTahun");
    const filterCardContainer = document.getElementById("filterCardContainer");
    const selectRW = document.getElementById("selectRW");
    const selectStatus = document.getElementById("selectStatus");
    const selectSync = document.getElementById("selectSync");
    const btnOpenFilterModal = document.getElementById("btnOpenFilterModal");
    const freezeElements = [
        wrapperFilterJenis,
        wrapperSelectTahun,
        btnRefreshData,
        filterCardContainer,
        btnOpenFilterModal,
        selectRW?.parentElement,
        selectSync?.parentElement
    ];

    if (isSearching) {
        if (btnClear) btnClear.classList.remove("hidden");
        if (bannerInfo) bannerInfo.classList.remove("hidden");
        if (kwHighlight) kwHighlight.innerText = searchRaw.trim();
        freezeElements.forEach(el => el && el.classList.add("opacity-40", "pointer-events-none", "select-none"));
    } else {
        if (btnClear) btnClear.classList.add("hidden");
        if (bannerInfo) bannerInfo.classList.add("hidden");
        freezeElements.forEach(el => el && el.classList.remove("opacity-40", "pointer-events-none", "select-none"));
        // Mode ARSIP: tahun tetap beku (semua tahun) walau tidak sedang mencari
        if (typeof activeJenis !== "undefined" && activeJenis === "ARSIP" && typeof setArsipModeFrozen === "function") {
            setArsipModeFrozen(true);
        }
    }

    const isArsipMode = (typeof activeJenis !== "undefined" && activeJenis === "ARSIP");

    // 1. Filter Data
    filteredData = allData.filter(item => {
        // MODE PENCARIAN UNIVERSAL BEBAS (BERADA DI LANGIT - PRIORITAS UTAMA):
        // Tidak dibatasi oleh filter RW, Status Pengambilan (Ambil/Belum), Sync, 17 Tahun, Jenis Tab (KTP/KIA/ARSIP), dan Tahun!
        if (isSearching) {
            const nama = (item.nama_decrypted || "").toLowerCase();
            const nik = (item.nik_decrypted || "").toLowerCase();
            const alamat = (item.alamat_decrypted || "").toLowerCase();
            const ket = (item.keterangan || "").toLowerCase();
            const hub = (item.hubungan_pengambil || "").toLowerCase();
            const jenis = (item.jenis_berkas || "").toLowerCase();
            const rwStr = `rw ${item.rw} rw${item.rw} ${item.rw}`;

            return (
                nama.includes(search) || 
                nik.includes(search) || 
                alamat.includes(search) || 
                ket.includes(search) ||
                hub.includes(search) ||
                jenis.includes(search) ||
                rwStr.includes(search)
            );
        }

        const isArsip = (item.hubungan_pengambil === "ARSIP");

        // MODE ARSIP (Ketika kolom pencarian KOSONG):
        // Gabungan KTP+KIA yang berstatus ARSIP, SEMUA TAHUN (abaikan tahun, jenis, status, 17 tahun)
        if (isArsipMode) {
            if (!isArsip) return false;

            // D. Filter RW (tetap berlaku)
            if (rw !== "ALL" && String(item.rw) !== rw) return false;

            // F. Filter Sinkronisasi (tetap berlaku)
            if (sync !== "ALL" && item.sinkronisasi !== sync) return false;

            return true;
        }

        // MODE FILTER NORMAL (Ketika kolom pencarian KOSONG):
        // Kembali ke settingan terakhir: jenis tab (KTP/KIA), tahun, 17 tahun, RW, status, dan sync
        // Arsip keluar dari antrean aktif → disembunyikan dari tab KTP/KIA, hanya tampil di tab ARSIP.

        // A0. Kecualikan ARSIP dari tab normal
        if (isArsip) {
            return false;
        }

        // A. Filter Jenis Berkas (Tab E-KTP vs KIA)
        if (item.jenis_berkas && item.jenis_berkas !== activeJenis) {
            return false;
        }

        // B. Filter Tahun
        const isSent = item.tgl_ambil && item.tgl_ambil.trim() !== "";
        if (activeYear !== "ALL" && item.tgl_datang) {
            const itemYear = item.tgl_datang.substring(0, 4);
            if (isSent) {
                if (itemYear !== activeYear) return false;
            } else {
                if (itemYear > activeYear) return false;
            }
        }

        // C. Filter Perekaman Baru 17 Tahun
        if (filter17Active && item.keterangan !== "Perekaman Baru 17 Tahun") {
            return false;
        }

        // D. Filter RW
        if (rw !== "ALL" && String(item.rw) !== rw) return false;

        // E. Filter Status Pengambilan
        if (status === "SENT" && !isSent) return false;
        if (status === "PENDING" && isSent) return false;

        // F. Filter Status Pencocokan Fisik (SYNC / BELUM)
        if (sync !== "ALL" && item.sinkronisasi !== sync) return false;

        return true;
    });

    // 2. Multi-tier Sorting:
    filteredData.sort((a, b) => {
        if (currentSortCol === "rw") {
            const rwA = parseInt(a.rw) || 0;
            const rwB = parseInt(b.rw) || 0;
            if (rwA !== rwB) {
                return currentSortDir === "asc" ? rwA - rwB : rwB - rwA;
            }
            const tglA = a.tgl_datang || "";
            const tglB = b.tgl_datang || "";
            if (tglA !== tglB) return tglB.localeCompare(tglA);
            return (a.nama_decrypted || "").localeCompare(b.nama_decrypted || "");
        } else if (currentSortCol === "tgl_ambil") {
            const tA = a.tgl_ambil || "";
            const tB = b.tgl_ambil || "";
            if (tA !== tB) {
                return currentSortDir === "asc" ? tA.localeCompare(tB) : tB.localeCompare(tA);
            }
            const tdA = a.tgl_datang || "";
            const tdB = b.tgl_datang || "";
            if (tdA !== tdB) return tdB.localeCompare(tdA);
            const rwA = parseInt(a.rw) || 0;
            const rwB = parseInt(b.rw) || 0;
            if (rwA !== rwB) return rwA - rwB;
            return (a.nama_decrypted || "").localeCompare(b.nama_decrypted || "");
        } else {
            const tglA = a.tgl_datang || "";
            const tglB = b.tgl_datang || "";
            if (tglA !== tglB) {
                return currentSortDir === "asc" ? tglA.localeCompare(tglB) : tglB.localeCompare(tglA);
            }
            const rwA = parseInt(a.rw) || 0;
            const rwB = parseInt(b.rw) || 0;
            if (rwA !== rwB) return rwA - rwB;
            return (a.nama_decrypted || "").localeCompare(b.nama_decrypted || "");
        }
    });

    renderUI();
    updateFilterUIState();

    // 3. Rekomendasi Deep Search Manual jika tidak ditemukan di memori tahun aktif
    if (allowOnDemand && isSearching && search.length >= 2 && filteredData.length === 0) {
        showDeepSearchPrompt(searchRaw.trim());
    } else {
        hideDeepPromptBanner();
    }
}

// Tampilkan banner notifikasi saran & tombol Deep Search
function showDeepSearchPrompt(query) {
    const promptBanner = document.getElementById("searchDeepPromptBanner");
    const keywordEl = document.getElementById("deepPromptKeyword");
    const yearEl = document.getElementById("deepPromptYear");

    if (keywordEl) keywordEl.innerText = query;
    if (yearEl) yearEl.innerText = (typeof activeYear !== "undefined" && activeYear !== "ALL") ? activeYear : "tahun berjalan";
    if (promptBanner) promptBanner.classList.remove("hidden");
    if (window.lucide) lucide.createIcons();
}

// Sembunyikan banner saran & tombol Deep Search
function hideDeepPromptBanner() {
    const promptBanner = document.getElementById("searchDeepPromptBanner");
    if (promptBanner) promptBanner.classList.add("hidden");
}

// Pemicu manual Deep Search saat user mengklik tombol (di banner atau di kolom search)
async function triggerDeepSearchManual() {
    const input = document.getElementById("searchInput");
    const query = (input?.value || "").trim();
    if (!query || query.length < 2) return;

    hideDeepPromptBanner();
    await executeDeepSearch(query);
}

// Eksekusi Pencarian Menyeluruh (Deep Search) ke Database Arsip Cloudflare D1
async function executeDeepSearch(query) {
    const cleanQuery = query.toLowerCase().trim();
    if (cleanQuery.length < 2) return;

    if (searchAbortController) {
        searchAbortController.abort();
    }
    searchAbortController = new AbortController();

    const bannerText = document.getElementById("searchOnDemandText");
    const is16Digit = /^\d{16}$/.test(cleanQuery);

    if (bannerText) {
        bannerText.innerText = is16Digit
            ? `Mencari NIK spesifik di database Cloudflare...`
            : `Mencari "${query}" di seluruh arsip database Cloudflare...`;
    }
    showSearchOnDemandBanner();

    try {
        let endpoint = "";
        if (is16Digit) {
            const hash = await AppCrypto.hashNIK(cleanQuery);
            endpoint = `/api/berkas?nik_hash=${hash}`;
        } else {
            // DEEP SEARCH ON-DEMAND: Ambil seluruh arsip KTP & KIA dari database D1
            endpoint = `/api/berkas?scope=all`;
        }

        const res = await fetch(endpoint, {
            headers: getAuthHeaders(),
            signal: searchAbortController.signal
        });

        const result = await res.json();
        if (result.success && Array.isArray(result.data)) {
            // Dekripsi baris baru yang belum ada di memori
            const existingIds = new Set(allData.map(d => d.id));
            const newRows = result.data.filter(r => !existingIds.has(r.id));

            if (newRows.length > 0) {
                const decryptedNewRows = await Promise.all(newRows.map(async (row) => {
                    const nama = await AppCrypto.decrypt(row.nama_encrypted, appKey);
                    const nik = await AppCrypto.decrypt(row.nik_encrypted, appKey);
                    const alamat = await AppCrypto.decrypt(row.alamat_encrypted, appKey);
                    return {
                        ...row,
                        nama_decrypted: (nama || "").toUpperCase(),
                        nik_decrypted: nik,
                        alamat_decrypted: (alamat || "").toUpperCase()
                    };
                }));
                allData = [...allData, ...decryptedNewRows];

                // Update cache mode aktif (ARSIP → cache ALL, normal → cache tahun)
                AppCache.set(AppCache.getKey(), allData);
            }

            if (Array.isArray(result.years) && result.years.length > 0) {
                updateYearDropdown(result.years);
            }

            hideSearchOnDemandBanner();
            hideDeepPromptBanner();

            // Terapkan filter tanpa menampilkan prompt berulang (allowOnDemand = false)
            applyClientFilters(true, false);

            if (filteredData.length > 0) {
                showToast(`Ditemukan ${filteredData.length} data dari database arsip!`, "success");
            } else {
                showToast(`Data "${query}" tidak ditemukan di database arsip.`, "error");
            }
        }
    } catch (err) {
        if (err.name === "AbortError") {
            console.log("Pencarian arsip database dibatalkan.");
        } else {
            console.error("Gagal deep search:", err);
            hideSearchOnDemandBanner();
            showToast("Gagal melakukan pencarian database: " + err.message, "error");
        }
    }
}

// Batalkan Pencarian On-Demand
function cancelSearchOnDemand() {
    if (searchAbortController) {
        searchAbortController.abort();
        searchAbortController = null;
    }
    if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = null;
    }
    hideSearchOnDemandBanner();
}

function showSearchOnDemandBanner() {
    const el = document.getElementById("searchOnDemandBanner");
    if (el) el.classList.remove("hidden");
}

function hideSearchOnDemandBanner() {
    const el = document.getElementById("searchOnDemandBanner");
    if (el) el.classList.add("hidden");
}

// Reset dan Bersihkan Pencarian (Kembali ke Filter Normal)
function clearSearch() {
    const input = document.getElementById("searchInput");
    if (input) input.value = "";
    cancelSearchOnDemand();
    hideDeepPromptBanner();
    applyClientFilters(true);
}
