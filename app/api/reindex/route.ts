import { NextRequest, NextResponse } from "next/server";
import { stack } from "@/lib/contentstack";
import { getEmbedding } from "@/lib/embeddings";
import { index } from "@/lib/pinecone";
import { entryToText, extractMetadata, sanitizeMetadata } from "@/lib/text";

export const runtime = "nodejs";

// Moved helpers to '@/lib/text'

// 🟢 Resolve correct Management API host based on region
function getManagementHost(): string {
  const override = process.env.NEXT_PUBLIC_CONTENTSTACK_MANAGEMENT_HOST;
  if (override) return override;

  const region = (process.env.NEXT_PUBLIC_CONTENTSTACK_REGION || "NA").toUpperCase();
  return region === "EU" ? "eu-api.contentstack.com" : "api.contentstack.io";
}

// 🟢 Fetch all content types dynamically
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
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to list content types (${res.status}): ${text || res.statusText}`);
  }

  const json = await res.json();
  return json.content_types?.map((ct: any) => ct.uid) || [];
}

// 🟢 Main reindex function
async function reindexAll() {
  const types = await getContentTypes();
  let total = 0;

  // Respect optional Pinecone namespace via env for isolation (e.g., per env or tenant)
  const targetIndex: any = process.env.PINECONE_NAMESPACE
    ? (index as any).namespace(process.env.PINECONE_NAMESPACE)
    : index;

  for (const type of types) {
    // Paginate through entries to ensure all items are indexed
    const entries: any[] = [];
    let skip = 0;
    const limit = 100;
    while (true) {
      const res = await stack
        .contentType(type)
        .entry()
        .query()
        .skip(skip)
        .limit(limit)
        .find<any>();
      const batch: any[] = (res as any)?.entries || [];
      if (batch.length === 0) break;
      entries.push(...batch);
      if (batch.length < limit) break;
      skip += limit;
    }

    const records = [];
    for (const entry of entries) {
      if (!entry?.uid) continue;
      const text = entryToText(entry);
      if (!text) continue;

      const vector = await getEmbedding(text);
      const { title, description, url } = extractMetadata(entry, type);

      records.push({
        id: `${type}_${entry.uid}`,
        values: vector,
        metadata: sanitizeMetadata({
          // spread original entry first, so canonical fields override
          ...entry,
          type,
          uid: entry.uid,
          url,
          title,
          description,
        }),
      });

    }

    if (records.length > 0) {
      await targetIndex.upsert(records as any);
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
  return POST(null as any);
}
