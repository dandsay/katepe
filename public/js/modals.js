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

    if (!confirm(`Yakin ingin membatalkan pengambilan berkas atas nama "${item.nama_decrypted}"?\nBerkas akan dikembalikan ke status Tersedia / Belum Diambil.`)) {
        return;
    }

    const btn = document.getElementById("btnBatalAmbil");
    if (btn) {
        btn.disabled = true;
        btn.innerText = "Membatalkan...";
    }

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
            alert(data.error || "Gagal membatalkan pengambilan!");
        }
    } catch (err) {
        console.error("Gagal batal ambil:", err);
        alert("Terjadi kesalahan sistem saat membatalkan!");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i data-lucide="undo-2" class="w-4 h-4 text-rose-600"></i><span>Batalkan Pengambilan (Kembalikan ke Tersedia)</span>`;
            lucide.createIcons();
        }
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
        alert(`Jaring Pengaman Administrasi:\nTanggal diambil (${tglAmbil}) tidak boleh lebih awal dari tanggal berkas datang (${tglDatangRef})!`);
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
            alert(data.error || "Gagal menyimpan!");
        }
    } catch (err) {
        console.error("Gagal submit ambil:", err);
        alert("Terjadi kesalahan sistem!");
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
            alert(data.error || "Gagal menghapus berkas!");
        }
    } catch (err) {
        console.error("Gagal hapus berkas:", err);
        alert("Terjadi kesalahan sistem saat menghapus!");
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
        alert("Semua kolom (Jenis Berkas, Tanggal Datang, NIK, Nama Pemilik, Alamat, dan RW) wajib diisi tanpa terkecuali!");
        return;
    }

    const nikInfo = NIKHelper.parse(nik, jenis);
    if (!nikInfo.isValid) {
        alert(nikInfo.error);
        return;
    }

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
                sinkronisasi: "BELUM"
            };

            // Masukkan data baru ke paling depan allData & simpan cache
            allData.unshift(newRow);
            if (typeof AppCache !== "undefined") {
                AppCache.set(AppCache.getKey(), allData);
            }
            applyClientFilters(false);
            loadDatabaseStats(true);
            showToast("Berkas berhasil ditambahkan!", "success");
        } else {
            alert(data.error || "Gagal menambah berkas!");
        }
    } catch (err) {
        console.error("Gagal submit berkas:", err);
        alert("Terjadi kesalahan enkripsi atau koneksi!");
    } finally {
        btn.disabled = false;
        btn.innerText = "Simpan Berkas";
    }
}

// ==========================================
// 4. MODAL EDIT BERKAS (KOREKSI DATA / TYPO)
// ==========================================
function openModalEdit(id) {
    const item = allData.find(d => d.id === id);
    if (!item) return;

    document.getElementById("editDataId").value = item.id;
    document.getElementById("editJenis").value = item.jenis_berkas || activeJenis || "KTP";
    document.getElementById("editTglDatang").value = item.tgl_datang ? item.tgl_datang.split("T")[0] : "";
    document.getElementById("editNIK").value = item.nik_decrypted || "";
    document.getElementById("editNama").value = (item.nama_decrypted || "").toUpperCase();
    document.getElementById("editAlamat").value = (item.alamat_decrypted || "").toUpperCase();
    document.getElementById("editRW").value = item.rw || "001";

    onEditNIKChange();
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
        alert("Data berkas tidak ditemukan!");
        return;
    }

    if (!jenis || !tglDatang || !nik || !nama || !alamat || !rw) {
        alert("Semua kolom (Jenis Berkas, Tanggal Datang, NIK, Nama Pemilik, Alamat, dan RW) wajib diisi tanpa terkecuali!");
        return;
    }

    // Jaring Pengaman Administrasi: Tanggal datang tidak boleh lebih baru dari tanggal diambil jika berkas sudah diambil
    const tglAmbilRef = item.tgl_ambil ? item.tgl_ambil.split("T")[0] : "";
    if (tglAmbilRef && tglDatang > tglAmbilRef) {
        alert(`Jaring Pengaman Administrasi:\nTanggal berkas datang (${tglDatang}) tidak boleh lebih baru dari tanggal berkas yang sudah diambil (${tglAmbilRef})!`);
        return;
    }

    const nikInfo = NIKHelper.parse(nik, jenis);
    if (!nikInfo.isValid) {
        alert(nikInfo.error);
        return;
    }

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
            alert(data.error || "Gagal memperbarui data berkas!");
        }
    } catch (err) {
        console.error("Gagal edit berkas:", err);
        alert("Terjadi kesalahan enkripsi atau koneksi!");
    } finally {
        btn.disabled = false;
        btn.innerText = "Simpan Perubahan";
    }
}
