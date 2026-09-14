import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDq0qJCEMxIYCIB72eMyhx_QZK_UT7OesE",
  authDomain: "novel-reader-6402f.firebaseapp.com",
  databaseURL: "https://novel-reader-6402f-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "novel-reader-6402f",
  storageBucket: "novel-reader-6402f.firebasestorage.app",
  messagingSenderId: "618340317463",
  appId: "1:618340317463:web:9f6918d2a4fdc5412e1f52",
  measurementId: "G-8WPKH927M5"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ── Save entry ─────────────────────────────────────────────
export async function saveEntry({ bookTitle, original, translated, lang }) {
  const entry = {
    bookTitle: bookTitle || "Tanpa Judul",
    original,
    translated,
    lang,
    createdAt: new Date().toISOString()
  };
  const docRef = await addDoc(collection(db, "entries"), entry);
  return { id: docRef.id, ...entry };
}

// ── Get all entries ────────────────────────────────────────
export async function getAllEntries() {
  const q = query(collection(db, "entries"), orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Delete one entry ───────────────────────────────────────
export async function deleteEntry(id) {
  await deleteDoc(doc(db, "entries", id));
}

// ── Delete all entries for a book ─────────────────────────
export async function deleteBook(bookTitle) {
  const all = await getAllEntries();
  const toDelete = all.filter(e => e.bookTitle === bookTitle);
  await Promise.all(toDelete.map(e => deleteEntry(e.id)));
}
