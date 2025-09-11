import { NextResponse } from "next/server";
import { stack } from "@/lib/contentstack";

// Utility copied (light) from reindex route to avoid circular import.
function getManagementHost(): string {
  const override = process.env.NEXT_PUBLIC_CONTENTSTACK_MANAGEMENT_HOST;
  if (override) return override;
  const region = (process.env.NEXT_PUBLIC_CONTENTSTACK_REGION || "NA").toUpperCase();
  return region === "EU" ? "eu-api.contentstack.com" : "api.contentstack.io";
}

async function fetchContentTypes(): Promise<string[]> {
  const apiKey = stack.config.apiKey;
  const mgmtToken = process.env.CONTENTSTACK_MANAGEMENT_TOKEN as string | undefined;
  if (!apiKey) throw new Error("Missing NEXT_PUBLIC_CONTENTSTACK_API_KEY env var");
  if (!mgmtToken) throw new Error("Missing CONTENTSTACK_MANAGEMENT_TOKEN env var");

  const host = getManagementHost();
  const url = `https://${host}/v3/content_types`;
  const res = await fetch(url, {
    headers: { api_key: apiKey, authorization: mgmtToken },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to list content types (${res.status}): ${text || res.statusText}`);
  }
  const json = await res.json();
  return json.content_types?.map((ct: any) => ct.uid) || [];
}

export async function GET() {
  try {
    const types = await fetchContentTypes();
    return NextResponse.json({ ok: true, contentTypes: types.sort() });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message || "Failed" }, { status: 500 });
  }
}