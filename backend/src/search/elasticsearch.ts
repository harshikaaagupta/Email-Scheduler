import { Client } from "@elastic/elasticsearch";
import { env } from "../config/env.js";

export const esClient = new Client({ node: env.elasticsearchNode });

let ensuredIndex = false;

async function ensureIndex() {
  if (ensuredIndex) return;
  try {
    const exists = await esClient.indices.exists({ index: env.elasticsearchIndex });
    if (!exists) {
      await esClient.indices.create({
        index: env.elasticsearchIndex,
        mappings: {
          properties: {
            recipient: { type: "text" },
            subject: { type: "text" },
            body: { type: "text" },
            status: { type: "keyword" },
            senderEmail: { type: "keyword" },
            scheduledFor: { type: "date" },
            sentAt: { type: "date" },
          },
        },
      });
    }
    ensuredIndex = true;
  } catch (err) {
    console.warn("Elasticsearch not reachable, search indexing disabled for now:", (err as Error).message);
  }
}

export interface EmailDocument {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  status: string;
  senderEmail?: string;
  scheduledFor: string;
  sentAt?: string | null;
}

/** Best-effort indexing - never throws, so ES being down never breaks sending. */
export async function indexEmailDocument(doc: EmailDocument) {
  try {
    await ensureIndex();
    await esClient.index({
      index: env.elasticsearchIndex,
      id: doc.id,
      document: doc,
    });
  } catch (err) {
    console.warn("Elasticsearch indexing failed (non-fatal):", (err as Error).message);
  }
}

export interface SearchOptions {
  query: string;
  status?: string[];
  size?: number;
}

/** Returns null (instead of throwing) when ES is unavailable, so callers can fall back to DB search. */
export async function searchEmails({ query, status, size = 50 }: SearchOptions): Promise<string[] | null> {
  try {
    await ensureIndex();
    const result = await esClient.search({
      index: env.elasticsearchIndex,
      size,
      query: {
        bool: {
          must: query
            ? [
                {
                  multi_match: {
                    query,
                    fields: ["recipient", "subject", "body"],
                  },
                },
              ]
            : [{ match_all: {} }],
          filter: status?.length ? [{ terms: { status } }] : [],
        },
      },
    });
    return result.hits.hits.map((hit) => hit._id as string);
  } catch (err) {
    console.warn("Elasticsearch search failed, caller should fall back to DB:", (err as Error).message);
    return null;
  }
}
