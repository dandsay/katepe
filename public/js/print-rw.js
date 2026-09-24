/**
 * Modul Cetak Rekapitulasi Berkas per RW
 * Mengelompokkan berkas per RW, mengecualikan ARSIP, dan mencetak dengan format identik Google Apps Script
 */

function printReport() {
    const printContainer = document.getElementById("printContainer");
    printContainer.innerHTML = "";

    // ATURAN KHUSUS: Saring dan kecualikan berkas yang bertanda ARSIP
    const validDataForPrint = filteredData.filter(row => row.hubungan_pengambil !== "ARSIP");

    if (validDataForPrint.length === 0) {
        alert("Tidak ada data untuk dicetak (atau semua data yang dipilih berstatus ARSIP).");
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

    // 2. Bangun Tampilan Dokumen per RW
    sortedRWs.forEach((rw, index) => {
        const rows = grouped[rw];
        const pageDiv = document.createElement("div");
        pageDiv.className = "print-section";
        if (index > 0) pageDiv.classList.add("page-break");

        const headerHtml = `
            <div class="text-center mb-4 font-serif text-black" style="text-align: center; margin-bottom: 16px; font-family: 'Times New Roman', serif;">
                <h1 style="font-size: 18px; font-weight: bold; text-transform: uppercase; margin: 0;">REKAP LAPORAN ${typeText} KELURAHAN ALUN-ALUN CONTONG</h1>
                <h2 style="font-size: 16px; font-weight: bold; text-transform: uppercase; margin: 4px 0 0 0;">${yearText} - RW ${rw}</h2>
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
                    <td style="border: 1px solid black; padding: 4px 6px; text-align: center; font-family: monospace;">${maskedNik}</td>
                    <td style="border: 1px solid black; padding: 4px 6px; font-weight: bold; text-transform: uppercase;">${(row.nama_decrypted || "").toUpperCase()}</td>
                    <td style="border: 1px solid black; padding: 4px 6px; text-transform: uppercase;">${(row.alamat_decrypted || "-").toUpperCase()}</td>
                    <td style="border: 1px solid black; padding: 4px 6px; text-align: center;">${row.rw}</td>
                    <td style="border: 1px solid black; padding: 4px 6px; text-align: center;">${tglMasuk}</td>
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

        const footerHtml = `
            <div style="margin-top: 24px; border-top: 2px solid black; padding-top: 14px; color: black; font-family: 'Times New Roman', serif;">
                <!-- Kotak Catatan Merah Garis Putus-Putus -->
                <div style="border: 1.5px dashed #dc2626; background-color: #fffafb; padding: 12px; border-radius: 6px; margin-bottom: 8px;">
                    <p style="color: #dc2626; font-weight: bold; margin: 0 0 4px 0; text-transform: uppercase; font-size: 12px; letter-spacing: 0.5px;">
                        ⚠️ PENTING - HARAP DIBACA:
                    </p>
                    <p style="color: #1e293b; margin: 0; font-size: 11px; line-height: 1.6;">
                        <strong>CATATAN:</strong><br>
                        ${warningPoints}
                    </p>
                </div>

                <!-- Info Kontak Kelurahan & Penyelia RW -->
                <div style="text-align: center; margin-top: 10px;">
                    <p style="color: #dc2626; font-weight: bold; font-size: 11.5px; margin: 0;">
                        * Info Lebih lanjut hubungi WA kelurahan 0821 4770 2966 atau Penyelia RW ${rw}
                    </p>
                </div>

                <!-- System Log & Timestamp Ditengah Bawah -->
                <div style="text-align: center; margin-top: 12px; padding-top: 8px; border-top: 1px dashed #cbd5e1;">
                    <p style="font-family: monospace; font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin: 0;">
                        * GENERATED AUTOMATICALLY BY TIM PEMERINTAHAN AAC - ${dateStr} ${timeStr}
                    </p>
                </div>
            </div>
        `;

        pageDiv.innerHTML = headerHtml + tableHtml + footerHtml;
        printContainer.appendChild(pageDiv);
    });

    window.print();
}
