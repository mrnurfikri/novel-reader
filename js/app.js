import { saveEntry, getAllEntries, updateEntry, deleteEntry, deleteBook } from "./firebase.js";

// ── Elements ────────────────────────────────────────────────
const micBtn         = document.getElementById("micBtn");
const statusText     = document.getElementById("statusText");
const originalText   = document.getElementById("originalText");
const translatedText = document.getElementById("translatedText");
const loadingBar     = document.getElementById("loadingBar");
const ttsBtn         = document.getElementById("ttsBtn");
const clearBtn       = document.getElementById("clearBtn");
const targetLang     = document.getElementById("targetLang");
const browserWarn    = document.getElementById("browserWarn");
const bookTitleInput = document.getElementById("bookTitleInput");
const chapterInput   = document.getElementById("chapterInput");
const saveBtn        = document.getElementById("saveBtn");
const saveToast      = document.getElementById("saveToast");
const syncStatus     = document.getElementById("syncStatus");
const searchInput    = document.getElementById("searchInput");
const libCount       = document.getElementById("libCount");
const libContent     = document.getElementById("libraryContent");
const editModal      = document.getElementById("editModal");
const editOriginal   = document.getElementById("editOriginal");
const editTranslated = document.getElementById("editTranslated");
const modalClose     = document.getElementById("modalClose");
const modalCancel    = document.getElementById("modalCancel");
const modalSave      = document.getElementById("modalSave");

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

// ── Speech Recognition ───────────────────────────────────────
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SR) browserWarn.style.display = "flex";

let recognition  = null;
let isRecording  = false;
let accumulated  = "";   // final clean text
let transTimeout = null;
let isSpeaking   = false;
let lastTranslated = "";
let silenceTimer = null;

// Punctuation voice commands
const PUNCT_COMMANDS = {
  "comma"        : ", ",
  "period"       : ". ",
  "full stop"    : ". ",
  "exclamation"  : "! ",
  "exclamation mark": "! ",
  "question mark": "? ",
  "colon"        : ": ",
  "semicolon"    : "; ",
  "new paragraph": "\n\n",
  "new line"     : "\n\n",
  "paragraph"    : "\n\n",
};

function applyPunctCommand(transcript) {
  const lower = transcript.trim().toLowerCase();
  for (const [cmd, symbol] of Object.entries(PUNCT_COMMANDS)) {
    if (lower === cmd) return { isPunct: true, symbol };
  }
  return { isPunct: false };
}

function renderOriginal() {
  originalText.textContent = accumulated;
  originalText.classList.toggle("placeholder", !accumulated);
  if (!accumulated) originalText.textContent = "Teks yang kamu baca akan muncul di sini...";
}

// ── Translate ────────────────────────────────────────────────
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

function scheduleTranslate() {
  clearTimeout(transTimeout);
  transTimeout = setTimeout(() => translate(accumulated.trim()), 1000);
}

// ── Silence detection (auto comma after 3s pause) ───────────
function resetSilenceTimer() {
  clearTimeout(silenceTimer);
  silenceTimer = setTimeout(() => {
    // Only add comma if text doesn't already end with punctuation
    if (accumulated && !/[.,!?:;\n]$/.test(accumulated.trim())) {
      accumulated = accumulated.trimEnd() + ", ";
      renderOriginal();
      scheduleTranslate();
    }
  }, 3000);
}

// ── Recording ────────────────────────────────────────────────
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
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) {
        const { isPunct, symbol } = applyPunctCommand(t);
        if (isPunct) {
          // Remove trailing space then insert symbol
          accumulated = accumulated.trimEnd() + symbol;
        } else {
          accumulated += t + " ";
        }
        resetSilenceTimer();
        scheduleTranslate();
      } else {
        interim = t;
      }
    }
    // Show accumulated + interim preview
    originalText.textContent = accumulated + interim;
    originalText.classList.remove("placeholder");
  };

  recognition.onerror = e => {
    if (e.error !== "no-speech") { stopRecording(); statusText.textContent = "Error: " + e.error; }
  };
  recognition.onend = () => { if (isRecording) recognition.start(); };
  recognition.start();
  resetSilenceTimer();
}

function stopRecording() {
  isRecording = false;
  clearTimeout(silenceTimer);
  if (recognition) { recognition.onend = null; recognition.stop(); }
  micBtn.classList.remove("recording");
  statusText.textContent = "Selesai. Tekan lagi untuk melanjutkan.";
  statusText.classList.remove("active");
}

micBtn.addEventListener("click", () => { if (isRecording) stopRecording(); else startRecording(); });

// ── Punctuation toolbar ──────────────────────────────────────
document.querySelectorAll(".punct-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const insert = btn.dataset.insert;
    accumulated = accumulated.trimEnd() + insert;
    renderOriginal();
    scheduleTranslate();
  });
});

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
  renderOriginal();
  translatedText.textContent = "Terjemahan akan muncul di sini...";
  translatedText.classList.add("placeholder");
  ttsBtn.classList.remove("visible");
  speechSynthesis.cancel(); isSpeaking = false;
});

// ── Sync status ──────────────────────────────────────────────
function setSyncStatus(state) {
  const icons  = { syncing: "ti-loader-2", ok: "ti-cloud-check", error: "ti-cloud-x" };
  const labels = { syncing: "Menyimpan...", ok: "Tersinkron", error: "Gagal sync" };
  syncStatus.className = "sync-status " + state;
  syncStatus.innerHTML = `<i class="ti ${icons[state]}"></i><span>${labels[state]}</span>`;
}

// ── Save ─────────────────────────────────────────────────────
saveBtn.addEventListener("click", async () => {
  const orig  = accumulated.trim();
  const trans = lastTranslated.trim();
  if (!orig && !trans) { alert("Belum ada teks! Baca novel dulu."); return; }
  setSyncStatus("syncing");
  try {
    await saveEntry({
      bookTitle:  bookTitleInput.value.trim() || "Tanpa Judul",
      chapter:    chapterInput.value.trim()   || "Tanpa Bab",
      original:   orig,
      translated: trans,
      lang:       targetLang.options[targetLang.selectedIndex].text
    });
    setSyncStatus("ok");
    saveToast.classList.add("show");
    setTimeout(() => saveToast.classList.remove("show"), 2500);
  } catch (err) {
    setSyncStatus("error");
    alert("Gagal menyimpan: " + err.message);
  }
});

// ── Helpers ──────────────────────────────────────────────────
function escHtml(str) {
  return String(str || "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function highlight(text, q) {
  if (!q) return escHtml(text);
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return escHtml(text).replace(new RegExp(`(${esc})`, "gi"), '<mark class="highlight">$1</mark>');
}
function groupBy(arr, key) {
  return arr.reduce((map, item) => {
    const k = item[key] || "Tanpa " + key;
    if (!map[k]) map[k] = [];
    map[k].push(item); return map;
  }, {});
}

// ── Edit Modal ───────────────────────────────────────────────
let editingId = null;

function openEditModal(entry) {
  editingId = entry.id;
  editOriginal.value   = entry.original   || "";
  editTranslated.value = entry.translated || "";
  editModal.classList.add("open");
}
function closeEditModal() {
  editModal.classList.remove("open");
  editingId = null;
}
modalClose.addEventListener("click", closeEditModal);
modalCancel.addEventListener("click", closeEditModal);
editModal.addEventListener("click", e => { if (e.target === editModal) closeEditModal(); });

modalSave.addEventListener("click", async () => {
  if (!editingId) return;
  setSyncStatus("syncing");
  try {
    await updateEntry(editingId, { original: editOriginal.value, translated: editTranslated.value });
    setSyncStatus("ok");
    closeEditModal();
    renderLibrary(searchInput.value);
  } catch (err) {
    setSyncStatus("error");
    alert("Gagal menyimpan: " + err.message);
  }
});

// ── Library ──────────────────────────────────────────────────
let allEntries = [];

async function renderLibrary(searchQ = "") {
  libContent.innerHTML = `<div class="spinner"><i class="ti ti-loader-2"></i>Memuat perpustakaan...</div>`;
  try { allEntries = await getAllEntries(); }
  catch {
    libContent.innerHTML = `<div class="lib-empty"><i class="ti ti-wifi-off"></i><p>Gagal memuat data</p><span>Cek koneksi internet lalu muat ulang</span></div>`;
    return;
  }

  const q = searchQ.toLowerCase().trim();
  const filtered = q
    ? allEntries.filter(e =>
        (e.bookTitle||"").toLowerCase().includes(q) ||
        (e.chapter  ||"").toLowerCase().includes(q) ||
        (e.original ||"").toLowerCase().includes(q) ||
        (e.translated||"").toLowerCase().includes(q))
    : allEntries;

  const books = Object.keys(groupBy(allEntries, "bookTitle")).length;
  libCount.textContent = allEntries.length > 0 ? `${books} buku · ${allEntries.length} catatan` : "";

  if (filtered.length === 0) {
    libContent.innerHTML = q
      ? `<div class="lib-empty"><i class="ti ti-search-off"></i><p>Tidak ada hasil untuk "${escHtml(q)}"</p><span>Coba kata kunci lain</span></div>`
      : `<div class="lib-empty"><i class="ti ti-books"></i><p>Perpustakaan masih kosong</p><span>Simpan hasil terjemahan dari halaman Baca</span></div>`;
    return;
  }

  const byBook = groupBy(filtered, "bookTitle");
  const list   = document.createElement("div");
  list.className = "book-list";

  Object.entries(byBook).forEach(([bookTitle, bookEntries]) => {
    const card = document.createElement("div");
    card.className = "book-card";

    const last    = bookEntries[0];
    const dateStr = new Date(last.createdAt).toLocaleString("id-ID", { dateStyle:"medium", timeStyle:"short" });
    const byChapter = groupBy(bookEntries, "chapter");
    const chapCount = Object.keys(byChapter).length;

    card.innerHTML = `
      <div class="book-card-header">
        <div class="book-icon"><i class="ti ti-book"></i></div>
        <div class="book-info">
          <div class="book-title">${highlight(bookTitle, q)}</div>
          <div class="book-meta">${chapCount} bab · ${bookEntries.length} catatan · terakhir ${dateStr}</div>
        </div>
        <div class="book-chevron"><i class="ti ti-chevron-down"></i></div>
      </div>
      <div class="book-entries">
        <div class="book-toolbar">
          <button class="book-del-btn" data-title="${escHtml(bookTitle)}">
            <i class="ti ti-trash"></i> Hapus semua catatan buku ini
          </button>
        </div>
        ${Object.entries(byChapter).map(([chapter, chapEntries]) => `
          <div class="chapter-block">
            <div class="chapter-header">
              <i class="ti ti-list"></i>
              <span class="chapter-title">${highlight(chapter, q)}</span>
              <span class="chapter-meta">${chapEntries.length} catatan</span>
              <div class="chapter-chevron"><i class="ti ti-chevron-down"></i></div>
            </div>
            <div class="chapter-entries">
              ${chapEntries.map(entry => {
                const d = new Date(entry.createdAt).toLocaleString("id-ID", { dateStyle:"medium", timeStyle:"short" });
                return `
                <div class="entry-item" data-id="${entry.id}">
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
                    <button class="entry-edit-btn" data-id="${entry.id}"><i class="ti ti-edit"></i> Edit</button>
                    <button class="entry-del-btn"  data-id="${entry.id}"><i class="ti ti-trash"></i> Hapus</button>
                  </div>
                </div>`;
              }).join("")}
            </div>
          </div>`
        ).join("")}
      </div>`;

    // Toggle book
    card.querySelector(".book-card-header").addEventListener("click", () => card.classList.toggle("open"));

    // Toggle chapters
    card.querySelectorAll(".chapter-header").forEach(ch => {
      ch.addEventListener("click", () => ch.closest(".chapter-block").classList.toggle("open"));
    });

    // Edit entry
    card.querySelectorAll(".entry-edit-btn").forEach(btn => {
      btn.addEventListener("click", async e => {
        e.stopPropagation();
        const entry = allEntries.find(en => en.id === btn.dataset.id);
        if (entry) openEditModal(entry);
      });
    });

    // Delete entry
    card.querySelectorAll(".entry-del-btn").forEach(btn => {
      btn.addEventListener("click", async e => {
        e.stopPropagation();
        if (!confirm("Hapus catatan ini?")) return;
        setSyncStatus("syncing");
        try { await deleteEntry(btn.dataset.id); setSyncStatus("ok"); renderLibrary(searchInput.value); }
        catch { setSyncStatus("error"); }
      });
    });

    // Delete book
    card.querySelector(".book-del-btn").addEventListener("click", async e => {
      e.stopPropagation();
      if (!confirm(`Hapus semua catatan untuk "${bookTitle}"?`)) return;
      setSyncStatus("syncing");
      try { await deleteBook(bookTitle); setSyncStatus("ok"); renderLibrary(searchInput.value); }
      catch { setSyncStatus("error"); }
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
