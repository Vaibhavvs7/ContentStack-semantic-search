// lib/vectorStore.ts
import fs from "fs";

export interface VectorEntry {
  id: string;             // unique id, e.g. entry uid
  contentType: string;    // which content type it belongs to
  locale: string;         // locale code
  text: string;           // raw text used for embedding
  embedding: number[];    // embedding vector
  metadata?: any;         // extra fields for display (title, url, etc.)
}

const storePath = process.env.VECTOR_STORE_PERSIST_PATH || "./vectorStore.json";
let entries: VectorEntry[] = [];

/** Load store from disk */
export function loadStore() {
  if (fs.existsSync(storePath)) {
    entries = JSON.parse(fs.readFileSync(storePath, "utf8"));
  } else {
    entries = [];
  }
  return entries;
}

/** Save store to disk */
export function saveStore() {
  fs.writeFileSync(storePath, JSON.stringify(entries, null, 2), "utf8");
}

/** Clear and set entries */
export function setEntries(newEntries: VectorEntry[]) {
  entries = newEntries;
  saveStore();
}

/** Add/update a single entry */
export function upsertEntry(e: VectorEntry) {
  const idx = entries.findIndex((x) => x.id === e.id);
  if (idx >= 0) entries[idx] = e;
  else entries.push(e);
  saveStore();
}

/** Remove a single entry by id */
export function removeEntry(id: string) {
  const before = entries.length;
  entries = entries.filter((x) => x.id !== id);
  if (entries.length !== before) saveStore();
}

/** Get all entries (in memory) */
export function getEntries() {
  return entries;
}

/** Compute cosine similarity between two vectors */
function cosineSim(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Search entries by query vector */
export function searchEntries(queryVec: number[], topK = 5) {
  const scored = entries.map((e) => ({
    entry: e,
    score: cosineSim(queryVec, e.embedding),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

// load into memory at startup
loadStore();

// Convenience aliases for compatibility with older imports
export const upsert = upsertEntry;
export const remove = removeEntry;
export const persistStore = saveStore;
