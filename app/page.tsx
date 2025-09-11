"use client";

import DOMPurify from "dompurify";
import Image from "next/image";
import Link from "next/link";
import { getPage, initLivePreview } from "@/lib/contentstack";
import { useEffect, useMemo, useState } from "react";
import { Page } from "@/lib/types";
import ContentstackLivePreview, {
  VB_EmptyBlockParentClass,
} from "@contentstack/live-preview-utils";

/**
 * Semantic Search UI — Contentstack style
 * - Search bar + suggestion chips
 * - Filter by content type
 * - Table-like result list with columns: Title | Content Type | Snippet | Score | Actions
 */

export default function Home() {
  const [page, setPage] = useState<Page>();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string>("all");
  const [allContentTypes, setAllContentTypes] = useState<string[]>([]);

  // Clear results immediately when query field is emptied (without needing submit)
  useEffect(() => {
    if (query.trim() === "" && results.length > 0) {
      setResults([]);
      setError(null);
    }
  }, [query]);

  const getContent = async () => {
    const page = await getPage("/");
    setPage(page);
  };

  useEffect(() => {
    initLivePreview();
    ContentstackLivePreview.onEntryChange(getContent);
    // initial fetch for page content + content types
    getContent();
    (async () => {
      try {
        const res = await fetch('/api/content-types');
        const data = await res.json();
        if (data.ok) {
          setAllContentTypes(['all', ...data.contentTypes]);
        }
      } catch {/* ignore */}
    })();
  }, []);

  async function handleSearch(e?: React.FormEvent, overrideQuery?: string) {
    if (e) e.preventDefault();
    const searchTerm = (overrideQuery ?? query).trim();
    if (!searchTerm) {
      // Clear results if query cleared
      setResults([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Always search across ALL content types server-side; we filter locally via dropdown.
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchTerm }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.ok) {
        setResults(Array.isArray(data.results) ? data.results : []);
      } else {
        setError(data.error || "Something went wrong");
        setResults([]);
      }
    } catch (err: any) {
      setError(err.message || "Network error");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  // derive content-type list from results for filtering dropdown
  // When we have an authoritative list from API, prefer it; fallback to deriving from current results.
  const contentTypes = useMemo(() => {
    if (allContentTypes.length > 0) return allContentTypes;
    const set = new Set<string>();
    for (const r of results) {
      const t = (r.metadata && r.metadata.type) || "unknown";
      set.add(t);
    }
    return ["all", ...Array.from(set)];
  }, [results, allContentTypes]);

  // helper to show best snippet from metadata
  function getSnippet(r: any, q: string) {
    const meta = r.metadata || {};
    const candidates: string[] = [];
    if (meta.description) candidates.push(String(meta.description));
    if (meta.summary) candidates.push(String(meta.summary));
    if (meta.body) candidates.push(String(meta.body));
    if (meta.rich_text || meta.rich_text_editor) {
      candidates.push(String(meta.rich_text || meta.rich_text_editor));
    }
    // fallback to any text-like metadata fields (avoid duplicates)
    for (const k of Object.keys(meta)) {
      const v = meta[k];
      if (typeof v === "string" && v.length > 30 && !candidates.includes(v)) candidates.push(v);
    }
    if (candidates.length === 0) return "";
    if (q) {
      const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
      // Find first candidate containing any token; otherwise fallback
      const found = candidates.find(c => {
        const lc = c.toLowerCase();
        return tokens.some(t => lc.includes(t));
      });
      if (found) {
        return found.replace(/\s+/g, " ").slice(0, 280);
      }
    }
    return candidates[0].replace(/\s+/g, " ").slice(0, 280);
  }

  // optional lightweight highlight (bold matched terms) — safe HTML sanitized later
  function highlight(text: string, q: string) {
    if (!text || !q) return text;
    try {
      // build regex from query tokens
      const tokens = q
        .split(/\s+/)
        .filter(Boolean)
        .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      if (tokens.length === 0) return text;
      const re = new RegExp(`(${tokens.join("|")})`, "ig");
      return text.replace(re, "<strong>$1</strong>");
    } catch {
      return text;
    }
  }

  // filtered results by type
  const shownResults = results.filter((r) => {
    if (selectedType === "all") return true;
    const t = (r.metadata && r.metadata.type) || "unknown";
    return t === selectedType;
  });

  // suggestion chips
  const suggestions = [
    "DataSync",
    "Composable Commerce",
    "AI in Healthcare",
    "Contentstack Kickstart",
  ];

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Header / Search area */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="text-2xl">🔍</div>
              <div>
                <h1 className="text-xl font-bold">Semantic Search</h1>
                <div className="text-sm text-gray-500">
                  Search across your Contentstack entries (semantic / embeddings)
                </div>
              </div>
            </div>

            <div className="text-sm text-gray-600">Stack: <strong>ContentStackExplorer</strong></div>
          </div>

          {/* Search form */}
          <form onSubmit={handleSearch} className="flex gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search entries (e.g. DataSync, Kickstart, etc.)"
                className="w-full rounded border pl-4 pr-10 py-3 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                aria-label="Search entries"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                  setQuery("");
                  setResults([]);
                  setError(null);
                  }}
                  className="absolute inset-y-0 right-2 flex items-center px-2 text-gray-800 hover:text-gray-600 focus:outline-none text-2xl"
                >
                  ×
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 text-white px-5 py-3 rounded hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </form>

          {/* suggestion chips */}
          <div className="mt-4 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setQuery(s);
                  void handleSearch(undefined, s);
                }}
                className="text-sm bg-indigo-50 text-indigo-700 px-3 py-1 rounded border border-indigo-100 hover:bg-indigo-100"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Main content area — results table + (optional) right column */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: results table (takes most space) */}
          <div className="lg:col-span-9">
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="text-sm text-gray-600">Filter</div>
                <select
                  value={selectedType}
                  onChange={(e) => {
                    // Client-side filter only; no network call.
                    setSelectedType(e.target.value);
                  }}
                  className="border rounded px-3 py-1 text-sm"
                >
                  {contentTypes.map((t) => (
                    <option key={t} value={t}>
                      {t === "all" ? "All content types" : t}
                    </option>
                  ))}
                </select>
              </div>

              <div className="text-sm text-gray-500">
                {loading ? "Searching..." : `${shownResults.length} result(s)`}
              </div>
            </div>

            {/* Table header */}
            <div className="hidden md:flex bg-gray-100 px-4 py-2 rounded-t text-sm text-gray-600 font-medium">
              <div className="w-1/3">Title</div>
              <div className="w-1/6">Content Type</div>
              <div className="w-1/2">Snippet</div>
              <div className="w-24 text-right">Score</div>
            </div>

            {/* Results list */}
            <div className="bg-white border rounded-b divide-y">
              {shownResults.length === 0 && !loading && query && (
                <div className="p-6 text-gray-600">No results found for <strong>{query}</strong>.</div>
              )}

              {shownResults.map((r, i) => {
                const title = r.metadata?.title || "Untitled";
                const type = r.metadata?.type || "unknown";
                const url = r.metadata?.url || "#";
                const rawSnippet = getSnippet(r, query);
                const snippetHtml = DOMPurify.sanitize(highlight(rawSnippet, query));

                const score = typeof r.score === "number" ? r.score : 0;
                return (
                  <div key={r.id || i} className="flex flex-col md:flex-row items-start md:items-center px-4 py-4 gap-3">
                    <div className="md:w-1/3">
                      <Link href={url} className="text-sm font-medium text-gray-900 hover:underline">
                        {title}
                      </Link>
                      <div className="text-xs text-gray-500 mt-1 hidden md:block">
                        UID: <code className="text-xs">{r.metadata?.uid || "-"}</code>
                      </div>
                    </div>

                    <div className="md:w-1/6 text-sm text-gray-600">{type}</div>

                    <div className="md:w-1/2 text-sm text-gray-700 prose-sm" dangerouslySetInnerHTML={{ __html: snippetHtml }} />

                    <div className="md:w-24 text-right text-sm text-gray-500">
                      {(score * 100).toFixed(1)}%
                      <div className="mt-2">
                        <a
                          href={url}
                          className="text-xs text-blue-600 hover:underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Small info / preview panel (optional) */}
          <aside className="lg:col-span-3">
            <div className="bg-white border rounded p-4 shadow-sm">
              <h3 className="text-sm font-semibold mb-2">Search tips</h3>
              <ul className="text-sm text-gray-600 list-disc pl-5 space-y-2">
                <li>Try natural language queries (e.g. "DataSync to local DB").</li>
                <li>Use content-type filter to narrow results.</li>
                <li>Click <em>Open</em> to view the original entry in a new tab.</li>
              </ul>
            </div>

            <div className="bg-white border rounded p-4 shadow-sm mt-4">
              <h3 className="text-sm font-semibold mb-2">Suggested showstoppers</h3>
              <ul className="text-sm text-gray-600 list-disc pl-5 space-y-2">
                <li>Realtime auto-indexing (webhook) — updates appear instantly.</li>
                <li>Highlight matched terms in results (already enabled).</li>
                <li>Show filters for locale & publish date.</li>
              </ul>
            </div>
          </aside>
        </div>

        {/* Optional CMS page preview below */}
        <section className="mt-8 p-4">
          {page?.title && (
            <h2 className="text-2xl font-bold mb-2" {...(page?.$ && page?.$.title)}>{page?.title}</h2>
          )}
          {page?.description && <p {...(page?.$ && page?.$.description)} className="text-gray-600 mb-4">{page?.description}</p>}

          {page?.rich_text && (
            <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(page?.rich_text) }} />
          )}

          <div className={`space-y-8 max-w-full mt-4 ${!page?.blocks || page.blocks.length === 0 ? VB_EmptyBlockParentClass : ""}`} {...(page?.$ && page?.$.blocks)}>
            {page?.blocks?.map((item, index) => {
              const { block } = item;
              const isImageLeft = block.layout === "image_left";
              return (
                <div key={block._metadata.uid} className={`flex flex-col md:flex-row items-center space-y-4 md:space-y-0 bg-white ${isImageLeft ? "md:flex-row" : "md:flex-row-reverse"}`}>
                  <div className="w-full md:w-1/2">
                    {block.image && <Image src={block.image.url} alt={block.image.title} width={200} height={112} className="w-full" {...(block?.$ && block?.$.image)} />}
                  </div>
                  <div className="w-full md:w-1/2 p-4">
                    {block.title && <h3 className="text-xl font-bold" {...(block?.$ && block?.$.title)}>{block.title}</h3>}
                    {block.copy && <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(block.copy) }} className="prose" {...(block?.$ && block?.$.copy)} />}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
