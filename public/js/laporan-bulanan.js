/**
 * Generator Laporan Bulanan (KTP & KIA)
 * Porting logika perhitungan dan layout cetak dari Google Apps Script (ReportLogic.gs & Laporans.html)
 * Kelurahan Alun-Alun Contong
 */

(function () {
    let currentReportData = []; // Data mentah dari backend untuk jenis berkas aktif
    const monthNames = [
        "JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", 
        "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"
    ];

    // --- 1. MODAL CONTROLLER ---
    window.openModalLaporanBulanan = function () {
        const modal = document.getElementById("modalLaporanBulanan");
        if (!modal) return;
        modal.classList.remove("hidden");
        loadLaporanData();
    };

    window.closeModalLaporanBulanan = function () {
        const modal = document.getElementById("modalLaporanBulanan");
        if (!modal) return;
        modal.classList.add("hidden");
    };

    // --- 2. FETCH DATA DARI BACKEND ---
    window.loadLaporanData = async function () {
        const typeSelect = document.getElementById("lapJenisSelect");
        const type = typeSelect ? typeSelect.value : "KTP";
        const tableArea = document.getElementById("lapTableContainer");

        if (tableArea) {
            tableArea.innerHTML = `
                <div class="py-12 flex flex-col items-center justify-center gap-2">
                    <div class="spinner border-slate-300 border-l-indigo-600 mb-1"></div>
                    <span class="text-xs text-slate-500 font-medium animate-pulse">Menghitung rekapitulasi data ${type === 'KIA' ? 'KIA' : 'E-KTP'}...</span>
                </div>
            `;
        }

        try {
            const res = await fetch(`/api/laporan-bulanan?jenis=${type}`, {
                headers: typeof getAuthHeaders === "function" ? getAuthHeaders() : { "X-App-PIN": window.currentPin || sessionStorage.getItem("ktp_app_pin") || "" }
            });
            const json = await res.json();

            let data = json.success && Array.isArray(json.data) ? json.data : [];

            currentReportData = data;
            populateYearAndMonthDropdowns(currentReportData);
            renderLaporanScreen();

        } catch (err) {
            console.error("Gagal memuat data laporan:", err);
            if (tableArea) {
                tableArea.innerHTML = `
                    <div class="p-8 text-center text-rose-500 text-xs font-semibold">
                        Gagal memuat rekap data laporan: ${escapeHtml(err.message)}
                    </div>
                `;
            }
        }
    };

    // --- 3. POPULATE DROPDOWNS (TAHUN & BULAN) ---
    function populateYearAndMonthDropdowns(data) {
        const yearSelect = document.getElementById("lapYearSelect");
        const monthSelect = document.getElementById("lapMonthSelect");
        if (!yearSelect || !monthSelect) return;

        yearSelect.innerHTML = "";
        const years = [...new Set(data.map(item => item.tahun))].sort((a, b) => b - a);

        let latestYear = new Date().getFullYear();
        let latestMonthIndex = new Date().getMonth(); // 0-11

        if (data.length > 0) {
            const sorted = [...data].sort((a, b) => {
                if (b.tahun !== a.tahun) return b.tahun - a.tahun;
                return monthNames.indexOf(b.bulan) - monthNames.indexOf(a.bulan);
            });
            latestYear = sorted[0].tahun;
            latestMonthIndex = monthNames.indexOf(sorted[0].bulan);
        }

        if (years.length === 0) {
            yearSelect.add(new Option(latestYear, latestYear));
        } else {
            years.forEach(y => yearSelect.add(new Option(y, y)));
        }

        if (years.includes(latestYear)) {
            yearSelect.value = latestYear;
        }
        monthSelect.value = latestMonthIndex + 1;
    }

    // --- 4. CORE ALGORITHM (Persis seperti GAS ReportLogic / Laporans.html) ---
    window.calculateReport = function (dataSet, selectedYear, selectedMonth) {
        let sortedData = [...dataSet].sort((a, b) => {
            if (a.tahun !== b.tahun) return a.tahun - b.tahun;
            return monthNames.indexOf(a.bulan) - monthNames.indexOf(b.bulan);
        });

        const targetIndex = sortedData.findIndex(d => 
            d.tahun === selectedYear && d.bulan === monthNames[selectedMonth - 1]
        );

        let dataUntilTarget;
        if (targetIndex === -1) {
            dataUntilTarget = sortedData.filter(d => d.tahun <= selectedYear);
        } else {
            dataUntilTarget = sortedData.slice(0, targetIndex + 1);
        }

        let sisaAkumulasi = 0;
        const calculatedData = [];

        dataUntilTarget.forEach((row) => {
            const sisaKtpBulanSebelumnya = sisaAkumulasi;
            const jumlah = sisaKtpBulanSebelumnya + row.ktpElYangDatang;
            const sisaKtpEl = jumlah - row.ktpYangDidistribusikan;
            const persentaseTerdistribusi = jumlah > 0 ? (row.ktpYangDidistribusikan / jumlah) * 100 : 0;
            const persentaseSisa = jumlah > 0 ? (sisaKtpEl / jumlah) * 100 : 0;

            sisaAkumulasi = sisaKtpEl;

            calculatedData.push({
                tahun: row.tahun,
                bulan: row.bulan,
                sisaKtpBulanSebelumnya: sisaKtpBulanSebelumnya,
                ktpElYangDatang: row.ktpElYangDatang,
                jumlah: jumlah,
                ktpYangDidistribusikan: row.ktpYangDidistribusikan,
                sisaKtpEl: sisaKtpEl,
                persentaseTerdistribusi: persentaseTerdistribusi,
                persentaseSisa: persentaseSisa
            });
        });

        const decemberPrevYear = calculatedData.find(d => 
            d.tahun === selectedYear - 1 && d.bulan === "DESEMBER"
        );

        const currentYearData = calculatedData.filter(d => 
            d.tahun === selectedYear && 
            monthNames.indexOf(d.bulan) <= (selectedMonth - 1)
        );

        const result = [];
        if (decemberPrevYear) result.push(decemberPrevYear);
        result.push(...currentYearData);

        return result;
    };

    // --- 5. GENERATE HTML TABLE STRING (Identik Format GAS) ---
    window.createLaporanTableHTML = function (data, selectedYear, titleType, isPrint = false) {
        if (!data || data.length === 0) {
            return `
                <div class="p-8 text-center text-slate-400 italic bg-slate-50 border border-slate-200 rounded-xl">
                    Tidak ada data ${titleType} untuk periode tahun ${selectedYear}.
                </div>
            `;
        }

        const now = new Date().toLocaleString('id-ID', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', 
            hour: '2-digit', minute: '2-digit'
        });

        let html = `
            <div class="mb-4 text-center ${isPrint ? 'print-header' : ''}">
                <h1 class="text-base sm:text-lg font-black uppercase text-slate-900 tracking-wider">
                    REKAP LAPORAN ${titleType} KELURAHAN ALUN-ALUN CONTONG
                </h1>
                <h2 class="text-xs sm:text-sm font-bold text-slate-600">TAHUN ${selectedYear}</h2>
            </div>
            <table class="w-full border-collapse border border-slate-300 text-xs ${isPrint ? 'text-[10px]' : ''}">
                <thead>
                    <tr class="bg-slate-200 text-slate-800 uppercase tracking-wider text-center font-bold">
                        <th rowspan="2" class="border border-slate-300 p-2.5">NO</th>
                        <th rowspan="2" class="border border-slate-300 p-2.5">TAHUN</th>
                        <th rowspan="2" class="border border-slate-300 p-2.5">BULAN</th>
                        <th rowspan="2" class="border border-slate-300 p-2.5 leading-tight">
                            SISA BULAN LALU<br><span class="text-[10px] lowercase font-normal">(akumulatif)</span>
                        </th>
                        <th rowspan="2" class="border border-slate-300 p-2.5 leading-tight">
                            YANG DATANG<br><span class="text-[10px] lowercase font-normal">(masuk)</span>
                        </th>
                        <th rowspan="2" class="border border-slate-300 p-2.5">JUMLAH</th>
                        <th rowspan="2" class="border border-slate-300 p-2.5 leading-tight">
                            DIDISTRIBUSIKAN<br><span class="text-[10px] lowercase font-normal">(keluar)</span>
                        </th>
                        <th rowspan="2" class="border border-slate-300 p-2.5">SISA AKHIR</th>
                        <th colspan="2" class="border border-slate-300 p-2">PERSENTASE (%)</th>
                    </tr>
                    <tr class="bg-slate-100 text-slate-700 font-bold text-center">
                        <th class="border border-slate-300 p-1.5 text-[10px]">Terdistribusi</th>
                        <th class="border border-slate-300 p-1.5 text-[10px]">Sisa</th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-slate-200">
        `;

        data.forEach((row, index) => {
            const isDiffYear = row.tahun !== selectedYear;
            const rowBg = isDiffYear ? 'bg-amber-100/70 font-semibold' : 'hover:bg-slate-50';
            const highlightCell = 'bg-slate-50 font-bold';

            html += `
                <tr class="${rowBg} text-center transition">
                    <td class="border border-slate-300 p-2 font-mono">${index + 1}</td>
                    <td class="border border-slate-300 p-2 font-mono">${row.tahun}</td>
                    <td class="border border-slate-300 p-2 text-left pl-3 font-semibold text-slate-900">${escapeHtml(row.bulan)}</td>
                    <td class="border border-slate-300 p-2 font-mono">${row.sisaKtpBulanSebelumnya}</td>
                    <td class="border border-slate-300 p-2 font-mono">${row.ktpElYangDatang}</td>
                    <td class="border border-slate-300 p-2 font-mono ${highlightCell}">${row.jumlah}</td>
                    <td class="border border-slate-300 p-2 font-mono text-emerald-700 font-bold">${row.ktpYangDidistribusikan}</td>
                    <td class="border border-slate-300 p-2 font-mono ${highlightCell}">${row.sisaKtpEl}</td>
                    <td class="border border-slate-300 p-2 font-mono font-medium">${row.persentaseTerdistribusi.toFixed(2)}%</td>
                    <td class="border border-slate-300 p-2 font-mono font-medium">${row.persentaseSisa.toFixed(2)}%</td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
            <div class="mt-6 text-center text-slate-400 text-[10px] font-mono uppercase">
                <p>Generated automatically by TIM PEMERINTAHAN AAC</p>
                <p class="mt-0.5">${now}</p>
            </div>
        `;

        return html;
    };

    // --- 6. DISPLAY ON SCREEN ---
    window.renderLaporanScreen = function () {
        const yearSelect = document.getElementById("lapYearSelect");
        const monthSelect = document.getElementById("lapMonthSelect");
        const typeSelect = document.getElementById("lapJenisSelect");
        const tableContainer = document.getElementById("lapTableContainer");

        if (!yearSelect || !monthSelect || !tableContainer) return;

        const selectedYear = parseInt(yearSelect.value, 10);
        const selectedMonth = parseInt(monthSelect.value, 10);
        const type = typeSelect ? typeSelect.value : "KTP";

        if (!selectedYear) return;

        const reportData = window.calculateReport(currentReportData, selectedYear, selectedMonth);
        const titleType = type === "KIA" ? "KIA" : "E-KTP";
        const html = window.createLaporanTableHTML(reportData, selectedYear, titleType, false);

        tableContainer.innerHTML = html;
    };

    // --- 7. CETAK SINGLE (KTP atau KIA) ---
    window.printSingleLaporan = function () {
        const yearSelect = document.getElementById("lapYearSelect");
        const monthSelect = document.getElementById("lapMonthSelect");
        const typeSelect = document.getElementById("lapJenisSelect");
        const printArea = document.getElementById("printContainer");

        if (!yearSelect || !monthSelect || !printArea) return;

        const selectedYear = parseInt(yearSelect.value, 10);
        const selectedMonth = parseInt(monthSelect.value, 10);
        const type = typeSelect ? typeSelect.value : "KTP";
        const titleType = type === "KIA" ? "KIA" : "E-KTP";

        const reportData = window.calculateReport(currentReportData, selectedYear, selectedMonth);
        const html = window.createLaporanTableHTML(reportData, selectedYear, titleType, true);

        printArea.innerHTML = `
            <div class="print-page">
                ${html}
            </div>
        `;

        setTimeout(() => {
            window.print();
        }, 300);
    };

    // --- 8. CETAK SEMUA (KTP + KIA BERURUTAN DENGAN PAGE BREAK) ---
    window.printAllLaporan = async function () {
        const yearSelect = document.getElementById("lapYearSelect");
        const monthSelect = document.getElementById("lapMonthSelect");
        const printArea = document.getElementById("printContainer");

        if (!yearSelect || !monthSelect || !printArea) return;

        const selectedYear = parseInt(yearSelect.value, 10);
        const selectedMonth = parseInt(monthSelect.value, 10);
        const pin = window.currentPin || sessionStorage.getItem("ktp_app_pin") || "";

        printArea.innerHTML = `
            <div class="p-8 text-center text-sm font-semibold text-slate-600">
                Menyiapkan Laporan Gabungan E-KTP & KIA...
            </div>
        `;

        try {
            // Ambil data KTP & KIA secara paralel
            const authH = typeof getAuthHeaders === "function" ? getAuthHeaders() : { "X-App-PIN": pin };
            const [resKtp, resKia] = await Promise.all([
                fetch(`/api/laporan-bulanan?jenis=KTP`, { headers: authH }),
                fetch(`/api/laporan-bulanan?jenis=KIA`, { headers: authH })
            ]);

            const [jsonKtp, jsonKia] = await Promise.all([resKtp.json(), resKia.json()]);

            let dataKtp = jsonKtp.success && Array.isArray(jsonKtp.data) ? jsonKtp.data : [];
            let dataKia = jsonKia.success && Array.isArray(jsonKia.data) ? jsonKia.data : [];

            const ktpReport = window.calculateReport(dataKtp, selectedYear, selectedMonth);
            const kiaReport = window.calculateReport(dataKia, selectedYear, selectedMonth);

            const ktpHtml = window.createLaporanTableHTML(ktpReport, selectedYear, "E-KTP", true);
            const kiaHtml = window.createLaporanTableHTML(kiaReport, selectedYear, "KIA", true);

            printArea.innerHTML = `
                <div class="print-page">
                    ${ktpHtml}
                </div>
                <div class="page-break" style="page-break-before: always; break-before: page;"></div>
                <div class="print-page mt-8 pt-6">
                    ${kiaHtml}
                </div>
            `;

            setTimeout(() => {
                window.print();
            }, 400);

        } catch (err) {
            showToast("Gagal menyiapkan laporan cetak semua: " + err.message, "error");
        }
    };

})();
