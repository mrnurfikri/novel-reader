import { saveEntry, getAllEntries, updateEntry, deleteEntry, deleteBook } from "./firebase.js";

// ── Helpers ───────────────────────────────────────────────────
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

// ── Elements ──────────────────────────────────────────────────
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
const btnParagraph   = document.getElementById("btnParagraph");
const settingsBtn    = document.getElementById("settingsBtn");
const settingsPanel  = document.getElementById("settingsPanel");

// ── Settings ──────────────────────────────────────────────────
const toggleTTS       = document.getElementById("toggleTTS");
const toggleAutoSave  = document.getElementById("toggleAutoSave");
const toggleAutoReset = document.getElementById("toggleAutoReset");
const ttsDelay        = document.getElementById("ttsDelay");

// Load saved settings
function loadSettings() {
  ["toggleTTS","toggleAutoSave","toggleAutoReset"].forEach(id => {
    const v = localStorage.getItem(id);
    if (v !== null) document.getElementById(id).checked = v === "true";
  });
  const delay = localStorage.getItem("ttsDelay");
  if (delay !== null) ttsDelay.value = delay;
}
function saveSetting(key, val) { localStorage.setItem(key, val); }

[toggleTTS, toggleAutoSave, toggleAutoReset].forEach(el =>
  el.addEventListener("change", () => saveSetting(el.id, el.checked))
);
ttsDelay.addEventListener("change", () => saveSetting("ttsDelay", ttsDelay.value));
loadSettings();

// Settings panel toggle
settingsBtn.addEventListener("click", () => {
  const open = settingsPanel.classList.toggle("open");
  settingsBtn.classList.toggle("active", open);
});
// Close panel when clicking outside
document.addEventListener("click", e => {
  if (!settingsPanel.contains(e.target) && !settingsBtn.contains(e.target)) {
    settingsPanel.classList.remove("open");
    settingsBtn.classList.remove("active");
  }
});

// ── Nav ───────────────────────────────────────────────────────
document.querySelectorAll(".nav-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("page-" + tab.dataset.page).classList.add("active");
    if (tab.dataset.page === "library") renderLibrary();
  });
});

// ── Speech ────────────────────────────────────────────────────
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SR) browserWarn.style.display = "flex";

let recognition       = null;
let isRecording       = false;
let accumulated       = "";
let transTimeout      = null;
let isSpeaking        = false;
let lastTranslated    = "";
let silenceTimer      = null;
let isEditingOriginal = false;
let ttsDelayTimer     = null;
let sentenceQueue     = false; // prevent double-trigger

const SENTENCE_END = /[.!?。]\s*$/;

const PUNCT_COMMANDS = {
  "comma"           : ", ",
  "period"          : ". ",
  "full stop"       : ". ",
  "exclamation"     : "! ",
  "exclamation mark": "! ",
  "question mark"   : "? ",
  "colon"           : ": ",
  "semicolon"       : "; ",
  "quote"           : "\u201c",
  "open quote"      : "\u201c",
  "close quote"     : "\u201d ",
  "end quote"       : "\u201d ",
  "new paragraph"   : "¶NEW¶",
  "new line"        : "¶NEW¶",
  "paragraph"       : "¶NEW¶",
};

function applyPunctCommand(t) {
  const lower = t.trim().toLowerCase();
  for (const [cmd, sym] of Object.entries(PUNCT_COMMANDS)) {
    if (lower === cmd) return { isPunct: true, symbol: sym };
  }
  return { isPunct: false };
}

// ── Render ────────────────────────────────────────────────────
function renderOriginal() {
  if (isEditingOriginal) return;
  if (!accumulated) {
    originalText.innerHTML = "Teks yang kamu baca akan muncul di sini...";
    originalText.classList.add("placeholder");
    return;
  }
  originalText.classList.remove("placeholder");
  const paras = accumulated.split("¶NEW¶").map(p => p.trim()).filter(Boolean);
  originalText.innerHTML = paras.length
    ? paras.map(p => `<p>${escHtml(p)}</p>`).join("")
    : `<p>${escHtml(accumulated)}</p>`;
}

function syncFromEditable() {
  const paras = Array.from(originalText.querySelectorAll("p"));
  accumulated = paras.length
    ? paras.map(p => p.textContent).join("¶NEW¶") + " "
    : originalText.textContent;
}

originalText.addEventListener("focus", () => { isEditingOriginal = true; });
originalText.addEventListener("blur",  () => { isEditingOriginal = false; syncFromEditable(); });

// ── Translate ─────────────────────────────────────────────────
async function translate(text) {
  if (!text.trim()) return;
  loadingBar.classList.add("active");
  translatedText.textContent = "";
  translatedText.classList.add("placeholder");
  ttsBtn.classList.remove("visible");

  const lang      = targetLang.value;
  const cleanText = text.replace(/¶NEW¶/g, "\n\n");
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${lang}&dt=t&q=${encodeURIComponent(cleanText)}`;
  try {
    const res    = await fetch(url);
    const data   = await res.json();
    const result = data[0].map(s => s[0]).join("");
    lastTranslated = result;
    translatedText.textContent = result;
    translatedText.classList.remove("placeholder");
    ttsBtn.classList.add("visible");
    // Schedule auto-speak with user-set delay
    if (toggleTTS.checked) scheduleAutoSpeak(result);
  } catch {
    translatedText.textContent = "Terjemahan gagal. Cek koneksi internet.";
    translatedText.classList.add("placeholder");
  } finally {
    loadingBar.classList.remove("active");
  }
}

function scheduleTranslate() {
  clearTimeout(transTimeout);
  transTimeout = setTimeout(() => translate(accumulated.trim()), 800);
}

// ── TTS ───────────────────────────────────────────────────────
const langMap = { id:"id-ID", ms:"ms-MY", jv:"jv-ID", su:"su-ID", "zh-CN":"zh-CN", ar:"ar-SA" };

function speakText(text) {
  if (!text) return;
  const utt  = new SpeechSynthesisUtterance(text);
  utt.lang   = langMap[targetLang.value] || "id-ID";
  isSpeaking = true;
  ttsBtn.innerHTML = '<i class="ti ti-player-pause"></i> Stop';
  utt.onend  = () => { isSpeaking = false; ttsBtn.innerHTML = '<i class="ti ti-volume"></i> Putar'; };
  speechSynthesis.cancel();
  speechSynthesis.speak(utt);
}

function scheduleAutoSpeak(text) {
  clearTimeout(ttsDelayTimer);
  const delay = parseInt(ttsDelay.value) || 0;
  ttsDelayTimer = setTimeout(() => {
    if (isRecording) speakText(text); // only speak if still in reading session
  }, delay);
}

ttsBtn.addEventListener("click", () => {
  if (!lastTranslated) return;
  if (isSpeaking) {
    clearTimeout(ttsDelayTimer);
    speechSynthesis.cancel();
    isSpeaking = false;
    ttsBtn.innerHTML = '<i class="ti ti-volume"></i> Putar';
    return;
  }
  speakText(lastTranslated);
});

// ── Auto save + reset per sentence ───────────────────────────
async function handleSentenceEnd() {
  if (sentenceQueue) return; // debounce
  sentenceQueue = true;
  setTimeout(() => { sentenceQueue = false; }, 1500);

  const orig  = accumulated.replace(/¶NEW¶/g, "\n\n").trim();
  const trans = lastTranslated.trim();
  if (!orig) return;

  if (toggleAutoSave.checked) {
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
      setTimeout(() => saveToast.classList.remove("show"), 1500);
    } catch { setSyncStatus("error"); return; }
  }

  if (toggleAutoReset.checked) {
    // Wait a beat so TTS can finish its current word before reset
    setTimeout(() => {
      accumulated    = "";
      lastTranslated = "";
      renderOriginal();
      translatedText.textContent = "Terjemahan akan muncul di sini...";
      translatedText.classList.add("placeholder");
      ttsBtn.classList.remove("visible");
    }, 400);
  }
}

// ── Silence → auto period after 3s ───────────────────────────
function resetSilenceTimer() {
  clearTimeout(silenceTimer);
  silenceTimer = setTimeout(() => {
    if (accumulated && !/[.,!?:;\n\u201d¶]$/.test(accumulated.trimEnd())) {
      accumulated = accumulated.trimEnd() + ". ";
      renderOriginal();
      scheduleTranslate();
      setTimeout(handleSentenceEnd, 900);
    }
  }, 3000);
}

// ── Recording ─────────────────────────────────────────────────
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
          accumulated = accumulated.trimEnd() + symbol;
        } else {
          accumulated += t + " ";
        }
        resetSilenceTimer();
        scheduleTranslate();
        // Trigger sentence-end handler when .!? detected
        if (SENTENCE_END.test(accumulated.replace(/¶NEW¶/g, ""))) {
          setTimeout(handleSentenceEnd, 900);
        }
      } else {
        interim = t;
      }
    }
    if (!isEditingOriginal) {
      const preview = accumulated + interim;
      const paras   = preview.split("¶NEW¶").map(p => p.trim()).filter(Boolean);
      originalText.innerHTML = paras.length
        ? paras.map(p => `<p>${escHtml(p)}</p>`).join("")
        : `<p>${escHtml(preview)}</p>`;
      originalText.classList.remove("placeholder");
    }
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
  clearTimeout(ttsDelayTimer);
  if (recognition) { recognition.onend = null; recognition.stop(); }
  micBtn.classList.remove("recording");
  statusText.textContent = "Selesai. Tekan lagi untuk melanjutkan.";
  statusText.classList.remove("active");
}

micBtn.addEventListener("click", () => { if (isRecording) stopRecording(); else startRecording(); });

// ── Punctuation toolbar ───────────────────────────────────────
document.querySelectorAll(".punct-btn").forEach(btn => {
  if (btn.id === "btnParagraph") return;
  btn.addEventListener("click", () => {
    accumulated = accumulated.trimEnd() + btn.dataset.insert;
    renderOriginal();
    scheduleTranslate();
    if (SENTENCE_END.test(accumulated.replace(/¶NEW¶/g, ""))) {
      setTimeout(handleSentenceEnd, 900);
    }
  });
});

btnParagraph.addEventListener("click", () => {
  accumulated = accumulated.trimEnd() + "¶NEW¶";
  renderOriginal();
  scheduleTranslate();
});

// ── Clear ─────────────────────────────────────────────────────
clearBtn.addEventListener("click", () => {
  accumulated = ""; lastTranslated = "";
  clearTimeout(ttsDelayTimer);
  renderOriginal();
  translatedText.textContent = "Terjemahan akan muncul di sini...";
  translatedText.classList.add("placeholder");
  ttsBtn.classList.remove("visible");
  speechSynthesis.cancel(); isSpeaking = false;
});

// ── Sync status ───────────────────────────────────────────────
function setSyncStatus(state) {
  const icons  = { syncing:"ti-loader-2", ok:"ti-cloud-check", error:"ti-cloud-x" };
  const labels = { syncing:"Menyimpan...", ok:"Tersinkron", error:"Gagal sync" };
  syncStatus.className = "sync-status " + state;
  syncStatus.innerHTML = `<i class="ti ${icons[state]}"></i><span>${labels[state]}</span>`;
}

// ── Manual save ───────────────────────────────────────────────
saveBtn.addEventListener("click", async () => {
  syncFromEditable();
  const orig  = accumulated.replace(/¶NEW¶/g, "\n\n").trim();
  const trans = lastTranslated.trim();
  if (!orig && !trans) { alert("Belum ada teks! Baca novel dulu."); return; }
  setSyncStatus("syncing");
  try {
    await saveEntry({
      bookTitle:  bookTitleInput.value.trim() || "Tanpa Judul",
      chapter:    chapterInput.value.trim()   || "Tanpa Bab",
      original:   orig, translated: trans,
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

// ── Edit Modal ────────────────────────────────────────────────
let editingId = null;
function openEditModal(entry) {
  editingId = entry.id;
  editOriginal.value   = entry.original   || "";
  editTranslated.value = entry.translated || "";
  editModal.classList.add("open");
}
function closeEditModal() { editModal.classList.remove("open"); editingId = null; }
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
  } catch (err) { setSyncStatus("error"); alert("Gagal menyimpan: " + err.message); }
});

// ── Library ───────────────────────────────────────────────────
let allEntries = [];

async function renderLibrary(searchQ = "") {
  libContent.innerHTML = `<div class="spinner"><i class="ti ti-loader-2"></i>Memuat perpustakaan...</div>`;
  try { allEntries = await getAllEntries(); }
  catch {
    libContent.innerHTML = `<div class="lib-empty"><i class="ti ti-wifi-off"></i><p>Gagal memuat data</p><span>Cek koneksi internet lalu muat ulang</span></div>`;
    return;
  }
  const q        = searchQ.toLowerCase().trim();
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
    const last      = bookEntries[0];
    const dateStr   = new Date(last.createdAt).toLocaleString("id-ID", { dateStyle:"medium", timeStyle:"short" });
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
          </div>`).join("")}
      </div>`;

    card.querySelector(".book-card-header").addEventListener("click", () => card.classList.toggle("open"));
    card.querySelectorAll(".chapter-header").forEach(ch => {
      ch.addEventListener("click", () => ch.closest(".chapter-block").classList.toggle("open"));
    });
    card.querySelectorAll(".entry-edit-btn").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const entry = allEntries.find(en => en.id === btn.dataset.id);
        if (entry) openEditModal(entry);
      });
    });
    card.querySelectorAll(".entry-del-btn").forEach(btn => {
      btn.addEventListener("click", async e => {
        e.stopPropagation();
        if (!confirm("Hapus catatan ini?")) return;
        setSyncStatus("syncing");
        try { await deleteEntry(btn.dataset.id); setSyncStatus("ok"); renderLibrary(searchInput.value); }
        catch { setSyncStatus("error"); }
      });
    });
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

let searchTimeout;
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => renderLibrary(searchInput.value), 300);
});
