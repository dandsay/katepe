/**
 * Modul Otentikasi & State Global Aplikasi
 * Mengelola PIN sesi, penurunan kunci enkripsi AES-GCM, dan siklus login/logout
 */

// State Global yang diakses oleh seluruh modul
var appKey = null;
var currentPin = null;
var sessionToken = sessionStorage.getItem("ktp_session_token") || null;
var allData = [];
var filteredData = [];
var activeJenis = sessionStorage.getItem("ktp_active_jenis") || "KTP";
var activeYear = sessionStorage.getItem("ktp_active_year") || new Date().getFullYear().toString();
var selectedRW = sessionStorage.getItem("ktp_active_rw") || "ALL";
var availableYears = [];

// Helper untuk menyusun header otorisasi (Session Token Bearer)
function getAuthHeaders(extra = {}) {
    const headers = { ...extra };
    if (sessionToken) {
        headers["Authorization"] = `Bearer ${sessionToken}`;
    }
    return headers;
}
window.getAuthHeaders = getAuthHeaders;

// State Pagination: Default 10 data per halaman (dipulihkan dari sessionStorage jika ada)
var currentPage = parseInt(sessionStorage.getItem("ktp_current_page") || "1", 10);
if (isNaN(currentPage) || currentPage < 1) currentPage = 1;
var pageSize = 10;

// State Pencarian Arsip On-Demand
var archiveLoaded = false;
var searchAbortController = null;
var searchDebounceTimer = null;

// Status Sortir: 'tgl_datang', 'tgl_ambil', atau 'rw'
var currentSortCol = "tgl_datang";
var currentSortDir = "desc"; 
var filter17Active = false;

document.addEventListener("DOMContentLoaded", async () => {
    lucide.createIcons();

    // Pulihkan sesi PIN jika sudah tersimpan di browser
    const savedPin = sessionStorage.getItem("ktp_app_pin");
    if (savedPin) {
        document.getElementById("inputPin").value = savedPin;
        const success = await doLogin(savedPin);
        if (!success) {
            document.documentElement.classList.remove("has-session");
            sessionStorage.removeItem("ktp_app_pin");
            sessionStorage.removeItem("ktp_session_token");
            sessionToken = null;
            document.getElementById("mainApp").classList.add("hidden");
            document.getElementById("loginModal").classList.remove("hidden");
        }
    }
});

// Handler Form Login
async function handleLogin(e) {
    if (e) e.preventDefault();
    const pin = document.getElementById("inputPin").value.trim();
    const errEl = document.getElementById("loginError");
    errEl.classList.add("hidden");

    if (!pin) {
        errEl.innerText = "Masukkan PIN otorisasi!";
        errEl.classList.remove("hidden");
        return;
    }

    const success = await doLogin(pin);
    if (!success) {
        errEl.innerText = "PIN Salah! Akses ditolak.";
        errEl.classList.remove("hidden");
    }
}

// Proses Eksekusi Login & Penurunan Kunci Enkripsi
async function doLogin(pin) {
    const btn = document.getElementById("btnLogin");
    if (btn) btn.disabled = true;

    try {
        const res = await fetch("/api/auth/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pin })
        });

        const data = await res.json();
        if (data.success) {
            currentPin = pin;
            sessionStorage.setItem("ktp_app_pin", pin);
            if (data.token) {
                sessionToken = data.token;
                sessionStorage.setItem("ktp_session_token", data.token);
            }

            // Turunkan kunci enkripsi AES-GCM 256-bit dari PIN (Zero-Knowledge)
            appKey = await AppCrypto.deriveKey(pin);

            // Pulihkan tab visual & status RW (validasi nilai tab usang)
            if (activeJenis !== "KTP" && activeJenis !== "KIA" && activeJenis !== "ARSIP") {
                activeJenis = "KTP";
                sessionStorage.setItem("ktp_active_jenis", "KTP");
            }
            if (typeof applyTabUI === "function") {
                applyTabUI(activeJenis);
            }
            const elRW = document.getElementById("selectRW");
            if (elRW && selectedRW) {
                elRW.value = selectedRW;
            }
            if (typeof updateFilterUIState === "function") {
                updateFilterUIState();
            }

            document.documentElement.classList.add("has-session");
            document.getElementById("loginModal").classList.add("hidden");
            document.getElementById("mainApp").classList.remove("hidden");
            lucide.createIcons();

            // Muat data awal (mode ARSIP langsung ambil semua tahun dari DB;
            // tab normal memakai cache 0ms per-tahun jika valid)
            if (activeJenis === "ARSIP" && typeof filterJenis === "function") {
                await filterJenis("ARSIP");
            } else {
                await loadData();
            }
            return true;
        } else {
            document.documentElement.classList.remove("has-session");
            sessionStorage.removeItem("ktp_app_pin");
            sessionStorage.removeItem("ktp_session_token");
            sessionToken = null;
            return false;
        }
    } catch (err) {
        console.error("Login error:", err);
        document.documentElement.classList.remove("has-session");
        return false;
    } finally {
        if (btn) btn.disabled = false;
    }
}

// Logout & Kunci Aplikasi
function handleLogout() {
    sessionStorage.removeItem("ktp_app_pin");
    sessionStorage.removeItem("ktp_session_token");
    sessionToken = null;
    sessionStorage.removeItem("ktp_active_jenis");
    sessionStorage.removeItem("ktp_active_year");
    sessionStorage.removeItem("ktp_active_rw");
    sessionStorage.removeItem("ktp_current_page");
    if (typeof AppCache !== "undefined") {
        AppCache.clearAll();
    }
    document.documentElement.classList.remove("has-session");
    currentPin = null;
    appKey = null;
    allData = [];
    filteredData = [];
    document.getElementById("inputPin").value = "";
    document.getElementById("mainApp").classList.add("hidden");
    document.getElementById("loginModal").classList.remove("hidden");
}
