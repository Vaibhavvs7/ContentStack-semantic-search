import { NextRequest, NextResponse } from "next/server";
import { index } from "@/lib/pinecone";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const id = searchParams.get("id");
    const namespace = process.env.PINECONE_NAMESPACE;
    const target: any = namespace ? (index as any).namespace(namespace) : index;

    if (id) {
      // Fetch single vector by id
      const res = await target.fetch([id]);
      return NextResponse.json({ ok: true, fetch: res });
    }

    // If no id passed, try to describe index stats (may be large)
    const stats = await target.describeIndexStats({});
    return NextResponse.json({ ok: true, stats });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
