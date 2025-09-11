// Shared text utilities for building embedding text and sanitizing metadata

// Build clean text for embedding by concatenating important fields
// Includes: titles, descriptions, body, rich text, single line fields, tags, nested blocks, etc.
export function entryToText(entry: any): string {
  const collected = new Set<string>();

  const skipKeys = new Set<string>([
    "uid",
    "url",
    "href",
    "filename",
    "content_type",
    "file_size",
    "created_at",
    "updated_at",
    "created_by",
    "updated_by",
    "publish_details",
    "_version",
    "$",
    "_metadata",
  ]);

  const looksLikeUrl = (s: string) => /^(https?:)?\/\//i.test(s);
  const stripHtml = (s: string) => s.replace(/<[^>]*>/g, " ");
  const clean = (s: string) => stripHtml(String(s)).replace(/\s+/g, " ").trim();

  const visit = (obj: any) => {
    if (obj == null) return;
    if (typeof obj === "string") {
      const t = clean(obj);
      if (t && !looksLikeUrl(t)) collected.add(t);
      return;
    }
    if (Array.isArray(obj)) {
      for (const item of obj) visit(item);
      return;
    }
    if (typeof obj === "object") {
      for (const [key, val] of Object.entries(obj)) {
        const k = (key || "").toLowerCase();
        if (k.startsWith("$") || k.startsWith("_")) continue;
        if (skipKeys.has(k)) continue;
        if (typeof val === "string") {
          const t = clean(val);
          if (t && !looksLikeUrl(t)) collected.add(t);
        } else if (Array.isArray(val)) {
          for (const item of val) visit(item);
        } else if (val && typeof val === "object") {
          visit(val);
        }
      }
    }
  };

  visit(entry);
  const text = Array.from(collected).join(" \n").trim();
  const maxChars = Number(process.env.REINDEX_TEXT_MAX_CHARS || 20000);
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

// Extract canonical metadata fields for display/use
export function extractMetadata(entry: any, type: string) {
  const title =
    entry.title ||
    entry.heading ||
    entry.page_title ||
    entry.meta_title ||
    entry.name ||
    "Untitled";

  const description =
    entry.description ||
    entry.summary ||
    entry.body ||
    entry.meta_description ||
    "";

  const url = entry.url || `/${type}/${entry.uid}`;
  return { title, description, url };
}

// Restrict metadata to Pinecone-compatible primitives
export function sanitizeMetadata(obj: Record<string, any>): Record<string, string | number | boolean | string[]> {
  const out: Record<string, string | number | boolean | string[]> = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === null || v === undefined) continue;
    const t = typeof v;
    if (t === "string" || t === "number" || t === "boolean") {
      out[k] = v as any;
      continue;
    }
    if (Array.isArray(v)) {
      const arr = v.map((item) => (typeof item === "string" ? item : JSON.stringify(item)));
      out[k] = arr;
      continue;
    }
    try {
      out[k] = JSON.stringify(v);
    } catch {
      out[k] = String(v);
    }
  }
  return out;
}
