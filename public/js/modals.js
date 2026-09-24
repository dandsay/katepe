/**
 * Modul Dialog Modal Interaktif
 * Menangani alur modal Penyerahan/Pengambilan, Edit Berkas, Tambah Berkas, dan Hapus Berkas
 */

// ==========================================
// 1. MODAL PENGAMBILAN / PENYERAHAN BERKAS
// ==========================================
function openModalPengambilan(id) {
    const item = allData.find(d => d.id === id);
    if (!item) return;
    bersihkanErrorForm("formPengambilan");

    document.getElementById("editBerkasId").value = item.id;
    document.getElementById("modalNamaPemilik").innerText = item.nama_decrypted;
    document.getElementById("modalNikDanRw").innerText = `NIK: ${NIKHelper.maskNIK(item.nik_decrypted)} | RW ${item.rw}`;
    
    // Default hubungan pengambil
    const sel = document.getElementById("modalHubungan");
    sel.value = item.hubungan_pengambil && item.hubungan_pengambil !== "Belum Diketahui" 
        ? item.hubungan_pengambil 
        : "Yang Bersangkutan";

    // Default tanggal ambil (jika belum ada, gunakan hari ini)
    const today = new Date().toISOString().split("T")[0];
    const inputTglAmbil = document.getElementById("modalTglAmbil");
    inputTglAmbil.value = item.tgl_ambil ? item.tgl_ambil.split("T")[0] : today;
    if (item.tgl_datang) {
        inputTglAmbil.min = item.tgl_datang.split("T")[0];
    } else {
        inputTglAmbil.removeAttribute("min");
    }

    // Tampilkan tombol Batalkan Pengambilan hanya jika berkas sudah berstatus diambil
    const wrapBatal = document.getElementById("wrapperBatalAmbil");
    if (wrapBatal) {
        if (item.tgl_ambil && item.tgl_ambil.trim() !== "") {
            wrapBatal.classList.remove("hidden");
        } else {
            wrapBatal.classList.add("hidden");
        }
    }

    document.getElementById("modalPengambilan").classList.remove("hidden");
    lucide.createIcons();
}

function closeModalPengambilan() {
    document.getElementById("modalPengambilan").classList.add("hidden");
}

// Eksekusi Pembatalan Pengambilan (Reset ke Tersedia)
async function executeBatalPengambilan() {
    const id = document.getElementById("editBerkasId").value;
    const item = allData.find(d => d.id === parseInt(id, 10));
    if (!item) return;

    openModalKonfirmasi({
        judul: "Batalkan Pengambilan?",
        subjudul: "Aksi ini akan mengubah status berkas.",
        isi: `<div class="font-bold text-slate-800">${item.nama_decrypted}</div>
              <div class="text-xs text-slate-500">Berkas akan dikembalikan ke status <b>Tersedia / Belum Diambil</b>.</div>`,
        labelYa: "Ya, Batalkan",
        warna: "amber",
        onYa: async () => {
            const btn = document.getElementById("btnBatalAmbil");
            if (btn) {
                btn.disabled = true;
                btn.innerText = "Membatalkan...";
            }
            await batalPengambilanAPI(id, item);
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<i data-lucide="undo-2" class="w-4 h-4 text-rose-600"></i><span>Batalkan Pengambilan (Kembalikan ke Tersedia)</span>`;
                lucide.createIcons();
            }
        }
    });
}

async function batalPengambilanAPI(id, item) {
    const btn = document.getElementById("btnBatalAmbil");

    try {
        const parsed = NIKHelper.parse(item.nik_decrypted, item.jenis_berkas);
        const revertStatus = (parsed.isValid && parsed.isUnderage) ? "TAHAN (BELUM 17 TH)" : "TERSEDIA";

        const res = await fetch(`/api/berkas/${id}`, {
            method: "PUT",
            headers: getAuthHeaders({
                "Content-Type": "application/json"
            }),
            body: JSON.stringify({
                hubungan_pengambil: "Belum Diketahui",
                tgl_ambil: null,
                status: revertStatus,
                sinkronisasi: "BELUM"
            })
        });

        const data = await res.json();
        if (data.success) {
            closeModalPengambilan();
            const item = allData.find(d => String(d.id) === String(id));
            if (item) {
                item.hubungan_pengambil = "Belum Diketahui";
                item.tgl_ambil = null;
                item.status = revertStatus;
                item.sinkronisasi = "BELUM";
            }
            if (typeof AppCache !== "undefined") {
                AppCache.set(AppCache.getKey(), allData);
            }
            applyClientFilters(false);
            loadDatabaseStats(true);
            showToast("Pengambilan berkas berhasil dibatalkan!", "success");
        } else {
            showToast(data.error || "Gagal membatalkan pengambilan!", "error");
        }
    } catch (err) {
        console.error("Gagal batal ambil:", err);
        showToast("Terjadi kesalahan sistem saat membatalkan!", "error");
    }
}

async function submitPengambilan(e) {
    e.preventDefault();
    const id = document.getElementById("editBerkasId").value;
    const hubungan = document.getElementById("modalHubungan").value;
    const tglAmbil = document.getElementById("modalTglAmbil").value;
    const btn = document.getElementById("btnSimpanAmbil");

    const item = allData.find(d => String(d.id) === String(id));
    const tglDatangRef = item?.tgl_datang ? item.tgl_datang.split("T")[0] : "";
    if (tglDatangRef && tglAmbil && tglAmbil < tglDatangRef) {
        tampilkanErrorForm("formPengambilan", `Tanggal diambil (${tglAmbil}) tidak boleh lebih awal dari tanggal berkas datang (${tglDatangRef})!`);
        return;
    }

    btn.disabled = true;
    btn.innerText = "Menyimpan...";

    try {
        const res = await fetch(`/api/berkas/${id}`, {
            method: "PUT",
            headers: getAuthHeaders({
                "Content-Type": "application/json"
            }),
            body: JSON.stringify({
                hubungan_pengambil: hubungan,
                tgl_ambil: tglAmbil,
                status: "SELESAI"
            })
        });

        const data = await res.json();
        if (data.success) {
            closeModalPengambilan();
            const item = allData.find(d => String(d.id) === String(id));
            if (item) {
                item.hubungan_pengambil = hubungan;
                item.tgl_ambil = tglAmbil;
                item.status = "SELESAI";
            }
            if (typeof AppCache !== "undefined") {
                AppCache.set(AppCache.getKey(), allData);
            }
            applyClientFilters(false);
            loadDatabaseStats(true);
            showToast("Data pengambilan berhasil disimpan!", "success");
        } else {
            showToast(data.error || "Gagal menyimpan!", "error");
        }
    } catch (err) {
        console.error("Gagal submit ambil:", err);
        showToast("Terjadi kesalahan sistem!", "error");
    } finally {
        btn.disabled = false;
        btn.innerText = "Simpan";
    }
}

// ==========================================
// 2. MODAL HAPUS BERKAS (KONFIRMASI NIK)
// ==========================================
var currentTargetDelete = null;

function openModalHapus(id) {
    const item = allData.find(d => d.id === id);
    if (!item) return;

    currentTargetDelete = item;
    document.getElementById("hapusId").value = item.id;
    document.getElementById("hapusNama").innerText = item.nama_decrypted;
    
    // Petunjuk 4 digit NIK terakhir untuk memandu petugas
    const cleanNik = String(item.nik_decrypted || "").trim();
    document.getElementById("targetNikHint").innerText = `Petunjuk: NIK berakhiran ...${cleanNik.slice(-4)}`;

    document.getElementById("konfirmasiNikInput").value = "";
    document.getElementById("hapusError").classList.add("hidden");
    document.getElementById("modalHapus").classList.remove("hidden");
    lucide.createIcons();
}

function closeModalHapus() {
    document.getElementById("modalHapus").classList.add("hidden");
    currentTargetDelete = null;
}

async function executeHapusBerkas() {
    if (!currentTargetDelete) return;

    const inputNik = document.getElementById("konfirmasiNikInput").value.trim();
    const errEl = document.getElementById("hapusError");
    const targetNik = String(currentTargetDelete.nik_decrypted || "").trim();

    if (inputNik !== targetNik) {
        errEl.innerText = "NIK tidak cocok! Ketik 16 digit NIK pemilik berkas.";
        errEl.classList.remove("hidden");
        return;
    }

    errEl.classList.add("hidden");
    const btn = document.getElementById("btnConfirmDelete");
    btn.disabled = true;
    btn.innerText = "Menghapus...";

    try {
        const res = await fetch(`/api/berkas/${currentTargetDelete.id}`, {
            method: "DELETE",
            headers: getAuthHeaders()
        });

        const data = await res.json();
        if (data.success) {
            closeModalHapus();
            allData = allData.filter(d => d.id !== currentTargetDelete.id);
            if (typeof AppCache !== "undefined") {
                AppCache.set(AppCache.getKey(), allData);
            }
            applyClientFilters(false);
            loadDatabaseStats(true);
            showToast("Berkas berhasil dihapus", "success");
        } else {
            showToast(data.error || "Gagal menghapus berkas!", "error");
        }
    } catch (err) {
        console.error("Gagal hapus berkas:", err);
        showToast("Terjadi kesalahan sistem saat menghapus!", "error");
    } finally {
        btn.disabled = false;
        btn.innerText = "Hapus";
    }
}

// ==========================================
// 3. MODAL TAMBAH BERKAS BARU
// ==========================================
function openModalTambah() {
    document.getElementById("formTambah").reset();
    document.getElementById("inputTglDatang").value = new Date().toISOString().split("T")[0];
    document.getElementById("nikPreviewBox").classList.add("hidden");
    bersihkanErrorForm("formTambah");
    document.getElementById("modalTambah").classList.remove("hidden");
    lucide.createIcons();
}

function closeModalTambah() {
    document.getElementById("modalTambah").classList.add("hidden");
}

function onNIKInputChange() {
    const nik = document.getElementById("inputNIK").value.trim();
    const jenis = document.getElementById("inputJenis").value;
    const previewBox = document.getElementById("nikPreviewBox");

    if (nik.length === 16) {
        const info = NIKHelper.parse(nik, jenis);
        if (info.isValid) {
            let statusText = info.isUnderage 
                ? `<span class="text-amber-700 font-bold">⚠️ TAHAN (Belum 17 Tahun) - Ultah ke-17: ${info.formatted17th}</span>`
                : `<span class="text-emerald-700 font-bold">✅ Berkas Bisa Diberikan (Umur: ${info.age} Thn)</span>`;

            previewBox.innerHTML = `
                <div>Kelahiran: <b>${info.formattedBirth}</b> &bull; Umur: <b>${info.age} thn</b></div>
                <div>Kategori: <b>${info.keterangan}</b></div>
                <div>${statusText}</div>
            `;
            previewBox.classList.remove("hidden");
            return;
        }
    }
    previewBox.classList.add("hidden");
}

async function submitTambahBerkas(e) {
    e.preventDefault();
    const jenis = document.getElementById("inputJenis").value;
    const tglDatang = document.getElementById("inputTglDatang").value;
    const nik = document.getElementById("inputNIK").value.trim();
    const nama = document.getElementById("inputNama").value.trim().toUpperCase();
    const alamat = document.getElementById("inputAlamat").value.trim().toUpperCase();
    const rw = document.getElementById("inputRW").value;
    const btn = document.getElementById("btnSimpanTambah");

    if (!jenis || !tglDatang || !nik || !nama || !alamat || !rw) {
        tampilkanErrorForm("formTambah", "Semua kolom (Jenis Berkas, Tanggal Datang, NIK, Nama Pemilik, Alamat, dan RW) wajib diisi tanpa terkecuali!");
        return;
    }

    const nikInfo = NIKHelper.parse(nik, jenis);
    if (!nikInfo.isValid) {
        tampilkanErrorForm("formTambah", nikInfo.error);
        return;
    }

    bersihkanErrorForm("formTambah");

    btn.disabled = true;
    btn.innerText = "Mengenkripsi & Menyimpan...";

    try {
        // Enkripsi Data Sensitif (Client-Side Zero-Knowledge)
        const nikEncrypted = await AppCrypto.encrypt(nik, appKey);
        const namaEncrypted = await AppCrypto.encrypt(nama, appKey);
        const alamatEncrypted = await AppCrypto.encrypt(alamat, appKey);
        const nikHash = await AppCrypto.hashNIK(nik);

        const status = NIKHelper.computeStatus(null, tglDatang, nikInfo);

        const payload = {
            tgl_datang: tglDatang,
            jenis_berkas: jenis,
            nik_hash: nikHash,
            nik_encrypted: nikEncrypted,
            nama_encrypted: namaEncrypted,
            alamat_encrypted: alamatEncrypted,
            rw: rw,
            hubungan_pengambil: "Belum Diketahui",
            tgl_ambil: null,
            status: status,
            kelahiran: nikInfo.formattedBirth,
            keterangan: nikInfo.keterangan,
            sinkronisasi: "BELUM"
        };

        const res = await fetch("/api/berkas", {
            method: "POST",
            headers: getAuthHeaders({
                "Content-Type": "application/json"
            }),
            body: JSON.stringify(payload)
        });

        // Opsi A: 409 = berkas aktif dengan NIK & jenis sama sudah ada.
        // Tampilkan modal peringatan; simpan payload untuk mode "Tetap Input Baru".
        if (res.status === 409) {
            const conflict = await res.json();
            showDuplikatModal(conflict, payload, {
                nama: nama,
                nik: nik,
                jenis: jenis
            });
            return;
        }

        const data = await res.json();
        if (data.success) {
            closeModalTambah();
            const newRow = {
                id: data.id,
                no_urut: null,
                tgl_datang: tglDatang,
                jenis_berkas: jenis,
                nik_hash: nikHash,
                nik_encrypted: nikEncrypted,
                nama_encrypted: namaEncrypted,
                alamat_encrypted: alamatEncrypted,
                nama_decrypted: (nama || "").toUpperCase(),
                nik_decrypted: nik,
                alamat_decrypted: (alamat || "").toUpperCase(),
                rw: rw,
                hubungan_pengambil: "Belum Diketahui",
                tgl_ambil: null,
                status: status,
                kelahiran: nikInfo.formattedBirth,
                keterangan: nikInfo.keterangan,
                sinkronisasi: "BELUM",
                catatan_admin: ""
            };

            // Masukkan data baru ke paling depan allData & simpan cache
            allData.unshift(newRow);
            if (typeof AppCache !== "undefined") {
                AppCache.set(AppCache.getKey(), allData);
            }

            // Berkas lama yang diberi flag oleh server -> perbarui tampilan lokal
            if (data.flagged_old > 0) {
                allData.forEach(d => {
                    if (d.nik_hash === nikHash && d.jenis_berkas === jenis && d.id !== data.id &&
                        (!d.tgl_ambil || d.tgl_ambil === "") && d.hubungan_pengambil !== "ARSIP") {
                        d.catatan_admin = "BELUM DILAPORKAN: KEMUNGKINAN SUDAH DIAMBIL";
                    }
                });
            }

            applyClientFilters(false);
            loadDatabaseStats(true);
            showToast("Berkas berhasil ditambahkan!", "success");
        } else {
            showToast(data.error || "Gagal menambah berkas!", "error");
        }
    } catch (err) {
        console.error("Gagal submit berkas:", err);
        showToast("Terjadi kesalahan enkripsi atau koneksi!", "error");
    } finally {
        btn.disabled = false;
        btn.innerText = "Simpan Berkas";
    }
}

// ==========================================
// 3.1 MODAL PERINGATAN DUPLIKAT AKTIF (Opsi A)
// ==========================================
let duplikatContext = null; // { payload, info, existingIds }

function showDuplikatModal(conflict, payload, info) {
    duplikatContext = {
        payload,
        info,
        existingIds: (conflict.existing || []).map(r => r.id)
    };
    const listEl = document.getElementById("duplikatList");
    if (listEl) {
        listEl.innerHTML = (conflict.existing || []).map(row => {
            const tgl = formatDate ? formatDate(row.tgl_datang) : row.tgl_datang;
            return `
            <div class="flex items-center justify-between gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs">
                <div class="min-w-0">
                    <div class="font-bold text-slate-800 truncate">${info.nama}</div>
                    <div class="text-slate-500 font-medium">Tgl Datang: ${tgl} &bull; ${row.keterangan || "-"}</div>
                </div>
                <span class="shrink-0 px-2 py-0.5 rounded-md text-[11px] font-bold bg-white border border-amber-300 text-amber-700">${row.status || "-"}</span>
            </div>`;
        }).join("");
    }
    document.getElementById("modalTambah").classList.add("hidden");
    document.getElementById("modalDuplikat").classList.remove("hidden");
    lucide.createIcons();
}

// Tombol "Batal, Saya Cek Dulu": tutup modal, tempel NIK berkas lama ke
// kolom pencarian agar tabel hanya menampilkan data NIK tersebut,
// lalu highlight kedip barisnya.
function batalCekDulu() {
    if (!duplikatContext) {
        document.getElementById("modalDuplikat").classList.add("hidden");
        return;
    }
    const { existingIds } = duplikatContext;
    const targetId = existingIds && existingIds.length > 0 ? existingIds[0] : null;

    // Tutup seluruh modal agar tabel terlihat penuh
    document.getElementById("modalDuplikat").classList.add("hidden");
    document.getElementById("modalTambah").classList.add("hidden");
    duplikatContext = null;

    if (targetId) {
        focusBerkasLama(targetId);
    }
}

// Tampilkan tabel berfokus pada berkas tertentu: NIK ditempel ke kolom pencarian
// (mode pencarian universal menampilkan semua berkas NIK itu), lalu lompat ke
// halamannya dan beri highlight kedip.
function focusBerkasLama(id) {
    // Ambil NIK terdekripsi dari data yang sudah dimuat
    const target = allData.find(d => d.id === id);
    const nik = target ? (target.nik_decrypted || "") : "";

    const searchInput = document.getElementById("searchInput");
    if (searchInput && nik) {
        searchInput.value = nik;
    } else if (searchInput) {
        searchInput.value = "";
    }

    applyClientFilters(true);

    // Lompat ke halaman yang memuat baris tersebut
    const idx = filteredData.findIndex(d => d.id === id);
    if (idx >= 0) {
        const page = Math.floor(idx / pageSize) + 1;
        if (page !== currentPage) {
            changePage(page);
        } else {
            renderUI();
        }
    } else {
        renderUI();
    }

    // Highlight kedip setelah render selesai
    setTimeout(() => flashBerkasRow(id), 180);
}

function flashBerkasRow(id) {
    const card = document.getElementById("mobile-card-" + id);
    const rowEl = document.getElementById("berkas-row-" + id);
    [card, rowEl].forEach(el => {
        if (!el) return;
        el.classList.add("dup-flash");
        setTimeout(() => el.classList.remove("dup-flash"), 4200);
    });
    const target = card || rowEl;
    if (target && target.scrollIntoView) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
}

function closeModalDuplikat() {
    document.getElementById("modalDuplikat").classList.add("hidden");
    duplikatContext = null;
    // Kembalikan fokus ke form tambah agar staf bisa memeriksa/koreksi input
    document.getElementById("modalTambah").classList.remove("hidden");
}

async function executeForceNew() {
    if (!duplikatContext) return;
    const { payload } = duplikatContext;
    const btn = document.getElementById("btnForceNew");
    btn.disabled = true;
    btn.innerText = "Menyimpan...";

    try {
        const res = await fetch("/api/berkas", {
            method: "POST",
            headers: getAuthHeaders({
                "Content-Type": "application/json"
            }),
            body: JSON.stringify({ ...payload, force_new: true })
        });
        const data = await res.json();

        if (data.success) {
            // Tutup modal duplikat DAN modal tambah
            document.getElementById("modalDuplikat").classList.add("hidden");
            duplikatContext = null;
            closeModalTambah();

            const p = payload;
            const newRow = {
                id: data.id,
                no_urut: null,
                tgl_datang: p.tgl_datang,
                jenis_berkas: p.jenis_berkas,
                nik_hash: p.nik_hash,
                nik_encrypted: p.nik_encrypted,
                nama_encrypted: p.nama_encrypted,
                alamat_encrypted: p.alamat_encrypted,
                nama_decrypted: p.nama_encrypted ? (document.getElementById("inputNama").value.trim().toUpperCase()) : "",
                nik_decrypted: p.nik_hash ? (document.getElementById("inputNIK").value.trim()) : "",
                alamat_decrypted: (document.getElementById("inputAlamat").value.trim().toUpperCase()),
                rw: p.rw,
                hubungan_pengambil: "Belum Diketahui",
                tgl_ambil: null,
                status: p.status,
                kelahiran: p.kelahiran,
                keterangan: p.keterangan,
                sinkronisasi: "BELUM",
                catatan_admin: ""
            };

            allData.unshift(newRow);
            if (typeof AppCache !== "undefined") {
                AppCache.set(AppCache.getKey(), allData);
            }

            // Tandai berkas lama di tampilan lokal (server sudah menandainya di DB)
            if (data.flagged_old > 0) {
                allData.forEach(d => {
                    if (d.nik_hash === p.nik_hash && d.jenis_berkas === p.jenis_berkas && d.id !== data.id &&
                        (!d.tgl_ambil || d.tgl_ambil === "") && d.hubungan_pengambil !== "ARSIP") {
                        d.catatan_admin = "BELUM DILAPORKAN: KEMUNGKINAN SUDAH DIAMBIL";
                    }
                });
                showToast(`${data.flagged_old} berkas lama ditandai "Belum Lapor?"`, "success");
            }

            applyClientFilters(false);
            loadDatabaseStats(true);
            showToast("Berkas baru berhasil ditambahkan!", "success");
        } else {
            showToast(data.error || "Gagal menyimpan berkas baru!", "error");
        }
    } catch (err) {
        console.error("Gagal force new berkas:", err);
        showToast("Terjadi kesalahan koneksi!", "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="flag" class="w-4 h-4"></i><span>Tetap Input Berkas Baru (Tandai Berkas Lama)</span>`;
        lucide.createIcons();
    }
}

// ==========================================
// 4. MODAL EDIT BERKAS (KOREKSI DATA / TYPO)
// ==========================================
function openModalEdit(id) {
    const item = allData.find(d => d.id === id);
    if (!item) return;

    document.getElementById("editDataId").value = item.id;
    document.getElementById("editJenis").value = item.jenis_berkas || ((typeof activeJenis !== "undefined" && activeJenis !== "ARSIP") ? activeJenis : "KTP");
    document.getElementById("editTglDatang").value = item.tgl_datang ? item.tgl_datang.split("T")[0] : "";
    document.getElementById("editNIK").value = item.nik_decrypted || "";
    document.getElementById("editNama").value = (item.nama_decrypted || "").toUpperCase();
    document.getElementById("editAlamat").value = (item.alamat_decrypted || "").toUpperCase();
    document.getElementById("editRW").value = item.rw || "001";

    onEditNIKChange();
    bersihkanErrorForm("formEdit");
    document.getElementById("modalEdit").classList.remove("hidden");
    lucide.createIcons();
}

function closeModalEdit() {
    document.getElementById("modalEdit").classList.add("hidden");
}

function onEditNIKChange() {
    const nik = document.getElementById("editNIK").value.trim();
    const jenis = document.getElementById("editJenis").value;
    const previewBox = document.getElementById("editNikPreviewBox");

    if (nik.length === 16) {
        const info = NIKHelper.parse(nik, jenis);
        if (info.isValid) {
            let statusText = info.isUnderage 
                ? `<span class="text-amber-700 font-bold">⚠️ TAHAN (Belum 17 Tahun) - Ultah ke-17: ${info.formatted17th}</span>`
                : `<span class="text-emerald-700 font-bold">✅ Berkas Bisa Diberikan (Umur: ${info.age} Thn)</span>`;

            previewBox.innerHTML = `
                <div>Kelahiran: <b>${info.formattedBirth}</b> &bull; Umur: <b>${info.age} thn</b></div>
                <div>Kategori: <b>${info.keterangan}</b></div>
                <div>${statusText}</div>
            `;
            previewBox.classList.remove("hidden");
            return;
        }
    }
    previewBox.classList.add("hidden");
}

async function submitEditBerkas(e) {
    e.preventDefault();
    const id = document.getElementById("editDataId").value;
    const jenis = document.getElementById("editJenis").value;
    const tglDatang = document.getElementById("editTglDatang").value;
    const nik = document.getElementById("editNIK").value.trim();
    const nama = document.getElementById("editNama").value.trim().toUpperCase();
    const alamat = document.getElementById("editAlamat").value.trim().toUpperCase();
    const rw = document.getElementById("editRW").value;
    const btn = document.getElementById("btnSimpanEdit");

    const item = allData.find(d => String(d.id) === String(id));
    if (!item) {
        tampilkanErrorForm("formEdit", "Data berkas tidak ditemukan di data aktif — muat ulang halaman.");
        return;
    }

    if (!jenis || !tglDatang || !nik || !nama || !alamat || !rw) {
        tampilkanErrorForm("formEdit", "Semua kolom (Jenis Berkas, Tanggal Datang, NIK, Nama Pemilik, Alamat, dan RW) wajib diisi tanpa terkecuali!");
        return;
    }

    // Jaring Pengaman Administrasi: Tanggal datang tidak boleh lebih baru dari tanggal diambil jika berkas sudah diambil
    const tglAmbilRef = item.tgl_ambil ? item.tgl_ambil.split("T")[0] : "";
    if (tglAmbilRef && tglDatang > tglAmbilRef) {
        tampilkanErrorForm("formEdit", `Jaring Pengaman Administrasi: Tanggal berkas datang (${tglDatang}) tidak boleh lebih baru dari tanggal berkas yang sudah diambil (${tglAmbilRef})!`);
        return;
    }

    const nikInfo = NIKHelper.parse(nik, jenis);
    if (!nikInfo.isValid) {
        tampilkanErrorForm("formEdit", nikInfo.error);
        return;
    }

    bersihkanErrorForm("formEdit");

    btn.disabled = true;
    btn.innerText = "Mengenkripsi & Menyimpan...";

    try {
        // Enkripsi Data Sensitif Baru (Client-Side)
        const nikEncrypted = await AppCrypto.encrypt(nik, appKey);
        const namaEncrypted = await AppCrypto.encrypt(nama, appKey);
        const alamatEncrypted = await AppCrypto.encrypt(alamat, appKey);
        const nikHash = await AppCrypto.hashNIK(nik);

        const status = NIKHelper.computeStatus(item.tgl_ambil, tglDatang, nikInfo);

        const payload = {
            tgl_datang: tglDatang,
            jenis_berkas: jenis,
            nik_hash: nikHash,
            nik_encrypted: nikEncrypted,
            nama_encrypted: namaEncrypted,
            alamat_encrypted: alamatEncrypted,
            rw: rw,
            status: status,
            kelahiran: nikInfo.formattedBirth,
            keterangan: nikInfo.keterangan
        };

        const res = await fetch(`/api/berkas/${id}`, {
            method: "PUT",
            headers: getAuthHeaders({
                "Content-Type": "application/json"
            }),
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (data.success) {
            closeModalEdit();
            const item = allData.find(d => String(d.id) === String(id));
            if (item) {
                item.jenis_berkas = jenis;
                item.tgl_datang = tglDatang;
                item.nik_hash = nikHash;
                item.nik_encrypted = nikEncrypted;
                item.nama_encrypted = namaEncrypted;
                item.alamat_encrypted = alamatEncrypted;
                item.nama_decrypted = (nama || "").toUpperCase();
                item.nik_decrypted = nik;
                item.alamat_decrypted = (alamat || "").toUpperCase();
                item.rw = rw;
                item.status = status;
                item.kelahiran = nikInfo.formattedBirth;
                item.keterangan = nikInfo.keterangan;
            }
            if (typeof AppCache !== "undefined") {
                AppCache.set(AppCache.getKey(), allData);
            }
            applyClientFilters(false);
            loadDatabaseStats(true);
            showToast("Data berkas berhasil diperbarui!", "success");
        } else {
            showToast(data.error || "Gagal memperbarui data berkas!", "error");
        }
    } catch (err) {
        console.error("Gagal edit berkas:", err);
        showToast("Terjadi kesalahan enkripsi atau koneksi!", "error");
    } finally {
        btn.disabled = false;
        btn.innerText = "Simpan Perubahan";
    }
}

// ==========================================
// UTIL: Pesan Error Inline Modal (pengganti alert validasi)
// ==========================================

// Tampilkan pesan validasi form secara INLINE (strip merah) di dalam modal,
// pengganti alert() browser — staf langsung lihat konteksnya.
function tampilkanErrorForm(formId, pesan) {
    const form = document.getElementById(formId);
    if (!form) { showToast(pesan, "error"); return; }
    let el = document.getElementById(formId + "Error");
    if (!el) {
        el = document.createElement("div");
        el.id = formId + "Error";
        el.className = "text-rose-700 bg-rose-50 border border-rose-300 rounded-xl p-3 text-xs font-bold flex items-start gap-2";
        el.innerHTML = `<i data-lucide="alert-triangle" class="w-4 h-4 shrink-0 mt-0.5"></i><span></span>`;
        const tombolRow = form.querySelector(".flex.items-center.gap-3.pt-3");
        if (tombolRow) form.insertBefore(el, tombolRow); else form.appendChild(el);
    }
    el.querySelector("span").innerText = pesan;
    el.classList.remove("hidden");
    lucide.createIcons();
}

// Sembunyikan pesan error form (dipanggil saat modal dibuka/disimpan sukses)
function bersihkanErrorForm(formId) {
    const el = document.getElementById(formId + "Error");
    if (el) el.classList.add("hidden");
}
