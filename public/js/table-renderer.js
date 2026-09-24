/**
 * Modul Renderer Tabel Desktop & Kartu Mobile
 * Menampilkan antarmuka responsif, fitur Hover-to-Reveal NIK, dan badge status
 */

var expandedCardIds = new Set();

// Buka / Tutup Rincian Kartu Mobile Satuan (Smooth CSS Grid Animation from ui_mobile.html)
function toggleMobileCard(id) {
    const detailEl = document.getElementById(`card-detail-${id}`);
    const chevronEl = document.getElementById(`chevron-${id}`);
    const labelEl = document.getElementById(`toggle-text-${id}`);
    if (!detailEl) return;

    const isOpen = detailEl.classList.contains("open");
    if (isOpen) {
        detailEl.classList.remove("open");
        if (chevronEl) chevronEl.classList.remove("rotate");
        if (labelEl) labelEl.textContent = "Detail & NIK";
        expandedCardIds.delete(id);
    } else {
        detailEl.classList.add("open");
        if (chevronEl) chevronEl.classList.add("rotate");
        if (labelEl) labelEl.textContent = "Tutup Detail";
        expandedCardIds.add(id);
    }
}

// Buka atau Tutup Seluruh Rincian Kartu Mobile Sekaligus
function toggleAllMobileCards() {
    const allDetails = document.querySelectorAll("[id^='card-detail-']");
    const toggleBtnText = document.getElementById("toggleAllCardsText");
    const isAnyClosed = Array.from(allDetails).some(el => !el.classList.contains("open"));

    allDetails.forEach(detailEl => {
        const id = parseInt(detailEl.id.replace("card-detail-", ""), 10);
        const chevronEl = document.getElementById(`chevron-${id}`);
        const labelEl = document.getElementById(`toggle-text-${id}`);
        if (isAnyClosed) {
            detailEl.classList.add("open");
            if (chevronEl) chevronEl.classList.add("rotate");
            if (labelEl) labelEl.textContent = "Tutup Detail";
            expandedCardIds.add(id);
        } else {
            detailEl.classList.remove("open");
            if (chevronEl) chevronEl.classList.remove("rotate");
            if (labelEl) labelEl.textContent = "Detail & NIK";
            expandedCardIds.delete(id);
        }
    });

    if (toggleBtnText) {
        toggleBtnText.innerText = isAnyClosed ? "Tutup Semua" : "Buka Semua";
    }
}

function renderUI() {
    const mobileContainer = document.getElementById("mobileList");
    const desktopContainer = document.getElementById("desktopTableBody");
    const desktopThead = document.getElementById("desktopThead");
    const currentStatusFilter = document.getElementById("selectStatus").value; // 'PENDING', 'SENT', or 'ALL'

    mobileContainer.innerHTML = "";
    desktopContainer.innerHTML = "";

    const searchVal = document.getElementById("searchInput") ? document.getElementById("searchInput").value.trim() : "";
    const isSearching = (searchVal.length > 0);

    // 1. Susun Header Tabel Desktop Dinamis (table-fixed: lebar proporsional tetap):
    // No 3rem | NIK 12rem | Nama 15rem = Alamat 15rem (sama besar) |
    // Keterangan 9rem | Tgl Datang 12rem (badge status + chip sync sebaris) |
    // Pengambil 11rem | Aksi fleksibel
    // (min 11rem untuk grid chip 2x2, menampung sisa ruang saat kolom
    //  Pengambil buka-tutup agar tak ada chip yang wrap turun)
    // Kolom Arsip & Sync digabung ke dalam 1 kolom Aksi (menu gabungan) agar tabel lega.
    // Jika sedang mencari bebas, selalu tampilkan kolom Pengambil agar informasi status lengkap.
    const showPengambil = isSearching || (currentStatusFilter === "SENT" || currentStatusFilter === "ALL");
    const showSync = isSearching || (currentStatusFilter === "PENDING" || currentStatusFilter === "ALL");
    const colSpan = 7 + (showPengambil ? 1 : 0);

    if (desktopThead) {
        desktopThead.innerHTML = `
            <tr>
                <th class="py-3 px-3 w-12 text-center whitespace-nowrap">No</th>
                <th class="py-3 px-3 whitespace-nowrap w-48">NIK & Kelahiran</th>
                <th class="py-3 px-3 w-60">Nama Pemilik</th>
                <th onclick="toggleSort('rw')" class="py-3 px-3 w-60 cursor-pointer hover:bg-slate-100 select-none transition" title="Klik untuk mengurutkan berdasarkan RW">
                    <div class="flex items-center justify-between gap-1">
                        <span>Alamat & RW</span>
                        <span id="sort-rw-icon" class="text-blue-600 font-bold text-xs">${currentSortCol === 'rw' ? (currentSortDir === 'asc' ? '▲' : '▼') : ''}</span>
                    </div>
                </th>
                <th class="py-3 px-3 whitespace-nowrap w-36">Keterangan</th>
                <th onclick="toggleSort('tgl_datang')" class="py-3 px-3 cursor-pointer hover:bg-slate-100 select-none transition whitespace-nowrap w-48" title="Klik untuk mengurutkan tanggal datang">
                    <div class="flex items-center gap-1">
                        <span>Tgl Datang</span>
                        <span id="sort-tgl_datang-icon" class="text-blue-600 font-bold">${currentSortCol === 'tgl_datang' ? (currentSortDir === 'asc' ? '▲' : '▼') : ''}</span>
                    </div>
                </th>
                ${showPengambil ? `
                <th onclick="toggleSort('tgl_ambil')" class="py-3 px-3 cursor-pointer hover:bg-slate-100 select-none transition whitespace-nowrap w-44" title="Klik untuk mengurutkan tanggal diterima / pengambil">
                    <div class="flex items-center gap-1">
                        <span>Pengambil</span>
                        <span id="sort-pengambil-icon" class="text-blue-600 font-bold">${currentSortCol === 'tgl_ambil' ? (currentSortDir === 'asc' ? '▲' : '▼') : ''}</span>
                    </div>
                </th>` : ''}
                <th class="py-3 px-3 text-center min-w-44">Aksi</th>
            </tr>
        `;
    }

    // 2. Hitung Slicing Pagination (Default: 10 atau 50 data per halaman)
    const totalItems = filteredData.length;
    const totalPages = Math.ceil(totalItems / pageSize) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    sessionStorage.setItem("ktp_current_page", currentPage.toString());

    const startIdx = (currentPage - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, totalItems);
    const pageData = filteredData.slice(startIdx, endIdx);

    // Update Elemen Pagination
    const elPageInfo = document.getElementById("pageInfo");
    const elPageBadge = document.getElementById("pageBadge");
    const mobileCountInfo = document.getElementById("mobileCountInfo");
    const btnPrev = document.getElementById("btnPrevPage");
    const btnNext = document.getElementById("btnNextPage");
    const selPageSize = document.getElementById("selectPageSize");

    if (elPageInfo) {
        elPageInfo.innerText = totalItems === 0
            ? "Menampilkan 0 data"
            : `Menampilkan ${startIdx + 1}-${endIdx} dari ${totalItems} data`;
    }
    if (mobileCountInfo) {
        mobileCountInfo.innerText = totalItems === 0
            ? "0 berkas"
            : `${startIdx + 1}-${endIdx} dari ${totalItems} berkas`;
    }
    if (elPageBadge) {
        elPageBadge.innerText = `${currentPage} / ${totalPages}`;
    }
    if (btnPrev) {
        btnPrev.disabled = (currentPage <= 1);
    }
    if (btnNext) {
        btnNext.disabled = (currentPage >= totalPages);
    }
    if (selPageSize && selPageSize.value !== String(pageSize)) {
        selPageSize.value = String(pageSize);
    }

    // Tampilan Saat Data Kosong
    if (totalItems === 0) {
        desktopContainer.innerHTML = `
            <tr>
                <td colspan="${colSpan}" class="py-16 text-center text-slate-400">
                    <div class="flex flex-col items-center justify-center gap-2">
                        <div class="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-1">
                            <i data-lucide="inbox" class="w-6 h-6"></i>
                        </div>
                        <p class="text-sm font-bold text-slate-700">Tidak ada data berkas yang sesuai filter</p>
                        <p class="text-xs text-slate-400 font-medium">Silakan sesuaikan kata kunci pencarian atau filter yang dipilih.</p>
                    </div>
                </td>
            </tr>
        `;
        mobileContainer.innerHTML = `
            <div class="py-14 px-4 text-center">
                <div class="flex flex-col items-center justify-center gap-2">
                    <div class="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-1">
                        <i data-lucide="inbox" class="w-6 h-6"></i>
                    </div>
                    <p class="text-sm font-bold text-slate-700">Tidak ada data berkas yang sesuai filter</p>
                    <p class="text-xs text-slate-400 font-medium">Silakan sesuaikan kata kunci pencarian atau filter yang dipilih.</p>
                </div>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    // 3. Iterasi Render Tiap Baris Data Halaman Terpilih
    pageData.forEach((row, pageIndex) => {
        const idx = startIdx + pageIndex;
        const isSent = row.tgl_ambil && row.tgl_ambil.trim() !== "";
        const isArsip = (row.hubungan_pengambil === "ARSIP");
        const maskedNik = NIKHelper.maskNIK(row.nik_decrypted);
        const fmtTglDatang = formatDate(row.tgl_datang);
        const fmtTglAmbil = formatDate(row.tgl_ambil);

        const age = NIKHelper.getAge(row);
        const isLansia = NIKHelper.isLansia(row);

        // Escape string untuk penggunaan aman pada inline HTML event handler
        const safeNama = (row.nama_decrypted || '').replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, "&quot;");
        const safeNik = (row.nik_decrypted || '').replace(/\\/g, "\\\\").replace(/'/g, "\\'");

        // Indikator ARSIP (status tetap terlihat walau tombolnya masuk menu gabungan)
        const arsipPill = isArsip
            ? `<span class="whitespace-nowrap inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-purple-100 text-purple-800 border border-purple-300 mt-1">
                <i data-lucide="archive" class="w-3 h-3 text-purple-700 shrink-0"></i>
                <span>ARSIP</span>
               </span>`
            : ``;

        // Tombol sinkronisasi 1-klik, dipasang tepat di sebelah badge status
        const syncBtn = row.sinkronisasi === "SYNC"
            ? `<button type="button" onclick="toggleSync(${row.id}, '${row.sinkronisasi}')" title="Sudah cocok fisik — klik untuk tandai BELUM" class="whitespace-nowrap inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition shadow-2xs">
                <i data-lucide="check-check" class="w-3 h-3 shrink-0"></i>
                <span>SYNC</span>
               </button>`
            : `<button type="button" onclick="toggleSync(${row.id}, '${row.sinkronisasi}')" title="Belum dicek fisik — klik untuk tandai SYNC" class="whitespace-nowrap inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-white text-slate-500 border border-dashed border-slate-300 hover:text-emerald-700 hover:border-emerald-400 hover:bg-emerald-50 active:scale-95 transition shadow-2xs">
                <i data-lucide="clipboard-check" class="w-3 h-3 shrink-0"></i>
                <span>BELUM</span>
               </button>`;

        // Badge Status Pengambilan
        let statusBadge = "";
        if (isSent) {
            statusBadge = `<span class="whitespace-nowrap px-2.5 py-0.5 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">Selesai</span>`;
        } else if (String(row.status).includes("TAHAN")) {
            statusBadge = `<span class="whitespace-nowrap px-2.5 py-0.5 rounded-md text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">Tahan (&lt;17)</span>`;
        } else {
            statusBadge = `<span class="whitespace-nowrap px-2.5 py-0.5 rounded-md text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200">Tersedia</span>`;
        }

        // Badge Keterangan Berkas (Murni tujuan berkas, tidak dobel Lansia)
        let ketBadge = "";
        if (row.keterangan === "Perekaman Baru 17 Tahun") {
            ketBadge = `<span class="whitespace-nowrap inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
                <i data-lucide="alert-circle" class="w-3.5 h-3.5 text-rose-600 shrink-0"></i>
                <span>17 Thn &bull; IKD</span>
            </span>`;
        } else {
            ketBadge = `<span class="whitespace-nowrap inline-block px-2.5 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200/80">${row.keterangan || "-"}</span>`;
        }

        const isKIA = (row.jenis_berkas === "KIA");
        const rwBadge = getRWBadge(row.rw);
        const pengambilBadge = getPengambilBadge(row.hubungan_pengambil, row.tgl_ambil);

        const syncBadge = row.sinkronisasi === "SYNC"
            ? `<button onclick="toggleSync(${row.id}, '${row.sinkronisasi}')" title="Klik untuk ubah status sinkronisasi" class="whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition">SYNC</button>`
            : `<button onclick="toggleSync(${row.id}, '${row.sinkronisasi}')" title="Klik untuk ubah status sinkronisasi" class="whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200 transition">BELUM</button>`;

        // A. Kartu Tampilan Mobile: Accordion Buka-Tutup dari ui_mobile.html
        const isCardOpen = expandedCardIds.has(row.id);
        const is17 = (row.keterangan === "Perekaman Baru 17 Tahun");

        // Status pill dari ui_mobile.html
        let statusPill = "";
        if (isSent) {
            statusPill = `<span class="status-pill text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200/50 px-1.5 py-0.5 rounded leading-none">Sudah Diambil</span>`;
        } else if (String(row.status).includes("TAHAN")) {
            statusPill = `<span class="status-pill text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200/50 px-1.5 py-0.5 rounded leading-none">Tahan (&lt;17)</span>`;
        } else {
            statusPill = `<span class="status-pill text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/50 px-1.5 py-0.5 rounded leading-none">Tersedia</span>`;
        }

        let subText = isKIA ? (row.keterangan || "Cetak Biasa KIA") : (row.keterangan || "Cetak Biasa KTP");
        if (is17) subText = "Harap dampingi aktivasi IKD";

        const cardBorderTheme = is17 
            ? "border-rose-200/90 hover:border-rose-300" 
            : (isLansia ? "border-amber-200/90 hover:border-amber-300" : "border-slate-200/90 hover:border-blue-300");

        const card = document.createElement("div");
        card.id = `mobile-card-${row.id}`;
        card.className = `card-item bg-white rounded-xl border ${cardBorderTheme} shadow-xs transition overflow-hidden`;
        card.innerHTML = `
            <!-- COMPACT HEADER (Nama Mandiri, Alamat, RW di Bawah Alamat & Tombol Serahkan) -->
            <div class="p-3">
                <div class="flex items-start justify-between gap-2">
                    <div class="flex-1 min-w-0">
                        <!-- 1. Nama Warga Berdiri Sendiri -->
                        <h2 class="text-sm font-bold text-slate-900 tracking-tight leading-snug truncate cursor-pointer hover:text-blue-600 transition" onclick="copyToClipboard('${safeNama}', event)" title="Klik untuk salin nama: ${safeNama}">
                            ${row.nama_decrypted}
                        </h2>

                        <!-- 2. Alamat -->
                        <p class="text-xs text-slate-600 mt-1 flex items-center gap-1 font-medium truncate uppercase">
                            <i data-lucide="map-pin" class="w-3.5 h-3.5 text-slate-400 shrink-0"></i>
                            <span class="truncate">${(row.alamat_decrypted || "Alamat belum diisi").toUpperCase()}</span>
                        </p>

                        <!-- 3. Di Bawah Alamat: Tempatkan RW & Tag Khusus -->
                        <div class="mt-1.5 flex items-center gap-1.5 flex-wrap">
                            <span class="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[11px] leading-none border border-slate-200">RW ${row.rw || "-"}</span>
                            ${isArsip ? `
                                <span class="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded leading-none">
                                    <i data-lucide="archive" class="w-2.5 h-2.5"></i>
                                    <span>ARSIP</span>
                                </span>` : ''
                            }
                            ${is17 ? `
                                <span class="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded leading-none">
                                    <i data-lucide="alert-circle" class="w-2.5 h-2.5"></i>
                                    <span>17 Thn &bull; IKD</span>
                                </span>` : ''
                            }
                            ${isLansia ? `
                                <span class="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded leading-none">
                                    Lansia (${age} Thn)
                                </span>` : ''
                            }
                        </div>
                    </div>

                    <!-- Tombol Aksi Cepat "Serahkan / Ubah" (Bisa langsung dipencet tanpa buka accordion) -->
                    <button onclick="openModalPengambilan(${row.id})" class="action-serahkan shrink-0 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1 transition" title="${isSent ? 'Ubah Pengambilan' : 'Serahkan Berkas'}">
                        <i data-lucide="${isSent ? 'check-circle' : 'user-check'}" class="w-3.5 h-3.5"></i>
                        <span>${isSent ? "Ubah" : "Serahkan"}</span>
                    </button>
                </div>

                <!-- Baris Pemicu Detail (Accordion Toggle) -->
                <div class="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <span class="${is17 ? 'text-rose-600 font-medium' : 'text-slate-400 font-medium'}">${subText}</span>
                    <button onclick="toggleMobileCard(${row.id})" class="text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 select-none">
                        <span id="toggle-text-${row.id}">${isCardOpen ? 'Tutup Detail' : 'Detail & NIK'}</span>
                        <i data-lucide="chevron-down" id="chevron-${row.id}" class="w-3.5 h-3.5 chevron-icon ${isCardOpen ? 'rotate' : ''}"></i>
                    </button>
                </div>
            </div>

            <!-- EXPANDABLE DRAWER: Data Sekunder (NIK, Tgl Lahir, Tgl Masuk, Aksi Admin) -->
            <div id="card-detail-${row.id}" class="card-detail ${isCardOpen ? 'open' : ''} ${is17 ? 'bg-rose-50/40 border-t border-rose-100' : (isLansia ? 'bg-amber-50/30 border-t border-amber-100' : 'bg-slate-50/80 border-t border-slate-100')}">
                <div class="card-detail-inner p-3 space-y-2.5">
                    <!-- Grid Data Identitas: 4 Kotak Rapi -->
                    <div class="grid grid-cols-2 gap-2 text-xs">
                        <div class="bg-white p-2 rounded-lg border border-slate-200/70">
                            <span class="text-[11px] uppercase font-semibold text-slate-400 block mb-0.5">NIK Warga</span>
                            <div class="flex items-center justify-between font-mono font-semibold text-slate-800">
                                <span>${maskedNik}</span>
                                <button onclick="copyToClipboard('${safeNik}', event)" title="Salin NIK" class="text-slate-400 hover:text-blue-600 p-0.5">
                                    <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                                </button>
                            </div>
                        </div>

                        <div class="bg-white p-2 rounded-lg border border-slate-200/70">
                            <span class="text-[11px] uppercase font-semibold text-slate-400 block mb-0.5">Tgl Lahir</span>
                            <span class="font-medium text-slate-700 text-xs">${row.kelahiran || "-"} ${age ? `<span class="text-slate-500 font-normal">(${age} Thn)</span>` : ''}</span>
                        </div>

                        <div class="bg-white p-2 rounded-lg border border-slate-200/70">
                            <span class="text-[11px] uppercase font-semibold text-slate-400 block mb-0.5">Tgl Masuk</span>
                            <span class="font-medium text-slate-700 text-xs">${fmtTglDatang || "-"}</span>
                        </div>

                        <div class="bg-white p-2 rounded-lg border border-slate-200/70">
                            <span class="text-[11px] uppercase font-semibold text-slate-400 block mb-0.5">Status Pengambilan</span>
                            <span class="${isSent ? 'text-emerald-700 font-semibold' : 'text-amber-600 font-semibold'} text-xs truncate block">
                                ${isSent ? (fmtTglAmbil + (row.hubungan_pengambil ? ' (' + row.hubungan_pengambil + ')' : '')) : 'Belum Diambil'}
                            </span>
                        </div>
                    </div>

                    <!-- Baris Aksi Administratif -->
                    <div class="pt-2 border-t border-slate-200/60 flex items-center justify-between">
                        <div class="flex items-center gap-1.5">
                            ${showSync ? syncBadge : `<span class="text-[11px] text-slate-400">ID: #${row.id}</span>`}
                            ${showPengambil && isSent ? `<span class="text-[11px] text-slate-500 font-medium ml-1">Penerima: ${pengambilBadge}</span>` : ''}
                        </div>
                        <div class="flex items-center gap-1.5">
                            <button onclick="toggleArsip(${row.id})" title="${isArsip ? 'Batalkan status ARSIP' : 'Arsipkan Berkas'}" class="px-2 py-1 ${isArsip ? 'text-purple-800 bg-purple-100 border-purple-300 font-semibold' : 'text-slate-600 bg-white border-slate-200 font-medium'} border rounded-lg hover:bg-purple-50 flex items-center gap-1 text-[11px] transition">
                                <i data-lucide="archive" class="w-3 h-3 ${isArsip ? 'text-purple-700' : 'text-slate-500'}"></i>
                                <span>${isArsip ? 'ARSIP' : 'Arsipkan'}</span>
                            </button>
                            <button onclick="openModalEdit(${row.id})" class="px-2.5 py-1 text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 flex items-center gap-1 text-[11px] font-medium transition">
                                <i data-lucide="edit-3" class="w-3 h-3 text-slate-500"></i>
                                <span>Edit</span>
                            </button>
                            <button onclick="openModalHapus(${row.id})" class="px-2.5 py-1 text-rose-600 bg-white border border-rose-200 rounded-lg hover:bg-rose-50 flex items-center gap-1 text-[11px] font-medium transition">
                                <i data-lucide="trash-2" class="w-3 h-3 text-rose-500"></i>
                                <span>Hapus</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        mobileContainer.appendChild(card);

        // B. Baris Tabel Desktop: Blok Biru untuk KTP, Merah untuk KIA dengan Aksen Border-Left Tegas & Teduh
        const desktopRowTheme = isKIA
            ? "bg-rose-50/30 hover:bg-rose-100/50 border-b border-rose-200/60 border-l-4 border-l-rose-500"
            : "bg-blue-50/25 hover:bg-blue-100/40 border-b border-blue-200/60 border-l-4 border-l-blue-500";
        const tr = document.createElement("tr");
        tr.className = `${desktopRowTheme} transition group/row`;
        tr.innerHTML = `
            <td class="py-3 px-3 text-center text-slate-400 font-mono font-medium whitespace-nowrap text-xs">${idx + 1}</td>
            <td class="py-3 px-3 whitespace-nowrap overflow-hidden">
                <div class="flex items-center gap-1.5" title="Arahkan mouse untuk membuka NIK lengkap / Klik salin NIK">
                    <span class="font-mono text-slate-800 font-semibold text-xs tracking-wider group-hover/row:hidden">${maskedNik}</span>
                    <span class="font-mono text-blue-700 font-bold text-xs tracking-wider hidden group-hover/row:inline-block bg-white px-1.5 py-0.5 rounded border border-blue-200 select-all cursor-pointer transition" onclick="copyToClipboard('${safeNik}', event)" title="Klik untuk salin NIK: ${safeNik}">${row.nik_decrypted}</span>
                    <button type="button" onclick="copyToClipboard('${safeNik}', event)" title="Salin NIK" class="opacity-0 group-hover/row:opacity-100 p-0.5 text-blue-600 hover:text-blue-800 rounded transition active:scale-90">
                        <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                    </button>
                </div>
                <div class="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5 flex-wrap">
                    <span>Lahir: <span class="font-medium text-slate-700">${row.kelahiran || "-"}</span></span>
                    ${isLansia ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">Lansia (${age} Thn)</span>` : (age ? `<span class="text-slate-400 font-normal">(${age} Thn)</span>` : '')}
                </div>
            </td>
            <td class="py-3 px-3 font-semibold text-slate-900 text-xs sm:text-sm truncate" title="${row.nama_decrypted}">
                <span class="cursor-pointer hover:text-blue-600 hover:underline transition" onclick="copyToClipboard('${safeNama}', event)" title="Klik untuk salin Nama: ${safeNama}">${row.nama_decrypted}</span>
            </td>
            <td class="py-3 px-3 text-xs overflow-hidden">
                <div class="font-normal text-slate-700 uppercase truncate" title="${(row.alamat_decrypted || '-').toUpperCase()}">${(row.alamat_decrypted || "-").toUpperCase()}</div>
                <div class="mt-1">${rwBadge}</div>
            </td>
            <td class="py-3 px-3 whitespace-nowrap overflow-hidden">
                <div class="flex flex-col items-start gap-1">
                    ${ketBadge}
                    ${arsipPill}
                </div>
            </td>
            <td class="py-3 px-3 overflow-hidden">
                <div class="flex items-center gap-1.5 flex-nowrap">
                    <div>${statusBadge}</div>
                    ${syncBtn}
                </div>
                <div class="text-[11px] text-slate-500 font-medium mt-1">Tgl Datang: ${fmtTglDatang}</div>
            </td>
            ${showPengambil ? `<td class="py-3 px-3 overflow-hidden">${pengambilBadge}</td>` : ''}
            <td class="py-3 px-3 overflow-hidden">
                <div class="grid grid-cols-2 gap-1">
                    <button onclick="openModalPengambilan(${row.id})" title="${isSent ? 'Ubah Pengambilan' : 'Serahkan Berkas'}" class="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white px-1.5 py-1.5 rounded-lg text-[11px] font-bold shadow-xs flex items-center justify-center gap-1 transition">
                        <i data-lucide="${isSent ? 'check-circle' : 'user-check'}" class="w-3.5 h-3.5 shrink-0"></i>
                        <span>${isSent ? "Ubah" : "Serahkan"}</span>
                    </button>
                    <button onclick="openModalEdit(${row.id})" title="Edit Data Berkas" class="bg-white hover:bg-amber-50 text-slate-600 hover:text-amber-700 border border-slate-200 hover:border-amber-300 px-1.5 py-1.5 rounded-lg text-[11px] font-bold shadow-2xs flex items-center justify-center gap-1 transition active:scale-95">
                        <i data-lucide="edit-3" class="w-3.5 h-3.5 shrink-0"></i>
                        <span>Edit</span>
                    </button>
                    <button onclick="openModalHapus(${row.id})" title="Hapus Berkas" class="bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 hover:border-rose-300 px-1.5 py-1.5 rounded-lg text-[11px] font-bold shadow-2xs flex items-center justify-center gap-1 transition active:scale-95">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5 shrink-0"></i>
                        <span>Hapus</span>
                    </button>
                    <button onclick="toggleArsip(${row.id})" title="${isArsip ? 'Batalkan status ARSIP' : 'Arsipkan Berkas (kecualikan dari cetak RW)'}" class="${isArsip ? 'bg-purple-600 hover:bg-purple-700 text-white font-bold' : 'bg-white hover:bg-purple-50 text-slate-600 hover:text-purple-700 border border-slate-200 hover:border-purple-300 font-bold'} px-1.5 py-1.5 rounded-lg text-[11px] shadow-2xs flex items-center justify-center gap-1 transition active:scale-95">
                        <i data-lucide="archive" class="w-3.5 h-3.5 shrink-0"></i>
                        <span>${isArsip ? "ARSIP" : "Arsip"}</span>
                    </button>
                </div>
            </td>
        `;
        desktopContainer.appendChild(tr);
    });

    lucide.createIcons();
}
