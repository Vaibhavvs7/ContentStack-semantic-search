import { NextRequest, NextResponse } from "next/server";
import { getEmbedding } from "@/lib/embeddings";
import { index } from "@/lib/pinecone";

export async function POST(req: NextRequest) {
  try {
  const { query } = await req.json();

    if (!query) {
      return NextResponse.json(
        { ok: false, error: "Query is required" },
        { status: 400 }
      );
    }

  // 1️⃣ Generate embedding using configured provider (openai/gemini/local/mock)
  const embedding = await getEmbedding(query);

    // 2️⃣ Query Pinecone for similar vectors
    const TOP_K = Number(process.env.SEARCH_TOP_K || 10);
    const MIN_SCORE = Number(process.env.SEARCH_MIN_SCORE ?? 0.15); // cosine metric (0..1)

    // Use namespace if provided
    const targetIndex: any = process.env.PINECONE_NAMESPACE
      ? (index as any).namespace(process.env.PINECONE_NAMESPACE)
      : index;

    const searchRes = await targetIndex.query({
      topK: TOP_K,
      vector: embedding,
      includeMetadata: true,
    });

    // 3️⃣ Format results to include metadata object (page.tsx expects r.metadata.*)
  let results = (searchRes.matches || []).map((m: any) => ({
      id: m.id,
      score: m.score ?? 0,
      metadata: m.metadata || {},
    }));

    // 4️⃣ Apply a similarity threshold so nonsense queries can return no results
  results = results.filter((r: any) => typeof r.score === "number" && r.score >= MIN_SCORE);

    return NextResponse.json({ ok: true, results });
  } catch (err: any) {
    console.error("Search error:", err);
    return NextResponse.json(
      { ok: false, error: err.message || "Search failed" },
      { status: 500 }
    );
  }
}
