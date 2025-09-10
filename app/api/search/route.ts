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
    const searchRes = await index.query({
      topK: 5,
      vector: embedding,
      includeMetadata: true,
    });

    // 3️⃣ Format results
    const results = searchRes.matches?.map((m) => ({
      id: m.id,
      score: m.score,
      title: m.metadata?.title,
      description: m.metadata?.description,
      body: m.metadata?.body,
    }));

    return NextResponse.json({ ok: true, results });
  } catch (err: any) {
    console.error("Search error:", err);
    return NextResponse.json(
      { ok: false, error: err.message || "Search failed" },
      { status: 500 }
    );
  }
}
