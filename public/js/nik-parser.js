/**
 * NIK Parser & Business Logic Helper
 * Porting formula Excel & GAS:
 * - Ekstraksi Tanggal Lahir (DD-MM-YYYY)
 * - Cek Umur 17 Tahun & Tanggal Ultah ke-17
 * - Status (TERSEDIA, SELESAI, TAHAN BELUM 17 TH)
 * - Kategori Keterangan ('Cetak Biasa KIA' | 'Perekaman Baru 17 Tahun' | 'Cetak Biasa KTP')
 */

const NIKHelper = {
    parse(nik, jenisBerkas = "KTP") {
        const clean = String(nik || "").trim().replace(/'/g, "");
        if (!/^\d{16}$/.test(clean)) {
            return {
                isValid: false,
                error: "NIK harus berupa 16 digit angka!"
            };
        }

        let day = parseInt(clean.substring(6, 8), 10);
        const month = parseInt(clean.substring(8, 10), 10); // 1-12
        const year2Digit = parseInt(clean.substring(10, 12), 10);

        // Jika perempuan, tanggal ditambah 40
        const isFemale = day > 40;
        if (isFemale) day -= 40;

        // Tahun lahir: <= 26 diasumsikan 2000-an, > 26 diasumsikan 1900-an
        const fullYear = year2Digit <= 26 ? 2000 + year2Digit : 1900 + year2Digit;

        const birthDate = new Date(fullYear, month - 1, day);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Hitung umur eksak
        let age = today.getFullYear() - birthDate.getFullYear();
        const mDiff = today.getMonth() - birthDate.getMonth();
        if (mDiff < 0 || (mDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }

        // Tanggal ulang tahun ke-17
        const next17thBirthday = new Date(fullYear + 17, month - 1, day);

        const pad = (n) => String(n).padStart(2, '0');
        const formattedBirth = `${pad(day)}-${pad(month)}-${fullYear}`;
        const formatted17th = `${pad(day)}-${pad(month)}-${fullYear + 17}`;

        // Hitung Kategori Keterangan persis seperti rumus Excel
        let keterangan = "";
        const jenisUpper = String(jenisBerkas || "").toUpperCase();

        if (jenisUpper.includes("KIA")) {
            keterangan = "Cetak Biasa KIA";
        } else if (jenisUpper.includes("KTP")) {
            if (age === 17) {
                keterangan = "Perekaman Baru 17 Tahun";
            } else {
                keterangan = "Cetak Biasa KTP";
            }
        }

        return {
            isValid: true,
            nik: clean,
            day,
            month,
            year: fullYear,
            birthDate,
            formattedBirth,
            age,
            next17thBirthday,
            formatted17th,
            isUnderage: jenisUpper.includes("KTP") && age < 17,
            keterangan
        };
    },

    computeStatus(tglAmbil, tglDatang, nikInfo) {
        if (tglAmbil && String(tglAmbil).trim() !== "") {
            return "SELESAI";
        }

        if (nikInfo && nikInfo.isUnderage) {
            return `TAHAN (BELUM 17 TH)`;
        }

        return "TERSEDIA";
    },

    maskNIK(nik) {
        if (!nik || nik.length < 12) return nik;
        return nik.substring(0, 6) + "******" + nik.substring(12);
    },

    getAge(row) {
        if (!row) return null;
        if (row.nik_decrypted && /^\d{16}$/.test(row.nik_decrypted)) {
            const info = this.parse(row.nik_decrypted, row.jenis_berkas);
            if (info && info.isValid && typeof info.age === 'number') {
                return info.age;
            }
        }
        if (row.kelahiran && typeof row.kelahiran === 'string') {
            const parts = row.kelahiran.trim().split('-');
            if (parts.length === 3) {
                const d = parseInt(parts[0], 10);
                const m = parseInt(parts[1], 10);
                const y = parseInt(parts[2], 10);
                if (!isNaN(d) && !isNaN(m) && !isNaN(y) && y > 1900) {
                    const birthDate = new Date(y, m - 1, d);
                    const today = new Date();
                    let age = today.getFullYear() - birthDate.getFullYear();
                    const mDiff = today.getMonth() - birthDate.getMonth();
                    if (mDiff < 0 || (mDiff === 0 && today.getDate() < birthDate.getDate())) {
                        age--;
                    }
                    return age;
                }
            }
        }
        return null;
    },

    isLansia(row) {
        if (!row || row.jenis_berkas === "KIA") return false;
        const age = this.getAge(row);
        return (age !== null && age >= 60);
    }
};

window.NIKHelper = NIKHelper;
