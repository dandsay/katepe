/**
 * Modul Cetak Rekapitulasi Berkas per RW
 * Mengelompokkan berkas per RW, mengecualikan ARSIP, dan mencetak dengan format identik Google Apps Script
 * + Banner verifikasi QR pojok kiri bawah (snapshot mask 7 hari, 1 token per RW).
 */

async function createVerifyToken(rw, jenis, rows) {
    try {
        const headers = Object.assign({ "Content-Type": "application/json" },
            (typeof getAuthHeaders === "function" ? getAuthHeaders() : {}));
        const res = await fetch("/api/verify-rw", {
            method: "POST",
            headers,
            body: JSON.stringify({ rw: String(rw), jenis, rows })
        });
        const json = await res.json();
        if (json && json.success && json.token) return json;
        return null;
    } catch {
        return null;
    }
}

function shortHash(h) {
    if (!h) return "-";
    return String(h).substring(0, 16).toUpperCase();
}

function formatExpiry(iso) {
    try {
        return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
    } catch {
        return iso || "-";
    }
}

async function printReport() {
    // Mode ARSIP: cetak laporan RW dibekukan
    if (typeof activeJenis !== "undefined" && activeJenis === "ARSIP") {
        showToast("Cetak Laporan RW tidak tersedia di mode ARSIP.", "error");
        return;
    }
    const printContainer = document.getElementById("printContainer");
    printContainer.innerHTML = "";

    // ATURAN KHUSUS: Saring dan kecualikan berkas yang bertanda ARSIP
    const validDataForPrint = filteredData.filter(row => row.hubungan_pengambil !== "ARSIP");

    if (validDataForPrint.length === 0) {
        showToast("Tidak ada data untuk dicetak (atau semua data yang dipilih berstatus ARSIP).", "error");
        return;
    }

    // 1. Kelompokkan Data per RW
    const grouped = {};
    validDataForPrint.forEach(row => {
        const rwKey = row.rw ? String(row.rw) : "LAINNYA";
        if (!grouped[rwKey]) grouped[rwKey] = [];
        grouped[rwKey].push(row);
    });

    // Urutkan Kunci RW secara Numerik (001, 002, dst)
    const sortedRWs = Object.keys(grouped).sort((a, b) => (parseInt(a) || 999) - (parseInt(b) || 999));

    const jenisNorm = activeJenis === "KIA" ? "KIA" : "KTP";
    const typeText = activeJenis === "KIA" ? "KIA" : "E-KTP";
    const currentYear = new Date().getFullYear();
    const yearText = `TAHUN ${currentYear}`;

    // Format Tanggal & Jam Dinamis (persis seperti GAS)
    const now = new Date();
    const dateStr = now.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
    const timeStr = "pukul " + now.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit'
    }).replace('.', ':');

    showToast("Menyiapkan tautan verifikasi QR...", "info");

    // 2. Bangun Tampilan Dokumen per RW (buat token verifikasi dulu per RW)
    const pages = [];
    for (const rw of sortedRWs) {
        const rows = grouped[rw];

        // Snapshot mask — sama persis dengan yang tercetak di tabel
        const snapshot = rows.map((row, i) => {
            let maskedNik = row.nik_decrypted || "";
            if (maskedNik.length > 10) {
                maskedNik = maskedNik.substring(0, 6) + "******" + maskedNik.substring(12);
            }
            const isSent = row.tgl_ambil && row.tgl_ambil.trim() !== "";
            return {
                no: i + 1,
                nik_mask: maskedNik,
                nama: (row.nama_decrypted || "").toUpperCase(),
                alamat: (row.alamat_decrypted || "-").toUpperCase(),
                tgl_datang: row.tgl_datang ? formatDate(row.tgl_datang) : "-",
                status: isSent ? "Telah diterima Pemohon" : "Di Kelurahan"
            };
        });

        const verify = await createVerifyToken(rw, jenisNorm, snapshot);
        pages.push({ rw, rows, snapshot, verify });
    }

    if (pages.some(p => !p.verify)) {
        showToast("Sebagian QR verifikasi gagal dibuat — laporan tetap dicetak tanpa QR pada RW terkait.", "error");
    } else if (pages.length > 0 && pages.every(p => p.verify.reused)) {
        showToast("Data tidak berubah — menggunakan tautan verifikasi yang sama.", "info");
    }

    // 3. Render per RW
    pages.forEach(({ rw, rows, verify }, index) => {
        const pageDiv = document.createElement("div");
        pageDiv.className = "print-section";
        if (index > 0) pageDiv.classList.add("page-break");

        const headerHtml = `
            <div class="text-center mb-4 font-serif text-black" style="text-align: center; margin-bottom: 16px; font-family: 'Times New Roman', serif;">
                <h1 style="font-size: 18px; font-weight: bold; text-transform: uppercase; margin: 0;">REKAP LAPORAN ${typeText} KELURAHAN ALUN-ALUN CONTONG</h1>
                <h2 style="font-size: 16px; font-weight: bold; text-transform: uppercase; margin: 4px 0 0 0;">${yearText} - RW ${escapeHtml(rw)}</h2>
                <div style="width: 100%; height: 2px; background-color: black; margin-top: 8px; margin-bottom: 16px;"></div>
            </div>
        `;

        // Format Tabel Cetak persis GAS (Alamat sebelum RW)
        let tableHtml = `
            <table class="w-full border-collapse border border-black text-[11px]" style="width: 100%; border-collapse: collapse; border: 1px solid black; font-size: 11px; font-family: 'Times New Roman', serif;">
                <thead>
                    <tr style="background-color: #e5e7eb;">
                        <th style="border: 1px solid black; padding: 4px 6px; text-align: center; width: 35px;">NO</th>
                        <th style="border: 1px solid black; padding: 4px 6px; text-align: center; width: 140px;">NIK</th>
                        <th style="border: 1px solid black; padding: 4px 6px;">NAMA LENGKAP</th>
                        <th style="border: 1px solid black; padding: 4px 6px;">ALAMAT</th>
                        <th style="border: 1px solid black; padding: 4px 6px; text-align: center; width: 50px;">RW</th>
                        <th style="border: 1px solid black; padding: 4px 6px; text-align: center; width: 85px;">TGL DATANG</th>
                        <th style="border: 1px solid black; padding: 4px 6px; text-align: center; width: 120px;">STATUS</th>
                    </tr>
                </thead>
                <tbody>
        `;

        rows.forEach((row, i) => {
            let maskedNik = row.nik_decrypted || "";
            if (maskedNik.length > 10) {
                maskedNik = maskedNik.substring(0, 6) + "******" + maskedNik.substring(12);
            }

            const isSent = row.tgl_ambil && row.tgl_ambil.trim() !== "";
            const statusText = isSent ? "Telah diterima Pemohon" : "Di Kelurahan";
            const tglMasuk = row.tgl_datang ? formatDate(row.tgl_datang) : "-";

            tableHtml += `
                <tr>
                    <td style="border: 1px solid black; padding: 4px 6px; text-align: center;">${i + 1}</td>
                    <td style="border: 1px solid black; padding: 4px 6px; text-align: center; font-family: monospace;">${escapeHtml(maskedNik)}</td>
                    <td style="border: 1px solid black; padding: 4px 6px; font-weight: bold; text-transform: uppercase;">${escapeHtml((row.nama_decrypted || "").toUpperCase())}</td>
                    <td style="border: 1px solid black; padding: 4px 6px; text-transform: uppercase;">${escapeHtml((row.alamat_decrypted || "-").toUpperCase())}</td>
                    <td style="border: 1px solid black; padding: 4px 6px; text-align: center;">${escapeHtml(row.rw)}</td>
                    <td style="border: 1px solid black; padding: 4px 6px; text-align: center;">${escapeHtml(tglMasuk)}</td>
                    <td style="border: 1px solid black; padding: 4px 6px; text-align: center;">${statusText}</td>
                </tr>
            `;
        });

        tableHtml += `</tbody></table>`;

        // Peringatan Dinamis Persis GAS
        let warningPoints = "";
        if (activeJenis === "KIA") {
            warningPoints = `
                • BAGI PEMOHON CETAK ULANG KIA KARENA RUSAK HARAP <strong>MEMBAWA KIA LAMA</strong>.<br>
                • PENERIMA/PENGAMBIL YANG BUKAN BERSANGKUTAN HARAP <strong>MENUNJUKKAN KARTU KELUARGA (KK) / KTP ORANG TUA</strong>.
            `;
        } else {
            warningPoints = `
                • BAGI PEMOHON CETAK ULANG KTP KARENA RUSAK HARAP <strong>MEMBAWA KTP LAMA</strong>.<br>
                • PENERIMA/PENGAMBIL YANG BUKAN BERSANGKUTAN HARAP <strong>MENUNJUKKAN KTP PENERIMA/PENGAMBIL</strong>.
            `;
        }

        // Banner gabungan: catatan penting + verifikasi QR di SISI KANAN.
        // Bahasa tenang (tanpa label norak), hash kecil di bawah QR tanpa kata HASH.
        const qrId = `qr-verify-${String(rw).replace(/[^0-9A-Za-z]/g, "")}-${index}`;
        let infoBanner = "";
        if (verify && verify.token) {
            const verifyUrl = window.location.origin + verify.url_path;
            infoBanner = `
                <div style="margin-top: 24px; border: 1.5px solid black; border-radius: 8px; padding: 12px; display: flex; gap: 14px; font-family: 'Times New Roman', serif; page-break-inside: avoid;">
                    <div style="flex: 1; min-width: 0;">
                        <p style="color: #dc2626; font-weight: bold; margin: 0 0 4px 0; text-transform: uppercase; font-size: 12px; letter-spacing: 0.5px;">
                            ⚠️ PENTING - HARAP DIBACA:
                        </p>
                        <p style="color: #1e293b; margin: 0; font-size: 11px; line-height: 1.6;">
                            <strong>CATATAN:</strong><br>
                            ${warningPoints}
                        </p>
                        <div style="border-top: 1px dashed #cbd5e1; margin-top: 10px; padding-top: 8px;">
                            <p style="font-size: 11px; margin: 0; color: #1e293b; line-height: 1.6;">
                                Pindai kode QR di samping untuk memeriksa data diri Anda pada laporan RW ${escapeHtml(rw)} (${escapeHtml(typeText)}, ${rows.length} berkas) di laman verifikasi kelurahan.
                            </p>
                            <p style="font-size: 10px; margin: 4px 0 0 0; color: #475569; line-height: 1.5;">
                                Dicetak ${escapeHtml(dateStr)} ${escapeHtml(timeStr)} • Berlaku s/d ${escapeHtml(formatExpiry(verify.expires_at))} •
                                Info: WA kelurahan 0821 4770 2966 / Penyelia RW ${escapeHtml(rw)}.
                            </p>
                        </div>
                    </div>
                    <div style="flex-shrink: 0; text-align: center;">
                        <div id="${qrId}" data-verify-url="${escapeHtml(verifyUrl)}" style="width: 96px; height: 96px; display: flex; align-items: center; justify-content: center; border: 1px solid #cbd5e1; padding: 4px; background: white;"></div>
                        <div style="font-family: monospace; font-size: 8px; color: #64748b; margin-top: 4px;">${escapeHtml(shortHash(verify.content_hash))}</div>
                        <div style="font-size: 8px; color: #475569; margin-top: 2px;">Pindai untuk cek data</div>
                    </div>
                </div>
            `;
        } else {
            infoBanner = `
                <div style="margin-top: 24px; border: 1.5px solid black; border-radius: 8px; padding: 12px; font-family: 'Times New Roman', serif;">
                    <p style="color: #dc2626; font-weight: bold; margin: 0 0 4px 0; text-transform: uppercase; font-size: 12px; letter-spacing: 0.5px;">
                        ⚠️ PENTING - HARAP DIBACA:
                    </p>
                    <p style="color: #1e293b; margin: 0; font-size: 11px; line-height: 1.6;">
                        <strong>CATATAN:</strong><br>
                        ${warningPoints}
                    </p>
                    <p style="font-size: 10px; margin: 8px 0 0 0; color: #64748b;">Kode QR verifikasi tidak tersedia untuk RW ${escapeHtml(rw)} — dicetak ${escapeHtml(dateStr)} ${escapeHtml(timeStr)}. Info: WA 0821 4770 2966.</p>
                </div>
            `;
        }

        pageDiv.innerHTML = headerHtml + tableHtml + infoBanner;
        printContainer.appendChild(pageDiv);
    });

    // Render QR per banner (qrcodejs CDN; fallback tulis URL bila lib gagal)
    sortedRWs.forEach((rw, index) => {
        const qrId = `qr-verify-${String(rw).replace(/[^0-9A-Za-z]/g, "")}-${index}`;
        const el = document.getElementById(qrId);
        if (!el) return;
        const url = el.getAttribute("data-verify-url");
        if (!url) return;
        try {
            if (typeof QRCode !== "undefined") {
                new QRCode(el, { text: url, width: 88, height: 88, correctLevel: QRCode.CorrectLevel.M });
            } else {
                el.style.fontSize = "8px";
                el.style.wordBreak = "break-all";
                el.textContent = url;
            }
        } catch {
            el.style.fontSize = "8px";
            el.textContent = url;
        }
    });

    window.print();
}
