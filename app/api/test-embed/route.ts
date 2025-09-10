// app/api/test-embed/route.ts
import { NextResponse } from 'next/server';
import { getEmbedding } from '@/lib/embeddings';

export async function GET() {
  try {
    const vec = await getEmbedding('Test string from Next.js app router');
    return NextResponse.json({ ok: true, length: vec.length, preview: vec.slice(0, 8) });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}
