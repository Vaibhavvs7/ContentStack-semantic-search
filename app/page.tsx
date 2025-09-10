"use client";

import DOMPurify from "dompurify";
import Image from "next/image";
import { getPage, initLivePreview } from "@/lib/contentstack";
import { useEffect, useState } from "react";
import { Page } from "@/lib/types";
import ContentstackLivePreview, {
  VB_EmptyBlockParentClass,
} from "@contentstack/live-preview-utils";

export default function Home() {
  const [page, setPage] = useState<Page>();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getContent = async () => {
    const page = await getPage("/");
    setPage(page);
  };

  useEffect(() => {
    initLivePreview();
    ContentstackLivePreview.onEntryChange(getContent);
  }, []);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();

      if (data.ok) {
        setResults(data.results || []);
      } else {
        setError(data.error || "Something went wrong");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-(--breakpoint-md) mx-auto p-6">
      {/* 🔍 Semantic Search Section */}
      <section className="mb-10">
        <h1 className="text-2xl font-bold mb-4">🔍 Semantic Search</h1>

        <form onSubmit={handleSearch} className="flex gap-2 mb-6">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages..."
            className="flex-1 border rounded p-2"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </form>

        {error && <p className="text-red-500 mb-4">{error}</p>}

        <div className="space-y-4">
          {results.map((r, i) => (
            <div key={i} className="p-4 border rounded shadow-sm">
              <h2 className="font-semibold text-lg">{r.title || "Untitled"}</h2>
              <p className="text-sm text-gray-600">
                {r.description || r.body?.slice(0, 100) || "No description"}
              </p>
              <p className="text-xs text-gray-400">
                Score: {r.score?.toFixed(2)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 📝 Original CMS-driven Home Page Section */}
      <section className="p-4">
        {page?.title && (
          <h1
            className="text-4xl font-bold mb-4 text-center"
            {...(page?.$ && page?.$.title)}
          >
            {page?.title} with Next
          </h1>
        )}
        {page?.description && (
          <p
            className="mb-4 text-center"
            {...(page?.$ && page?.$.description)}
          >
            {page?.description}
          </p>
        )}
        {page?.image && (
          <Image
            className="mb-4"
            width={768}
            height={414}
            src={page?.image.url}
            alt={page?.image.title}
            {...(page?.image?.$ && page?.image?.$.url)}
          />
        )}
        {page?.rich_text && (
          <div
            {...(page?.$ && page?.$.rich_text)}
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(page?.rich_text),
            }}
          />
        )}
        <div
          className={`space-y-8 max-w-full mt-4 ${
            !page?.blocks || page.blocks.length === 0
              ? VB_EmptyBlockParentClass
              : ""
          }`}
          {...(page?.$ && page?.$.blocks)}
        >
          {page?.blocks?.map((item, index) => {
            const { block } = item;
            const isImageLeft = block.layout === "image_left";

            return (
              <div
                key={block._metadata.uid}
                {...(page?.$ && page?.$[`blocks__${index}`])}
                className={`flex flex-col md:flex-row items-center space-y-4 md:space-y-0 bg-white ${
                  isImageLeft ? "md:flex-row" : "md:flex-row-reverse"
                }`}
              >
                <div className="w-full md:w-1/2">
                  {block.image && (
                    <Image
                      key={`image-${block._metadata.uid}`}
                      src={block.image.url}
                      alt={block.image.title}
                      width={200}
                      height={112}
                      className="w-full"
                      {...(block?.$ && block?.$.image)}
                    />
                  )}
                </div>
                <div className="w-full md:w-1/2 p-4">
                  {block.title && (
                    <h2
                      className="text-2xl font-bold"
                      {...(block?.$ && block?.$.title)}
                    >
                      {block.title}
                    </h2>
                  )}
                  {block.copy && (
                    <div
                      {...(block?.$ && block?.$.copy)}
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(block.copy),
                      }}
                      className="prose"
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
