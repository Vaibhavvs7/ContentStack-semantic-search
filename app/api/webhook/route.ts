// app/api/webhook/route.ts
import { getEmbedding } from '@/lib/embeddings';
import { upsert, remove, persistStore } from '@/lib/vectorStore';
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
    const text = `${entry.title || ''}\n\n${entry.body || entry.description || ''}`.trim();
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
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  if (payload?.data?.type === 'entry_unpublished' || event === 'entry.delete') {
  const id = payload?.data?.entry_uid || payload?.entry?.uid || payload?.data?.uid;
  if (id) remove(String(id));
    persistStore();
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}