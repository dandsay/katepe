/**
 * Modul Sinkronisasi Status Berkas Fisik vs Digital
 * Membantu petugas memverifikasi dan mencocokkan fisik kartu E-KTP/KIA di kantor dengan data digital
 */

// Toggle Status Sinkronisasi Berkas Fisik (SYNC <-> BELUM)
// Eksklusif aktif di filter ARSIP & BELUM (PENDING); di luar itu dimatikan.
async function toggleSync(id, currentStatus) {
    const isArsipJenis = (typeof activeJenis !== "undefined" && activeJenis === "ARSIP");
    const statusFilter = document.getElementById("selectStatus") ? document.getElementById("selectStatus").value : "";
    if (!isArsipJenis && statusFilter !== "PENDING") {
        showToast("Ubah status SYNC/BELUM hanya tersedia di filter ARSIP & BELUM.", "error");
        return;
    }
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
            showToast(data.error || "Gagal memperbarui status pencocokan fisik!", "error");
        }
    } catch (err) {
        console.error("Gagal update status fisik:", err);
    }
}

// Reset Status Pencocokan Berkas Fisik menjadi BELUM
// Hanya untuk berkas yang lolos FILTER YANG SEDANG DIBUKA (jenis KTP/KIA,
// tahun, RW, status, sinkronisasi, pencarian) — bukan seluruh jenis sekaligus.
async function unsyncAll() {
    // Mode ARSIP: reset cek fisik dibekukan (tidak ada konteks jenis KTP/KIA)
    if (typeof activeJenis !== "undefined" && activeJenis === "ARSIP") {
        showToast("Reset Cek Fisik tidak tersedia di mode ARSIP.", "error");
        return;
    }
    const jenisLabel = activeJenis === "KTP" ? "E-KTP" : "KIA";
    const btn = document.getElementById("btnUnsyncAll");

    // Ambil tepat baris yang sedang tampil pada filter aktif
    const targets = (typeof filteredData !== "undefined" && Array.isArray(filteredData)) ? filteredData.slice() : [];
    if (targets.length === 0) {
        showToast("Tidak ada berkas pada filter yang sedang dibuka untuk direset.", "error");
        return;
    }
    const ids = targets.map((t) => t.id);

    openModalKonfirmasi({
        judul: "Reset Cek Fisik?",
        subjudul: `${ids.length} berkas ${jenisLabel} pada filter saat ini akan berstatus BELUM.`,
        isi: `<div class="text-xs leading-relaxed">Hanya <b>${ids.length} berkas ${jenisLabel}</b> yang sedang tampil pada filter ini yang direset menjadi <b>BELUM</b>. Berkas di luar filter tidak terpengaruh.</div>`,
        labelYa: "Ya, Reset",
        warna: "amber",
        onYa: async () => {
            const originalHtml = btn ? btn.innerHTML : "";
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = `<div class="spinner border-white border-l-transparent w-3 h-3"></div> <span>Mereset...</span>`;
            }
            await unsyncAllAPI(jenisLabel, ids);
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalHtml;
                lucide.createIcons();
            }
        }
    });
}

async function unsyncAllAPI(jenisLabel, ids) {
    const hasIds = Array.isArray(ids) && ids.length > 0;
    try {
        const res = await fetch(`/api/berkas/unsync-all?jenis=${activeJenis}`, {
            method: "POST",
            headers: getAuthHeaders(hasIds ? { "Content-Type": "application/json" } : {}),
            body: hasIds ? JSON.stringify({ ids }) : undefined
        });

        const data = await res.json();
        if (data.success) {
            if (hasIds) {
                const idSet = new Set(ids.map(Number));
                allData.forEach(d => {
                    if (idSet.has(Number(d.id))) d.sinkronisasi = "BELUM";
                });
                showToast(`${ids.length} berkas pada filter ini direset menjadi BELUM.`, "success");
            } else {
                allData.forEach(d => {
                    if (d.jenis_berkas === activeJenis) d.sinkronisasi = "BELUM";
                });
                showToast(`Semua status pencocokan fisik ${jenisLabel} direset menjadi BELUM.`, "success");
            }
            if (typeof AppCache !== "undefined") {
                AppCache.set(AppCache.getKey(), allData);
            }
            applyClientFilters(false);
        } else {
            showToast(data.error || "Gagal melakukan reset status!", "error");
        }
    } catch (err) {
        console.error("Gagal unsync all:", err);
        showToast("Terjadi kesalahan sistem saat melakukan reset status!", "error");
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

    // Konfirmasi via modal kustom (pengganti confirm() browser)
    if (isCurrentlyArsip) {
        openModalKonfirmasi({
            judul: "Batalkan Status ARSIP?",
            subjudul: "Berkas akan kembali ke antrean normal.",
            isi: `<div class="font-bold text-slate-800">${escapeHtml(item.nama_decrypted)}</div>
                  <div class="text-xs text-slate-500">Berkas akan dikembalikan ke status <b>Tersedia</b>.</div>`,
            labelYa: "Ya, Batalkan ARSIP",
            warna: "amber",
            onYa: async () => {
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

                        if (typeof AppCache !== "undefined") {
                            AppCache.set(AppCache.getKey(), allData);
                        }
                        applyClientFilters(false);
                        updateStatsFromClient(allData);
                        showToast("Status ARSIP berhasil dibatalkan!", "success");
                    } else {
                        showToast(data.error || "Gagal membatalkan status ARSIP!", "error");
                    }
                } catch (err) {
                    console.error("Gagal batal arsip:", err);
                    showToast("Terjadi kesalahan saat membatalkan status ARSIP!", "error");
                }
            }
        });
        return;
    }

    // Arsipkan: konfirmasi via modal kustom
    openModalKonfirmasi({
        judul: "Tandai sebagai ARSIP?",
        subjudul: "Berkas akan keluar dari antrean aktif.",
        isi: `<div class="font-bold text-slate-800">${escapeHtml(item.nama_decrypted)}</div>
              <div class="text-xs text-slate-500">Berkas berstatus <b>SELESAI</b> dan otomatis <b>dikecualikan</b> dari cetak Laporan RW.</div>`,
        labelYa: "Ya, Arsipkan",
        warna: "rose",
        onYa: async () => {
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

                    if (typeof AppCache !== "undefined") {
                        AppCache.set(AppCache.getKey(), allData);
                    }
                    applyClientFilters(false);
                    updateStatsFromClient(allData);
                    showToast("Berkas berhasil ditandai sebagai ARSIP!", "success");
                } else {
                    showToast(data.error || "Gagal menandai sebagai ARSIP!", "error");
                }
            } catch (err) {
                console.error("Gagal tandai arsip:", err);
                showToast("Terjadi kesalahan saat menandai sebagai ARSIP!", "error");
            }
        }
    });
}

