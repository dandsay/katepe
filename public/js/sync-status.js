/**
 * Modul Sinkronisasi Status Berkas Fisik vs Digital
 * Membantu petugas memverifikasi dan mencocokkan fisik kartu E-KTP/KIA di kantor dengan data digital
 */

// Toggle Status Sinkronisasi Berkas Fisik (SYNC <-> BELUM)
async function toggleSync(id, currentStatus) {
    const newStatus = currentStatus === "SYNC" ? "BELUM" : "SYNC";
    try {
        const res = await fetch(`/api/berkas/${id}`, {
            method: "PUT",
            headers: getAuthHeaders({
                "Content-Type": "application/json"
            }),
            body: JSON.stringify({ sinkronisasi: newStatus })
        });

        const data = await res.json();
        if (data.success) {
            const item = allData.find(d => d.id === id);
            if (item) item.sinkronisasi = newStatus;
            if (typeof AppCache !== "undefined") {
                AppCache.set(AppCache.getKey(), allData);
            }
            applyClientFilters(false);
        } else {
            alert(data.error || "Gagal memperbarui status pencocokan fisik!");
        }
    } catch (err) {
        console.error("Gagal update status fisik:", err);
    }
}

// Reset Semua Status Pencocokan Berkas Fisik menjadi BELUM
async function unsyncAll() {
    const jenisLabel = activeJenis === "KTP" ? "E-KTP" : "KIA";
    const btn = document.getElementById("btnUnsyncAll");
    if (!confirm(`Reset status pencocokan semua berkas fisik ${jenisLabel} menjadi BELUM?`)) {
        return;
    }

    const originalHtml = btn ? btn.innerHTML : "";
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<div class="spinner border-white border-l-transparent w-3 h-3"></div> <span>Mereset...</span>`;
    }

    try {
        const res = await fetch(`/api/berkas/unsync-all?jenis=${activeJenis}`, {
            method: "POST",
            headers: getAuthHeaders()
        });

        const data = await res.json();
        if (data.success) {
            alert(`Berhasil mereset status pencocokan fisik seluruh berkas ${jenisLabel} menjadi BELUM.`);
            allData.forEach(d => {
                if (d.jenis_berkas === activeJenis) d.sinkronisasi = "BELUM";
            });
            if (typeof AppCache !== "undefined") {
                AppCache.set(AppCache.getKey(), allData);
            }
            applyClientFilters(false);
        } else {
            alert(data.error || "Gagal melakukan reset status!");
        }
    } catch (err) {
        console.error("Gagal unsync all:", err);
        alert("Terjadi kesalahan sistem saat melakukan reset status!");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
        if (window.lucide) lucide.createIcons();
    }
}

// Toggle Status ARSIP Berkas (Kecualikan dari Cetak Laporan RW)
async function toggleArsip(id) {
    const item = allData.find(d => d.id === id);
    if (!item) return;

    const isCurrentlyArsip = (item.hubungan_pengambil === "ARSIP");

    // Bekukan (Lock) arsip untuk berkas yang SUDAH diserahterimakan:
    // berkas yang sudah diterima warga tidak boleh diarsipkan karena
    // akan menimpa data penerima & tanggal diterima.
    if (!isCurrentlyArsip && item.tgl_ambil && String(item.tgl_ambil).trim() !== "") {
        showToast("Berkas sudah diserahterimakan — tidak dapat diarsipkan.", "error");
        return;
    }

    if (isCurrentlyArsip) {
        if (!confirm(`Batalkan status ARSIP untuk berkas "${item.nama_decrypted}"?\nBerkas akan dikembalikan ke status Tersedia.`)) {
            return;
        }

        const parsed = NIKHelper.parse(item.nik_decrypted, item.jenis_berkas);
        const revertStatus = (parsed.isValid && parsed.isUnderage) ? "TAHAN (BELUM 17 TH)" : "TERSEDIA";

        try {
            const res = await fetch(`/api/berkas/${id}`, {
                method: "PUT",
                headers: getAuthHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({
                    hubungan_pengambil: "Belum Diketahui",
                    tgl_ambil: null,
                    status: revertStatus
                })
            });

            const data = await res.json();
            if (data.success) {
                item.hubungan_pengambil = "Belum Diketahui";
                item.tgl_ambil = null;
                item.status = revertStatus;

                const targetYear = typeof activeYear !== "undefined" ? activeYear : new Date().getFullYear().toString();
                if (typeof AppCache !== "undefined") {
                    AppCache.set(AppCache.getKey(targetYear), allData);
                }
                applyClientFilters(false);
                updateStatsFromClient(allData);
                showToast("Status ARSIP berhasil dibatalkan!", "success");
            } else {
                alert(data.error || "Gagal membatalkan status ARSIP!");
            }
        } catch (err) {
            console.error("Gagal batal arsip:", err);
            alert("Terjadi kesalahan saat membatalkan status ARSIP!");
        }
    } else {
        if (!confirm(`Tandai berkas "${item.nama_decrypted}" sebagai ARSIP?\n(Berkas akan berstatus SELESAI dan otomatis DIKECUALIKAN dari cetak Laporan RW)`)) {
            return;
        }

        const today = new Date().toISOString().split("T")[0];
        let tglAmbilArsip = item.tgl_ambil || today;
        if (item.tgl_datang && tglAmbilArsip < item.tgl_datang.split("T")[0]) {
            tglAmbilArsip = item.tgl_datang.split("T")[0];
        }

        try {
            const res = await fetch(`/api/berkas/${id}`, {
                method: "PUT",
                headers: getAuthHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({
                    hubungan_pengambil: "ARSIP",
                    tgl_ambil: tglAmbilArsip,
                    status: "SELESAI"
                })
            });

            const data = await res.json();
            if (data.success) {
                item.hubungan_pengambil = "ARSIP";
                item.tgl_ambil = tglAmbilArsip;
                item.status = "SELESAI";

                const targetYear = typeof activeYear !== "undefined" ? activeYear : new Date().getFullYear().toString();
                if (typeof AppCache !== "undefined") {
                    AppCache.set(AppCache.getKey(targetYear), allData);
                }
                applyClientFilters(false);
                updateStatsFromClient(allData);
                showToast("Berkas berhasil ditandai sebagai ARSIP!", "success");
            } else {
                alert(data.error || "Gagal menandai sebagai ARSIP!");
            }
        } catch (err) {
            console.error("Gagal tandai arsip:", err);
            alert("Terjadi kesalahan saat menandai sebagai ARSIP!");
        }
    }
}

