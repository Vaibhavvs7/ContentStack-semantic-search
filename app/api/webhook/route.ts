// app/api/webhook/route.ts
import { getEmbedding } from '@/lib/embeddings';
import { upsert, remove, persistStore } from '@/lib/vectorStore';
import { index } from '@/lib/pinecone';
import { entryToText, extractMetadata, sanitizeMetadata } from '@/lib/text';
import crypto from 'crypto';

export async function POST(req: Request) {
  const bodyText = await req.text();
  const secret = process.env.WEBHOOK_SECRET;
  if (secret) {
    const signature = req.headers.get('x-contentstack-signature') || '';
    const expected = crypto.createHmac('sha256', secret).update(bodyText).digest('hex');
    if (signature !== expected) return new Response('Invalid signature', { status: 401 });
  }

  const payload = JSON.parse(bodyText);
  const { event } = payload; // adapt depending on webhook structure

  if (payload?.data?.type === 'entry_published' || event === 'entry.create' || event === 'entry.save') {
    const entry = payload.data || payload.entry || payload;
    const id = String(entry?.uid || entry?.entry_uid || '');
    if (!id) return new Response('Missing entry uid', { status: 400 });

    const contentType = String(entry?.content_type?.uid || entry?.content_type_uid || 'entry');
    const locale = String(entry?.locale || 'en-us');
    const text = entryToText(entry);
    const embedding = await getEmbedding(text || entry.title || '');

    upsert({
      id,
      contentType,
      locale,
      text,
      embedding,
      metadata: { entry },
    } as any);
    persistStore();

    // Upsert into Pinecone as well (use namespace if configured)
    const targetIndex: any = process.env.PINECONE_NAMESPACE
      ? (index as any).namespace(process.env.PINECONE_NAMESPACE)
      : index;
    const { title, description, url } = extractMetadata(entry, contentType);
    await targetIndex.upsert([
      {
        id: `${contentType}_${id}`,
        values: embedding,
        metadata: sanitizeMetadata({
          ...entry,
          type: contentType,
          uid: id,
          url,
          title,
          description,
        }),
      },
    ] as any);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  if (payload?.data?.type === 'entry_unpublished' || event === 'entry.delete') {
  const id = payload?.data?.entry_uid || payload?.entry?.uid || payload?.data?.uid;
  if (id) remove(String(id));
    // Optionally remove from Pinecone (if using namespaces)
    try {
      const contentType = String(payload?.data?.content_type_uid || payload?.entry?.content_type?.uid || 'entry');
      const targetIndex: any = process.env.PINECONE_NAMESPACE
        ? (index as any).namespace(process.env.PINECONE_NAMESPACE)
        : index;
      const pineId = `${contentType}_${id}`;
      if (typeof targetIndex.deleteMany === 'function') {
        await targetIndex.deleteMany([pineId]);
      } else if (typeof targetIndex.deleteOne === 'function') {
        await targetIndex.deleteOne(pineId);
      }
    } catch {}
    persistStore();
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}