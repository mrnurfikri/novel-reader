import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDq0qJCEMxIYCIB72eMyhx_QZK_UT7OesE",
  authDomain: "novel-reader-6402f.firebaseapp.com",
  projectId: "novel-reader-6402f",
  storageBucket: "novel-reader-6402f.firebasestorage.app",
  messagingSenderId: "618340317463",
  appId: "1:618340317463:web:9f6918d2a4fdc5412e1f52"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

export async function saveEntry({ bookTitle, chapter, original, translated, lang }) {
  const entry = { bookTitle: bookTitle || "Tanpa Judul", chapter: chapter || "Tanpa Bab", original, translated, lang, createdAt: new Date().toISOString() };
  const ref = await addDoc(collection(db, "entries"), entry);
  return { id: ref.id, ...entry };
}

export async function getAllEntries() {
  const q = query(collection(db, "entries"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function updateEntry(id, { original, translated }) {
  await updateDoc(doc(db, "entries", id), { original, translated, updatedAt: new Date().toISOString() });
}

export async function deleteEntry(id) {
  await deleteDoc(doc(db, "entries", id));
}

export async function deleteBook(bookTitle) {
  const all = await getAllEntries();
  await Promise.all(all.filter(e => e.bookTitle === bookTitle).map(e => deleteEntry(e.id)));
}
