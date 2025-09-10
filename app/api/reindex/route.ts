import { NextRequest, NextResponse } from "next/server";
import { stack } from "@/lib/contentstack";
import { getEmbedding } from "@/lib/embeddings";
import { index } from "@/lib/pinecone";
import type { Page } from "@/lib/types";

export const runtime = "nodejs";

// 🟢 Utility: Build clean text for embedding
function entryToText(entry: any): string {
  const parts: string[] = [];
  for (const key of Object.keys(entry)) {
    const val = entry[key];
    if (typeof val === "string") parts.push(val);
    if (Array.isArray(val)) {
      for (const item of val) {
        if (typeof item === "string") parts.push(item);
        if (typeof item === "object") parts.push(entryToText(item));
      }
    }
    if (typeof val === "object" && val !== null) {
      parts.push(entryToText(val));
    }
  }
  return parts.join(" \n").trim();
}

// 🟢 Sanitize metadata to Pinecone-accepted types
// Pinecone supports string, number, boolean, or list of strings.
function sanitizeMetadata(obj: Record<string, any>): Record<string, string | number | boolean | string[]> {
  const out: Record<string, string | number | boolean | string[]> = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === null || v === undefined) continue;
    const t = typeof v;
    if (t === "string" || t === "number" || t === "boolean") {
      out[k] = v as any;
      continue;
    }
    if (Array.isArray(v)) {
      // Ensure list of strings only
      const arr = v.map((item) => (typeof item === "string" ? item : JSON.stringify(item)));
      out[k] = arr;
      continue;
    }
    // Objects: store as JSON string to comply
    try {
      out[k] = JSON.stringify(v);
    } catch {
      // Fallback to toString if serialization fails
      out[k] = String(v);
    }
  }
  return out;
}

// 🟢 Resolve correct Management API host based on region (NA/EU)
function getManagementHost(): string {
  const override = process.env.NEXT_PUBLIC_CONTENTSTACK_MANAGEMENT_HOST;
  if (override) return override;

  const region = (process.env.NEXT_PUBLIC_CONTENTSTACK_REGION || "NA").toUpperCase();
  // NA default: api.contentstack.io, EU: eu-api.contentstack.com
  return region === "EU" ? "eu-api.contentstack.com" : "api.contentstack.io";
}

// 🟢 Fetch all content types dynamically via Management API
async function getContentTypes(): Promise<string[]> {
  const apiKey = stack.config.apiKey;
  const mgmtToken = process.env.CONTENTSTACK_MANAGEMENT_TOKEN as string | undefined;
  if (!apiKey) throw new Error("Missing NEXT_PUBLIC_CONTENTSTACK_API_KEY");
  if (!mgmtToken) throw new Error("Missing CONTENTSTACK_MANAGEMENT_TOKEN in env");

  const host = getManagementHost();
  const url = `https://${host}/v3/content_types`;

  const res = await fetch(url, {
    headers: {
      api_key: apiKey,
      authorization: mgmtToken,
    },
    // Avoid any CDN caching issues
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to list content types (${res.status}): ${text || res.statusText}`);
  }

  const json = await res.json();
  const types = json.content_types?.map((ct: any) => ct.uid) || [];
  return types;
}


// 🟢 Main reindex function
async function reindexAll() {
  const types = await getContentTypes(); // auto-discover content types
  let total = 0;

  for (const type of types) {
    const res = await stack.contentType(type).entry().query().find<any>();
    const entries: any[] = (res as any)?.entries || [];

    const records = [];
    for (const entry of entries) {
      if (!entry?.uid) continue;
      const text = entryToText(entry);
      if (!text) continue;
      const vector = await getEmbedding(text);
      records.push({
        id: `${type}_${entry.uid}`, // include type to avoid collisions
        values: vector,
        metadata: sanitizeMetadata({
          type,
          ...entry,
        }),
      });
    }

    if (records.length > 0) {
      await index.upsert(records as any);
      total += records.length;
    }
  }

  return { indexed: total };
}

export async function POST(_req: NextRequest) {
  try {
    const { indexed } = await reindexAll();
    return NextResponse.json({ ok: true, indexed });
  } catch (err: any) {
    console.error("Reindex error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function GET() {
  return POST(null as any); // same behavior for browser GET
}
