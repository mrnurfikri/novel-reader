import { saveEntry, getAllEntries, deleteEntry, deleteBook } from "./firebase.js";

// ── Elements ────────────────────────────────────────────────
const micBtn       = document.getElementById("micBtn");
const statusText   = document.getElementById("statusText");
const originalText = document.getElementById("originalText");
const translatedText = document.getElementById("translatedText");
const loadingBar   = document.getElementById("loadingBar");
const ttsBtn       = document.getElementById("ttsBtn");
const clearBtn     = document.getElementById("clearBtn");
const targetLang   = document.getElementById("targetLang");
const browserWarn  = document.getElementById("browserWarn");
const bookTitleInput = document.getElementById("bookTitleInput");
const saveBtn      = document.getElementById("saveBtn");
const saveToast    = document.getElementById("saveToast");
const syncStatus   = document.getElementById("syncStatus");
const searchInput  = document.getElementById("searchInput");
const libCount     = document.getElementById("libCount");
const libContent   = document.getElementById("libraryContent");

// ── Nav ─────────────────────────────────────────────────────
document.querySelectorAll(".nav-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("page-" + tab.dataset.page).classList.add("active");
    if (tab.dataset.page === "library") renderLibrary();
  });
});

// ── Speech Recognition ──────────────────────────────────────
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SR) browserWarn.style.display = "flex";

let recognition   = null;
let isRecording   = false;
let accumulated   = "";
let transTimeout  = null;
let isSpeaking    = false;
let lastTranslated = "";

async function translate(text) {
  if (!text.trim()) return;
  loadingBar.classList.add("active");
  translatedText.textContent = "";
  translatedText.classList.add("placeholder");
  ttsBtn.classList.remove("visible");

  const lang = targetLang.value;
  const url  = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`;
  try {
    const res  = await fetch(url);
    const data = await res.json();
    const result = data[0].map(s => s[0]).join("");
    lastTranslated = result;
    translatedText.textContent = result;
    translatedText.classList.remove("placeholder");
    ttsBtn.classList.add("visible");
  } catch {
    translatedText.textContent = "Terjemahan gagal. Cek koneksi internet.";
    translatedText.classList.add("placeholder");
  } finally {
    loadingBar.classList.remove("active");
  }
}

function startRecording() {
  if (!SR) return;
  recognition = new SR();
  recognition.lang = "en-US";
  recognition.continuous = true;
  recognition.interimResults = true;
  isRecording = true;
  micBtn.classList.add("recording");
  statusText.textContent = "Sedang merekam... baca novelmu";
  statusText.classList.add("active");

  recognition.onresult = e => {
    let interim = "", finalChunk = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) { finalChunk += t; accumulated += t + " "; }
      else interim = t;
    }
    originalText.textContent = accumulated + interim;
    originalText.classList.remove("placeholder");
    if (finalChunk.trim()) {
      clearTimeout(transTimeout);
      transTimeout = setTimeout(() => translate(accumulated.trim()), 1000);
    }
  };
  recognition.onerror = e => {
    if (e.error !== "no-speech") { stopRecording(); statusText.textContent = "Error: " + e.error; }
  };
  recognition.onend = () => { if (isRecording) recognition.start(); };
  recognition.start();
}

function stopRecording() {
  isRecording = false;
  if (recognition) { recognition.onend = null; recognition.stop(); }
  micBtn.classList.remove("recording");
  statusText.textContent = "Selesai. Tekan lagi untuk melanjutkan.";
  statusText.classList.remove("active");
}

micBtn.addEventListener("click", () => { if (isRecording) stopRecording(); else startRecording(); });

// ── TTS ─────────────────────────────────────────────────────
const langMap = { id:"id-ID", ms:"ms-MY", jv:"jv-ID", su:"su-ID", "zh-CN":"zh-CN", ar:"ar-SA" };

ttsBtn.addEventListener("click", () => {
  if (!lastTranslated) return;
  if (isSpeaking) {
    speechSynthesis.cancel(); isSpeaking = false;
    ttsBtn.innerHTML = '<i class="ti ti-volume"></i> Putar'; return;
  }
  const utt = new SpeechSynthesisUtterance(lastTranslated);
  utt.lang = langMap[targetLang.value] || "id-ID";
  isSpeaking = true;
  ttsBtn.innerHTML = '<i class="ti ti-player-pause"></i> Stop';
  utt.onend = () => { isSpeaking = false; ttsBtn.innerHTML = '<i class="ti ti-volume"></i> Putar'; };
  speechSynthesis.cancel();
  speechSynthesis.speak(utt);
});

// ── Clear ────────────────────────────────────────────────────
clearBtn.addEventListener("click", () => {
  accumulated = ""; lastTranslated = "";
  originalText.textContent = "Teks yang kamu baca akan muncul di sini...";
  originalText.classList.add("placeholder");
  translatedText.textContent = "Terjemahan akan muncul di sini...";
  translatedText.classList.add("placeholder");
  ttsBtn.classList.remove("visible");
  speechSynthesis.cancel(); isSpeaking = false;
});

// ── Save to Firebase ─────────────────────────────────────────
function setSyncStatus(state) {
  syncStatus.className = "sync-status " + state;
  const icons = { syncing: "ti-loader-2", ok: "ti-cloud-check", error: "ti-cloud-x" };
  const labels = { syncing: "Menyimpan...", ok: "Tersinkron", error: "Gagal sync" };
  syncStatus.innerHTML = `<i class="ti ${icons[state]}"></i><span>${labels[state]}</span>`;
}

saveBtn.addEventListener("click", async () => {
  const orig  = accumulated.trim();
  const trans = lastTranslated.trim();
  if (!orig && !trans) { alert("Belum ada teks! Baca novel dulu."); return; }

  setSyncStatus("syncing");
  try {
    await saveEntry({
      bookTitle:  bookTitleInput.value.trim() || "Tanpa Judul",
      original:   orig,
      translated: trans,
      lang:       targetLang.options[targetLang.selectedIndex].text
    });
    setSyncStatus("ok");
    saveToast.classList.add("show");
    setTimeout(() => saveToast.classList.remove("show"), 2500);
  } catch (err) {
    setSyncStatus("error");
    alert("Gagal menyimpan. Cek koneksi internet.\n" + err.message);
  }
});

// ── Library ──────────────────────────────────────────────────
let allEntries = [];

function escHtml(str) {
  return String(str || "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function highlight(text, query) {
  if (!query) return escHtml(text);
  const esc = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return escHtml(text).replace(new RegExp(`(${esc})`, "gi"), '<mark class="highlight">$1</mark>');
}

function groupByBook(entries) {
  const map = {};
  entries.forEach(e => {
    const title = e.bookTitle || "Tanpa Judul";
    if (!map[title]) map[title] = [];
    map[title].push(e);
  });
  return map;
}

async function renderLibrary(searchQ = "") {
  libContent.innerHTML = `<div class="spinner"><i class="ti ti-loader-2"></i>Memuat perpustakaan...</div>`;
  try {
    allEntries = await getAllEntries();
  } catch {
    libContent.innerHTML = `<div class="lib-empty"><i class="ti ti-wifi-off"></i><p>Gagal memuat data</p><span>Cek koneksi internet lalu muat ulang</span></div>`;
    return;
  }

  const q = searchQ.toLowerCase().trim();
  const filtered = q
    ? allEntries.filter(e =>
        (e.bookTitle || "").toLowerCase().includes(q) ||
        (e.original || "").toLowerCase().includes(q) ||
        (e.translated || "").toLowerCase().includes(q)
      )
    : allEntries;

  const total = allEntries.length;
  const books = Object.keys(groupByBook(allEntries)).length;
  libCount.textContent = total > 0 ? `${books} buku · ${total} catatan` : "";

  if (filtered.length === 0) {
    libContent.innerHTML = q
      ? `<div class="lib-empty"><i class="ti ti-search-off"></i><p>Tidak ada hasil untuk "${escHtml(q)}"</p><span>Coba kata kunci lain</span></div>`
      : `<div class="lib-empty"><i class="ti ti-books"></i><p>Perpustakaan masih kosong</p><span>Simpan hasil terjemahan dari halaman Baca</span></div>`;
    return;
  }

  const grouped = groupByBook(filtered);
  const list = document.createElement("div");
  list.className = "book-list";

  Object.entries(grouped).forEach(([title, entries]) => {
    const card = document.createElement("div");
    card.className = "book-card";

    const last = entries[0];
    const dateStr = new Date(last.createdAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });

    card.innerHTML = `
      <div class="book-card-header">
        <div class="book-icon"><i class="ti ti-book"></i></div>
        <div class="book-info">
          <div class="book-title">${highlight(title, q)}</div>
          <div class="book-meta">${entries.length} catatan · terakhir ${dateStr}</div>
        </div>
        <div class="book-chevron"><i class="ti ti-chevron-down"></i></div>
      </div>
      <div class="book-entries">
        <div class="book-toolbar">
          <button class="book-del-btn" data-title="${escHtml(title)}">
            <i class="ti ti-trash"></i> Hapus semua catatan buku ini
          </button>
        </div>
        ${entries.map(entry => {
          const d = new Date(entry.createdAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
          return `
          <div class="entry-item">
            <div class="entry-date">${d} · ${escHtml(entry.lang)}</div>
            <div class="entry-texts">
              <div>
                <div class="entry-col-label">Inggris</div>
                <div class="entry-text">${highlight(entry.original, q)}</div>
              </div>
              <div>
                <div class="entry-col-label">Terjemahan</div>
                <div class="entry-text">${highlight(entry.translated, q)}</div>
              </div>
            </div>
            <div class="entry-actions">
              <button class="entry-del-btn" data-id="${entry.id}">
                <i class="ti ti-trash"></i> Hapus
              </button>
            </div>
          </div>`;
        }).join("")}
      </div>`;

    // Toggle open/close
    card.querySelector(".book-card-header").addEventListener("click", () => card.classList.toggle("open"));

    // Delete single entry
    card.querySelectorAll(".entry-del-btn").forEach(btn => {
      btn.addEventListener("click", async e => {
        e.stopPropagation();
        if (!confirm("Hapus catatan ini?")) return;
        setSyncStatus("syncing");
        try {
          await deleteEntry(btn.dataset.id);
          setSyncStatus("ok");
          renderLibrary(searchInput.value);
        } catch { setSyncStatus("error"); }
      });
    });

    // Delete whole book
    card.querySelector(".book-del-btn").addEventListener("click", async e => {
      e.stopPropagation();
      if (!confirm(`Hapus semua catatan untuk "${title}"?`)) return;
      setSyncStatus("syncing");
      try {
        await deleteBook(title);
        setSyncStatus("ok");
        renderLibrary(searchInput.value);
      } catch { setSyncStatus("error"); }
    });

    list.appendChild(card);
  });

  libContent.innerHTML = "";
  libContent.appendChild(list);
}

// Search
let searchTimeout;
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => renderLibrary(searchInput.value), 300);
});
