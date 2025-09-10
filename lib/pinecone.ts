import { Pinecone, Index } from "@pinecone-database/pinecone";

if (!process.env.PINECONE_API_KEY) {
  throw new Error("Missing PINECONE_API_KEY in .env");
}
if (!process.env.PINECONE_INDEX_NAME) {
  throw new Error("Missing PINECONE_INDEX_NAME in .env");
}

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

export const index: Index = pinecone.index(process.env.PINECONE_INDEX_NAME!);
