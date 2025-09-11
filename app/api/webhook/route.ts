// app/api/webhook/route.ts
import { getEmbedding } from "@/lib/embeddings";
import { upsert, remove, persistStore } from "@/lib/vectorStore";
import { index } from "@/lib/pinecone";
import { entryToText, extractMetadata, sanitizeMetadata } from "@/lib/text";
import { stack } from "@/lib/contentstack";
import crypto from "crypto";

export const runtime = "nodejs"; // ensure Node APIs (crypto, fs)

// Simple retry helper for transient errors (e.g., 429/5xx)
async function retry<T>(fn: () => Promise<T>, attempts = 3, baseDelayMs = 300): Promise<T> {
  let lastErr: any;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message || err);
      // Only retry on obvious transient cases
      if (!/(429|rate|timeout|ECONNRESET|5\d\d)/i.test(msg)) break;
      if (i < attempts) await new Promise(r => setTimeout(r, baseDelayMs * i));
    }
  }
  throw lastErr;
}

export async function POST(req: Request) {
  try {
    // 🔒 Verify signature
    const bodyText = await req.text();
    const secret = process.env.WEBHOOK_SECRET;
    if (secret) {
      const headerVal = req.headers.get("x-signature") || req.headers.get("x-secret") || "";
      let valid = false;
      if (headerVal) {
        // If header looks like a 64-char hex digest, treat it as HMAC; else treat as raw shared secret value
        if (/^[0-9a-f]{64}$/i.test(headerVal)) {
          const expected = crypto.createHmac("sha256", secret).update(bodyText).digest("hex");
          if (headerVal === expected) valid = true;
        }
        if (!valid && headerVal === secret) {
          valid = true; // plain shared secret comparison
        }
      }
      if (!valid) {
        return new Response("Invalid signature", { status: 401 });
      }
    }

    const payload = JSON.parse(bodyText);
    let event = payload.event || payload.data?.event || "";
    if (!event && payload?.data?.publish_details) {
      event = "entry.publish"; // heuristic fallback
    }
    // Normalize bare events (e.g. 'publish') to 'entry.publish'
    if (event && !event.startsWith("entry.")) {
      const bare = event.toLowerCase();
      const known = ["publish", "unpublish", "delete", "update", "create", "save", "republish"];
      if (known.includes(bare)) {
        event = `entry.${bare}`;
      }
    }

    // Normalize entry; webhook shapes differ. Prefer explicit 'entry' field if present
    const entry =
      payload.data?.entry ||
      payload.entry ||
      payload.data?.data?.entry || // nested fallback
      payload.data ||
      payload;
    const id = String(entry?.uid || entry?.entry_uid || payload?.data?.entry_uid || "");

    // Derive content type uid from multiple possible locations
    const contentType = String(
      entry?.content_type_uid ||
        entry?.content_type?.uid ||
        payload?.content_type_uid ||
        payload?.content_type?.uid ||
        payload?.data?.content_type_uid ||
        payload?.data?.content_type?.uid ||
        payload?.module || // occasional key in some custom integrations
        entry?.content_type ||
        ""
    );

    if (!id) {
      return new Response("Missing entry uid", { status: 400 });
    }

    // 🟢 Handle publish only (avoid indexing drafts/saves)
  console.log("[webhook] normalized event", { event });
  if (event.includes("entry.publish")) {
      console.log("[webhook] publish event received", { id, contentType, event });
      // Validate environment (if provided) matches target environment
      const targetEnv = process.env.NEXT_PUBLIC_CONTENTSTACK_ENVIRONMENT?.trim();
      const publishDetails = entry?.publish_details || payload?.data?.publish_details || {};
      const publishEnvUid = publishDetails.environment || publishDetails.environment_uid || entry?.environment;
      const publishEnvName = publishDetails.environment_name || publishDetails.environmentName;
      const matchesEnv = !targetEnv ||
        [publishEnvUid, publishEnvName].filter(Boolean).some((v: any) => String(v).toLowerCase() === targetEnv.toLowerCase());
      if (!matchesEnv) {
        console.log("[webhook] environment mismatch", { publishEnvUid, publishEnvName, targetEnv });
        return new Response(
          JSON.stringify({ ok: true, ignored: `environment mismatch: ${publishEnvUid || publishEnvName}` }),
          { status: 200 }
        );
      }

      // Re-fetch fresh published entry via Delivery API to ensure final state
      let fresh = entry;
      try {
        if (id && contentType && contentType !== "entry") {
          // Assumption: SDK supports .contentType(uid).entry(id).fetch()
            // If this fails we fallback to payload entry
          const fetched: any = await (stack as any)
            .contentType(contentType)
            .entry(id)
            .fetch();
          if (fetched) fresh = fetched;
        }
      } catch (e) {
        console.warn("[webhook] fetch latest entry failed, using payload", { error: (e as any)?.message });
      }

      const text = entryToText(fresh);
      if (!text) {
        console.log("[webhook] no text extracted, skipping", { id, contentType });
        return new Response(JSON.stringify({ ok: true, ignored: "no text extracted" }), { status: 200 });
      }
      const embedding = await getEmbedding(text);

      const compositeId = `${contentType}_${id}`;

      // Upsert local (use composite id to avoid cross-type collisions)
      upsert({
        id: compositeId,
        contentType,
        locale: fresh.locale || fresh.publish_details?.locale || "en-us",
        text,
        embedding,
        metadata: { title: fresh.title },
      });
      persistStore();

      const targetIndex: any = process.env.PINECONE_NAMESPACE
        ? (index as any).namespace(process.env.PINECONE_NAMESPACE)
        : index;

      const { title, description, url } = extractMetadata(fresh, contentType || "content");

      // Build richer metadata similar to reindex route but limit to safe keys
      const locale = fresh.locale || fresh.publish_details?.locale || "en-us";
      // Select a subset of primitive / short fields to avoid oversize metadata
      const extra: Record<string, any> = {};
      const candidateKeys = [
        "title",
        "description",
        "summary",
        "url",
        "slug",
        "locale",
        "uid",
        "_version",
        "updated_at",
        "created_at",
      ];
      for (const k of candidateKeys) {
        if (fresh[k] != null && typeof fresh[k] !== "object") extra[k] = fresh[k];
      }
      // Include a short snippet of the embedding text for debugging/search preview
      extra.snippet = (entryToText(fresh) || "").slice(0, 300);

      const metadata = sanitizeMetadata({
        ...extra,
        type: contentType || "content",
        uid: id,
        title,
        description,
        url,
        locale,
      });

      console.log("[webhook] upserting to Pinecone", { id: compositeId, dim: embedding.length, metaKeys: Object.keys(metadata) });
      await retry(() =>
        targetIndex.upsert([
          {
            id: compositeId,
            values: embedding,
            metadata,
          },
        ])
      );
      console.log("[webhook] upsert complete", { id: compositeId });

      return new Response(JSON.stringify({ ok: true, action: "upsert", id: compositeId }), { status: 200 });
    }

    // 🔴 Handle unpublish/delete
    if (event.includes("entry.unpublish") || event.includes("entry.delete")) {
      console.log("[webhook] delete/unpublish event", { id, contentType, event });
      const compositeId = `${contentType}_${id}`;
      // Remove both possible ids for safety
      remove(compositeId);
      remove(id); // legacy
      persistStore();

      const targetIndex: any = process.env.PINECONE_NAMESPACE
        ? (index as any).namespace(process.env.PINECONE_NAMESPACE)
        : index;
  await retry(() => targetIndex.delete({ ids: [compositeId] }));
  console.log("[webhook] delete complete", { id: compositeId });
      return new Response(
        JSON.stringify({ ok: true, action: "delete", id: compositeId }),
        { status: 200 }
      );
    }

    // Default: ignore unhandled events
  console.log("[webhook] event ignored (not publish/unpublish/delete)", { event });
  return new Response(JSON.stringify({ ok: true, ignored: event }), { status: 200 });
  } catch (err: any) {
  console.error("[webhook] error", { error: err?.message, stack: err?.stack });
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500 }
    );
  }
}
