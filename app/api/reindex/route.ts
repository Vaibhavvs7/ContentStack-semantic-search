import { NextRequest, NextResponse } from "next/server";
import { stack } from "@/lib/contentstack";
import { getEmbedding } from "@/lib/embeddings";
import { index } from "@/lib/pinecone";
import type { Page } from "@/lib/types";

// Ensure we run on the Node.js runtime (not Edge) because we use Node libs and env vars
export const runtime = "nodejs";

// Build a clean text blob from a Page entry for embedding
function pageToText(p: Page): string {
  const parts: string[] = [];
  if (p.title) parts.push(p.title);
  if (p.description) parts.push(p.description);
  if (p.rich_text) parts.push(p.rich_text);
  if (Array.isArray(p.blocks)) {
    for (const b of p.blocks) {
      const blk = (b as any)?.block as any;
      if (blk?.title) parts.push(String(blk.title));
      if (blk?.copy) parts.push(String(blk.copy));
    }
  }
  return parts.join(" \n").trim();
}

async function reindexAll() {
  // 1) Fetch all pages from Contentstack (published entries in current env)
  const res = await stack.contentType("page").entry().query().find<Page>();
  const pages: Page[] = (res as any)?.entries || [];

  // 2) Build embeddings
  const records: { id: string; values: number[]; metadata?: Record<string, any> }[] = [];
  for (const page of pages) {
    if (!page?.uid) continue;
    const text = pageToText(page);
    if (!text) continue;
    const vector = await getEmbedding(text);
    records.push({
      id: page.uid,
      values: vector,
      metadata: {
        title: page.title,
        description: page.description,
        body: page.rich_text,
        url: page.url,
      },
    });
  }

  // 3) Upsert into Pinecone (SDK v6 expects an array of vectors)
  if (records.length > 0) {
    await index.upsert(records as any);
  }

  return { indexed: records.length };
}

export async function POST(_req: NextRequest) {
  try {
    const { indexed } = await reindexAll();
    return NextResponse.json({ ok: true, indexed });
  } catch (err: any) {
    console.error("Reindex error:", err);
    const msg = err?.message || String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// Support GET so visiting /api/reindex in a browser works
export async function GET() {
  try {
    const { indexed } = await reindexAll();
    return NextResponse.json({ ok: true, indexed });
  } catch (err: any) {
    console.error("Reindex error:", err);
    const msg = err?.message || String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
