/**
 * LanceDB ベクトルストア
 * RAG検索の中核
 */

import * as lancedb from "@lancedb/lancedb";
import { embedText, embedTexts } from "./embeddings.js";
import type { LawChunk } from "../data/chunkers/law.js";
import type { GuidelineChunk } from "../data/chunkers/guideline.js";

const DB_PATH = "./data/vectordb";
const TABLE_NAME = "documents";

export type DocumentChunk = LawChunk | GuidelineChunk;

export interface StoredDocument {
  id: string;
  content: string;
  vector: number[];
  source: "law" | "guideline" | "qa" | "violation";
  metadata: string; // JSON文字列として保存
}

export interface SearchResult {
  id: string;
  content: string;
  source: "law" | "guideline" | "qa" | "violation";
  metadata: Record<string, unknown>;
  score: number;
}

let dbInstance: lancedb.Connection | null = null;

/**
 * データベース接続を取得
 */
async function getDb(): Promise<lancedb.Connection> {
  if (!dbInstance) {
    dbInstance = await lancedb.connect(DB_PATH);
  }
  return dbInstance;
}

/**
 * テーブルを取得（存在しない場合は作成）
 */
async function getTable(): Promise<lancedb.Table> {
  const db = await getDb();
  const tableNames = await db.tableNames();

  if (tableNames.includes(TABLE_NAME)) {
    return db.openTable(TABLE_NAME);
  }

  // テーブルが存在しない場合は空のスキーマで作成
  // 最初のデータ挿入時に自動的にスキーマが決定される
  throw new Error(
    `Table "${TABLE_NAME}" does not exist. Run ingest first to create it.`
  );
}

/**
 * ドキュメントをベクトルストアに追加
 */
export async function addDocuments(chunks: DocumentChunk[]): Promise<void> {
  if (chunks.length === 0) return;

  const db = await getDb();
  const tableNames = await db.tableNames();

  // Embeddingを生成
  const texts = chunks.map((chunk) => chunk.content);
  const vectors = await embedTexts(texts);

  // LanceDB用のデータ形式に変換
  const data: StoredDocument[] = chunks.map((chunk, i) => ({
    id: chunk.id,
    content: chunk.content,
    vector: vectors[i],
    source: chunk.metadata.source,
    metadata: JSON.stringify(chunk.metadata),
  }));

  // LanceDBはRecord<string, unknown>[]を期待するのでキャスト
  const records = data as unknown as Record<string, unknown>[];

  if (tableNames.includes(TABLE_NAME)) {
    // 既存テーブルに追加
    const table = await db.openTable(TABLE_NAME);
    await table.add(records);
  } else {
    // 新規テーブル作成
    await db.createTable(TABLE_NAME, records);
  }
}

/**
 * ベクトル検索を実行
 */
export async function search(
  query: string,
  options: {
    limit?: number;
    source?: "law" | "guideline" | "qa" | "violation";
  } = {}
): Promise<SearchResult[]> {
  const { limit = 5, source } = options;

  const table = await getTable();
  const queryVector = await embedText(query);

  let searchQuery = table.vectorSearch(queryVector).limit(limit);

  // ソースでフィルタリング
  if (source) {
    searchQuery = searchQuery.where(`source = '${source}'`);
  }

  const results = await searchQuery.toArray();

  return results.map((row) => ({
    id: row.id as string,
    content: row.content as string,
    source: row.source as SearchResult["source"],
    metadata: JSON.parse(row.metadata as string),
    score: row._distance as number,
  }));
}

/**
 * 複数ソースから並列検索
 */
export async function multiSearch(
  query: string,
  options: {
    limitPerSource?: number;
    sources?: ("law" | "guideline" | "qa" | "violation")[];
  } = {}
): Promise<SearchResult[]> {
  const { limitPerSource = 3, sources = ["law", "guideline"] } = options;

  const searches = sources.map((source) =>
    search(query, { limit: limitPerSource, source })
  );

  const results = await Promise.all(searches);
  return results.flat();
}

/**
 * テーブルをクリア（デバッグ用）
 */
export async function clearTable(): Promise<void> {
  const db = await getDb();
  const tableNames = await db.tableNames();

  if (tableNames.includes(TABLE_NAME)) {
    await db.dropTable(TABLE_NAME);
  }
}

/**
 * ドキュメント数を取得
 */
export async function countDocuments(): Promise<number> {
  try {
    const table = await getTable();
    return await table.countRows();
  } catch {
    return 0;
  }
}
