// lib/embeddings.ts
// Provider-agnostic embedding wrapper for server-side use (app router / API routes)
// Supported providers: local, openai, gemini, mock
// Make sure to restart Next.js after editing .env.local

type NumArray = number[];

/**
 * Return an embedding for a single piece of text
 */
export async function getEmbedding(text: string): Promise<NumArray> {
  const provider = (process.env.EMBEDDING_PROVIDER || "openai").toLowerCase();

  // Local embedding server
  if (provider === "local") {
    const localUrl = process.env.EMBEDDING_LOCAL_URL || "http://127.0.0.1:8000/embed";
    const res = await fetch(localUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const js = await res.json();
    if (!res.ok) throw new Error(`Local embed error: ${JSON.stringify(js)}`);
    return js.embedding as number[];
  }

  // Mock embedding for UI/dev
  if (provider === "mock") {
    return deterministicMockEmbedding(text, 384);
  }

  // OpenAI embeddings
  if (provider === "openai") {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY not set in env");
    const model = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, input: text }),
    });
    const js = await res.json();
    if (!res.ok) throw new Error(`OpenAI embed error: ${JSON.stringify(js)}`);
    return js.data[0].embedding as number[];
  }

  // Gemini embeddings
  if (provider === "gemini") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY not set in env");

    // Google AI Studio Embeddings API
    // POST https://generativelanguage.googleapis.com/v1beta/models/{model}:embedContent?key=API_KEY
    const model = process.env.GEMINI_EMBEDDING_MODEL || "text-embedding-004";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:embedContent?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: {
          parts: [{ text }],
        },
      }),
    });
    const js = await res.json();
    if (!res.ok) throw new Error(`Gemini embed error: ${JSON.stringify(js)}`);

    // Response shape: { embedding: { values: number[] } }
    const values = js?.embedding?.values as number[] | undefined;
    if (!Array.isArray(values)) throw new Error("Gemini embed error: missing embedding values");
    return values;
  }

  throw new Error(`Unsupported EMBEDDING_PROVIDER: ${provider}`);
}

/**
 * Embed many texts (returns array of embeddings aligned with input order)
 */
export async function getEmbeddingsMany(texts: string[], batchSize = 16): Promise<NumArray[]> {
  const provider = (process.env.EMBEDDING_PROVIDER || "openai").toLowerCase();
  const out: NumArray[] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const embeddings = await Promise.all(batch.map((t) => getEmbedding(t)));
    out.push(...embeddings);
  }

  return out;
}

/** Simple deterministic mock embedding (sine-based) — useful for UI testing without any external dependency */
function deterministicMockEmbedding(text: string, dim = 384): number[] {
  let seed = 0;
  for (let i = 0; i < text.length; i++) seed += text.charCodeAt(i);
  const vec: number[] = new Array(dim);
  for (let i = 0; i < dim; i++) vec[i] = Math.sin(seed * 0.0001 + i * 0.01);
  return vec;
}
