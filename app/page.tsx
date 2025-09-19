"use client";

import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import Image from "next/image";
import './modal.css';

import CSlogo from "./CSlogo.webp";
import DOMPurify from "dompurify";
import Link from "next/link";
import { initLivePreview } from "@/lib/contentstack";
import { useEffect, useMemo, useState } from "react";
import ContentstackLivePreview from "@contentstack/live-preview-utils";

const sanitize = (html: string) => {
  if (typeof window === 'undefined') return html;
  return DOMPurify.sanitize(html);
};

export default function Home() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string>("all");
  const [allContentTypes, setAllContentTypes] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<any>(null);
  useEffect(() => {
    if (query.trim() === "" && results.length > 0) {
      setResults([]);
      setError(null);
    }
  }, [query, results.length]);

  useEffect(() => {
    initLivePreview();
    ContentstackLivePreview.onEntryChange(() => {});
    (async () => {
      try {
        const res = await fetch("/api/content-types");
        const data = await res.json();
        if (data.ok) setAllContentTypes(["all", ...data.contentTypes]);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  async function handleSearch(e?: React.FormEvent, overrideQuery?: string) {
    if (e) e.preventDefault();
    const searchTerm = (overrideQuery ?? query).trim();
    if (!searchTerm) {
      setResults([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchTerm }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.ok) setResults(Array.isArray(data.results) ? data.results : []);
      else {
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

  const handleEntryClick = (entry: any) => {
    setSelectedEntry(entry);
    setIsModalOpen(true);
  };

  const contentTypes = useMemo(() => {
    if (allContentTypes.length > 0) return allContentTypes;
    const set = new Set<string>();
    for (const r of results) {
      const t = (r.metadata && r.metadata.type) || "unknown";
      set.add(t);
    }
    return ["all", ...Array.from(set)];
  }, [results, allContentTypes]);

  function getSnippet(r: any, q: string) {
    const meta = r.metadata || {};
    const candidates: string[] = [];
    if (meta.description) candidates.push(String(meta.description));
    if (meta.summary) candidates.push(String(meta.summary));
    if (meta.body) candidates.push(String(meta.body));
    if (meta.rich_text || meta.rich_text_editor)
      candidates.push(String(meta.rich_text || meta.rich_text_editor));
    for (const k of Object.keys(meta)) {
      const v = meta[k];
      if (typeof v === "string" && v.length > 30 && !candidates.includes(v))
        candidates.push(v);
    }
    if (candidates.length === 0) return "";
    if (q) {
      const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
      const found = candidates.find((c) => {
        const lc = c.toLowerCase();
        return tokens.some((t) => lc.includes(t));
      });
      if (found) return found.replace(/\s+/g, " ").slice(0, 280);
    }
    return candidates[0].replace(/\s+/g, " ").slice(0, 280);
  }

  function highlight(text: string, q: string) {
    if (!text || !q) return text;
    try {
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

  const shownResults = results.filter((r) => {
    if (selectedType === "all") return true;
    const t = (r.metadata && r.metadata.type) || "unknown";
    return t === selectedType;
  });

  const suggestions = [
    "DataSync",
    "Composable Commerce",
    "AI in Healthcare",
    "Contentstack Kickstart",
  ];

  // In your EntryModal component, update the exclusions and rendering logic:
const EntryModal = () => {
  if (!selectedEntry) return null;
  
  // Helper to format field names
  const formatFieldName = (key: string) => {
    return key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  };

  // Helper to strip HTML tags
  const stripHtml = (html: string) => {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return temp.textContent || temp.innerText || '';
  };

  // Helper to render field value based on type
const renderFieldValue = (key: string, value: any) => {
  if (value === null || value === undefined) return '-';

  // Helper to strip HTML tags
  const stripHtml = (html: string) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.body.textContent || '';
  };
  
  // Handle HTML content first (like rich_text_editor)
  if (typeof value === 'string' && (value.includes('</') || value.includes('/>'))) {
    return (
      <div className="field-value whitespace-pre-wrap text-sm text-gray-700">
        {stripHtml(value)}
      </div>
    );
  }

  // Handle image fields by parsing JSON and extracting URL
  if (typeof value === 'string' && key.toLowerCase().includes('image')) {
    try {
      const imageData = JSON.parse(value);
      if (imageData.url) {
        return (
          <div className="field-value image-container">
            <Image
              src={imageData.url}
              alt={imageData.title || 'Content Image'}
              width={600}
              height={400}
              className="rounded-lg object-cover w-full"
              priority={false}
            />
          </div>
        );
      }
    } catch (e) {
      // If not parseable JSON, check if it's a direct URL
      if (value.startsWith('http')) {
        return (
          <div className="field-value image-container">
            <Image
              src={value}
              alt="Content Image"
              width={600}
              height={400}
              className="rounded-lg object-cover w-full"
              priority={false}
            />
          </div>
        );
      }
      // If not an image URL, treat as regular text
      return <span className="field-value text-sm text-gray-700">{value}</span>;
    }
  }
    
  // Handle arrays (like tags)
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="field-value text-gray-500">-</span>;
    return (
      <div className="tags-list">
        {value.map((item, i) => (
          <span key={i} className="tag">{item}</span>
        ))}
      </div>
    );
  }

  // Handle boolean values
  if (typeof value === 'boolean') {
    return (
      <span className={`field-value font-medium ${value ? 'text-green-600' : 'text-red-600'}`}>
        {value ? 'Yes' : 'No'}
      </span>
    );
  }

  // Handle objects (excluding null)
  if (typeof value === 'object' && value !== null) {
    try {
      const formatted = JSON.stringify(value, null, 2);
      return (
        <pre className="field-value text-xs bg-gray-50 p-2 rounded overflow-auto max-h-40">
          {formatted}
        </pre>
      );
    } catch {
      return <span className="field-value text-gray-500">Complex Object</span>;
    }
  }

  // Default string display
  return <span className="field-value text-sm text-gray-700">{String(value)}</span>;
};

  // Excluded fields list
  const excludeFields = [
    'featured_image', 
    'url', 
    'uid',
    'ACL',
    'in_progress',
    'created_by',
    'publish_details',
    'updated_at',
    'updated_by',
    'locale',
    'blocks',
    '_version',
    '_in_progress',
    'created_at',
    '_metadata'
  ];

  // Get filtered metadata fields
  const fields = Object.entries(selectedEntry.metadata || {})
    .filter(([key]) => !excludeFields.includes(key));

  // Add these styles to your modal.css
  const modalStyles = {
    fieldContainer: `
      border-bottom border-gray-200 
      py-4 last:border-0
      hover:bg-gray-50
    `,
    fieldLabel: `
      text-sm font-medium text-gray-600 
      mb-1
    `,
    fieldValue: `
      text-sm text-gray-900
      break-words
    `
  };

  return (
    <Transition appear show={isModalOpen} as={Fragment}>
      <Dialog 
        as="div"
        className="modal-overlay"
        onClose={() => setIsModalOpen(false)}
      >
        <div className="modal-container">
          <div className="modal-content">
            <Dialog.Panel className="modal-panel">
              <div className="modal-header">
                <Dialog.Title className="modal-title">
                  {selectedEntry.metadata?.title || 'Untitled'}
                </Dialog.Title>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="modal-close"
                >
                  ×
                </button>
              </div>

              <div className="modal-body">
                {/* Featured Image */}
                {selectedEntry.metadata?.featured_image && (
                  <div className="entry-image mb-6">
                    <Image
                      src={selectedEntry.metadata.featured_image}
                      alt={selectedEntry.metadata?.title || ''}
                      width={800}
                      height={450}
                      className="object-cover rounded-lg"
                    />
                  </div>
                )}

                {/* Type Badge */}
                <div className="mb-6">
                  <span className="entry-type">
                    {selectedEntry.metadata?.type || 'unknown'}
                  </span>
                </div>

                {/* Fields */}
                <div className="divide-y divide-gray-200">
                  {fields.map(([key, value]) => (
                    <div key={key} className={modalStyles.fieldContainer}>
                      <div className={modalStyles.fieldLabel}>
                        {formatFieldName(key)}
                      </div>
                      <div className={modalStyles.fieldValue}>
                        {renderFieldValue(key, value)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="modal-footer">
                <a
                  href={selectedEntry.metadata?.url || '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-primary"
                >
                  Open in Contentstack
                </a>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                >
                  Close
                </button>
              </div>
            </Dialog.Panel>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

  
  return (
    <main className="min-h-screen bg-neutral-50">
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-60 flex-col bg-white border-r border-neutral-200 shadow-sm z-20">
        <div className="flex items-center gap-2 px-5 py-5 border-b border-neutral-100">
          <Image
            src={CSlogo}
            alt="Contentstack Logo"
            width={32}
            height={32}
            className="w-8 h-8"
            priority
            onError={(e) => {
              // fallback if image missing
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          <span className="text-lg font-bold text-[#882de3] tracking-tight">
            Contentstack
          </span>
        </div>
        <div className="flex-1 overflow-y-auto pt-5 pb-6">
          <div className="text-[11px] font-semibold tracking-wide text-neutral-500 mb-2 px-5">
            CONTENT TYPES
          </div>
          <ul className="space-y-1 px-3">
            {contentTypes.map((t) => {
              const active = selectedType === t;
              return (
                <li key={t}>
                  <button
                    type="button"
                    onClick={() => setSelectedType(t)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors border ${
                      active
                        ? "bg-[#882de3] border-[#882de3] text-white shadow"
                        : "bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-100"
                    }`}
                  >
                    {t === "all" ? "All Types" : t}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-6 px-5">
            <div className="rounded-md bg-white border border-neutral-200 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-neutral-400 font-medium">
                Powered by
              </div>
              <div className="text-xs font-semibold text-neutral-600">
                semantic search
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div className="lg:ml-60 px-6 py-8 max-w-7xl mx-auto">
        <div className="rounded-lg border border-neutral-200 bg-white/60 backdrop-blur-sm shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="text-2xl">🔍</div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-gray-800">
                  Semantic Search
                </h1>
                <div className="text-sm text-gray-500 mt-0.5">
                  Search across your Contentstack entries (semantic / embeddings)
                </div>
              </div>
            </div>
            <div className="text-sm text-gray-600">
              Stack:{" "}
              <strong className="font-semibold text-gray-700">
                ContentStackExplorer
              </strong>
            </div>
          </div>

          <form onSubmit={handleSearch} className="flex gap-3">
            <div className="relative flex-1 group">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search entries (e.g. DataSync, Kickstart, etc.)"
                className="w-full rounded-md border border-neutral-300 bg-white/90 pl-4 pr-10 py-3 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 text-sm placeholder:text-neutral-400"
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
                  className="absolute inset-y-0 right-1.5 flex items-center px-2 text-gray-500 hover:text-gray-700 focus:outline-none text-2xl"
                >
                  ×
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={loading}
              className="bg-[#882de3] hover:bg-[#6f23b6] active:bg-[#5a1c93] disabled:opacity-60 disabled:hover:bg-[#882de3] text-white px-5 py-3 rounded-md font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-[#882de3] focus:ring-offset-1 focus:ring-offset-white"
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </form>

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

          {error && (
            <div className="mt-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-3">
              <span className="mt-0.5">⚠️</span>
              <div className="flex-1">
                <strong className="font-semibold">Error:</strong> {error}
                <button
                  onClick={() => setError(null)}
                  className="ml-3 underline hover:no-underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-9">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-3">
              <div className="flex items-center gap-3 lg:hidden">
                <label
                  htmlFor="contentTypeFilter"
                  className="text-xs uppercase tracking-wide font-medium text-neutral-600"
                >
                  Filter
                </label>
                <div className="relative">
                  <select
                    id="contentTypeFilter"
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                    className="appearance-none text-sm rounded-md border border-neutral-300 bg-white/70 backdrop-blur px-3 pr-9 py-1.5 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 text-neutral-700"
                  >
                    {contentTypes.map((t) => (
                      <option key={t} value={t}>
                        {t === "all" ? "All content types" : t}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 text-xs">
                    ▾
                  </span>
                </div>
                {selectedType !== "all" && (
                  <button
                    onClick={() => setSelectedType("all")}
                    className="text-xs font-medium text-sky-600 hover:text-sky-700 underline decoration-dotted"
                  >
                    Reset
                  </button>
                )}
              </div>

              <div className="text-sm text-neutral-500 font-medium">
                {loading
                  ? "Searching..."
                  : `${shownResults.length} result${
                      shownResults.length === 1 ? "" : "s"
                    }`}
              </div>
            </div>

            <div className="hidden md:flex bg-neutral-100 px-4 py-2 rounded-t text-[11px] uppercase tracking-wide text-neutral-600 font-medium border border-neutral-200">
              <div className="w-1/3">Title</div>
              <div className="w-1/6">Content Type</div>
              <div className="w-1/2">Snippet</div>
              <div className="w-24 text-right">Score</div>
            </div>

            <div className="hidden md:block bg-white border border-neutral-200 rounded-b divide-y divide-neutral-100">
              {shownResults.length === 0 && !loading && query && (
                <div className="p-6 text-gray-600">
                  No results found for <strong>{query}</strong>.
                </div>
              )}

              {loading &&
                Array.from({ length: 5 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col md:flex-row items-start md:items-center px-4 py-4 gap-3 animate-pulse"
                  >
                    <div className="md:w-1/3 w-full space-y-2">
                      <div className="h-4 bg-neutral-200 rounded" />
                      <div className="h-3 bg-neutral-100 rounded w-2/3 hidden md:block" />
                    </div>
                    <div className="md:w-1/6 h-4 bg-neutral-100 rounded w-24" />
                    <div className="md:w-1/2 w-full space-y-2">
                      <div className="h-3 bg-neutral-100 rounded" />
                      <div className="h-3 bg-neutral-100 rounded w-5/6" />
                      <div className="h-3 bg-neutral-100 rounded w-2/3" />
                    </div>
                    <div className="md:w-24 w-16 h-4 bg-neutral-100 rounded self-stretch" />
                  </div>
                ))}

              {shownResults.map((r, i) => {
                const title = r.metadata?.title || "Untitled";
                const type = r.metadata?.type || "unknown";
                const url = r.metadata?.url || "#";
                const rawSnippet = getSnippet(r, query);
                const snippetHtml = DOMPurify.sanitize(
                  highlight(rawSnippet, query)
                );
                const score = typeof r.score === "number" ? r.score : 0;
                return (
                  <div
                    key={r.id || i}
                    onClick={() => handleEntryClick(r)}
                    className={`cursor-pointer flex flex-col md:flex-row items-start md:items-center px-4 py-4 gap-3 text-sm transition-colors ${
                      i % 2 === 0 ? "bg-white" : "bg-neutral-50"
                    } hover:bg-sky-50/60`}
                  >
                    <div className="md:w-1/3">
                      <Link
                        href={url}
                        className="text-sm font-medium text-gray-900 hover:underline"
                      >
                        {title}
                      </Link>
                      <div className="text-xs text-gray-500 mt-1 hidden md:block">
                        UID: <code className="text-xs">{r.metadata?.uid || "-"}</code>
                      </div>
                    </div>
                    <div className="md:w-1/6 text-sm text-gray-600">{type}</div>
                    <div
                      className="md:w-1/2 text-sm text-gray-700 prose-sm"
                      dangerouslySetInnerHTML={{ __html: snippetHtml }}
                    />
                    <div className="md:w-24 text-right text-xs text-gray-500 space-y-1">
                      <div className="font-medium text-gray-700 text-[11px] tracking-wide">
                        {(score * 100).toFixed(0)}%
                      </div>
                      <div className="h-2.5 rounded-full bg-neutral-200 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-500"
                          style={{
                            width: `${Math.min(100, Math.max(0, score * 100))}%`,
                          }}
                        />
                      </div>
                      <div className="pt-1">
                        <a
                          href={url}
                          className="inline-block text-[11px] font-medium text-sky-600 hover:text-sky-700 hover:underline"
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

            <div className="md:hidden space-y-4">
              {loading && (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-neutral-200 bg-white p-4 shadow-xs animate-pulse space-y-3"
                    >
                      <div className="h-4 bg-neutral-200 rounded w-2/3" />
                      <div className="h-3 bg-neutral-100 rounded w-1/3" />
                      <div className="h-3 bg-neutral-100 rounded" />
                      <div className="h-3 bg-neutral-100 rounded w-5/6" />
                    </div>
                  ))}
                </div>
              )}
              {!loading && shownResults.length === 0 && query && (
                <div className="rounded-md border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
                  No results found for <strong>{query}</strong>.
                </div>
              )}
              {!loading &&
                shownResults.map((r, i) => {
                  const title = r.metadata?.title || "Untitled";
                  const type = r.metadata?.type || "unknown";
                  const url = r.metadata?.url || "#";
                  const rawSnippet = getSnippet(r, query);
                  const snippetHtml = DOMPurify.sanitize(
                    highlight(rawSnippet, query)
                  );
                  const score = typeof r.score === "number" ? r.score : 0;
                  return (
                    <div
                      key={r.id || i}
                      className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm hover:border-sky-300 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <Link
                            href={url}
                            className="font-medium text-sm text-gray-900 hover:underline"
                          >
                            {title}
                          </Link>
                          <div className="mt-1 text-[11px] uppercase tracking-wide text-neutral-500 font-medium">
                            {type}
                          </div>
                        </div>
                        <div className="text-right w-20">
                          <div className="text-[11px] font-medium text-gray-700">
                            {(score * 100).toFixed(0)}%
                          </div>
                          <div className="h-2 rounded-full bg-neutral-200 overflow-hidden">
                            <div
                              className="h-full bg-sky-500"
                              style={{
                                width: `${Math.min(
                                  100,
                                  Math.max(0, score * 100)
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                      <div
                        className="mt-3 text-xs text-neutral-700 leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: snippetHtml }}
                      />
                      <div className="mt-3 flex items-center justify-between">
                        <code className="text-[10px] bg-neutral-100 rounded px-1.5 py-0.5 text-neutral-500">
                          {r.metadata?.uid || "-"}
                        </code>
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] font-medium text-sky-600 hover:text-sky-700 hover:underline"
                        >
                          Open
                        </a>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          <aside className="lg:col-span-3">
            <div className="bg-white border rounded p-4 shadow-sm">
              <h3 className="text-sm font-semibold mb-2">Search tips</h3>
              <ul className="text-sm text-gray-600 list-disc pl-5 space-y-2">
                <li>
                  Try natural language queries (e.g. &quot;DataSync to local DB&quot;).
                </li>
                <li>Use content-type filter to narrow results.</li>
                <li>
                  Click <em>Open</em> to view the original entry in a new tab.
                </li>
              </ul>
            </div>

            <div className="bg-white border rounded p-4 shadow-sm mt-4">
              <h3 className="text-sm font-semibold mb-2">Suggested showstoppers</h3>
              <ul className="text-sm text-gray-600 list-disc pl-5 space-y-2">
                <li>Realtime auto-indexing (webhook) — updates appear instantly.</li>
                <li>Highlight matched terms in results (already enabled).</li>
                <li>Show filters for locale &amp; publish date.</li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
      <EntryModal />
    </main>
  );
}