/**
 * LanceDB ベクトルストア
 * RAG検索の中核
 */

import * as lancedb from "@lancedb/lancedb";
import { embedText, embedTexts } from "./embeddings.js";
import type { LawChunk } from "../data/chunkers/law.js";
import type { GuidelineChunk } from "../data/chunkers/guideline.js";
import type { QaChunk } from "../data/chunkers/qa.js";

const DB_PATH = "./data/vectordb";
const TABLE_NAME = "documents";

/** ベクトルストア関連のエラー */
export class VectorStoreError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "VectorStoreError";
  }
}

/** 許可されたソース値（SQL Injection対策） */
const VALID_SOURCES = ["law", "guideline", "qa", "violation"] as const;
export type SourceType = (typeof VALID_SOURCES)[number];

/**
 * ソース値をバリデーション
 * @throws {Error} 無効なソース値の場合
 */
function validateSource(source: string): SourceType {
  if (!VALID_SOURCES.includes(source as SourceType)) {
    throw new Error(`Invalid source: ${source}. Must be one of: ${VALID_SOURCES.join(", ")}`);
  }
  return source as SourceType;
}

export type DocumentChunk = LawChunk | GuidelineChunk | QaChunk;

export interface StoredDocument {
  id: string;
  content: string;
  vector: number[];
  source: SourceType;
  // 頻繁にフィルタリングされるフィールドは個別カラムとして保存
  // Note: LanceDBはnullの型推論ができないため空文字列を使用
  articleNumber: string; // 法令: 条番号（なければ空文字列）
  category: string; // Q&A/ガイドライン: カテゴリ（なければ空文字列）
  filename: string; // ガイドライン: ファイル名（なければ空文字列）
  metadata: string; // その他メタデータはJSON文字列として保存
}

export interface SearchResult {
  id: string;
  content: string;
  source: SourceType;
  // 頻繁にアクセスされるフィールドを直接公開（空文字列は「なし」を意味）
  articleNumber: string;
  category: string;
  filename: string;
  metadata: Record<string, unknown>;
  score: number;
}

let dbInstance: lancedb.Connection | null = null;

/**
 * データベース接続を取得
 * @throws {VectorStoreError} 接続失敗時
 */
async function getDb(): Promise<lancedb.Connection> {
  if (!dbInstance) {
    try {
      dbInstance = await lancedb.connect(DB_PATH);
    } catch (e) {
      throw new VectorStoreError(
        `Failed to connect to database at ${DB_PATH}: ${e instanceof Error ? e.message : String(e)}`,
        "connect",
        e instanceof Error ? e : undefined,
      );
    }
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
  throw new Error(`Table "${TABLE_NAME}" does not exist. Run ingest first to create it.`);
}

/**
 * ドキュメントをベクトルストアに追加
 * @throws {VectorStoreError} 追加失敗時
 */
export async function addDocuments(chunks: DocumentChunk[]): Promise<void> {
  if (chunks.length === 0) return;

  const db = await getDb();

  let tableNames: string[];
  try {
    tableNames = await db.tableNames();
  } catch (e) {
    throw new VectorStoreError(
      `Failed to get table names: ${e instanceof Error ? e.message : String(e)}`,
      "tableNames",
      e instanceof Error ? e : undefined,
    );
  }

  // Embeddingを生成
  let vectors: number[][];
  try {
    const texts = chunks.map((chunk) => chunk.content);
    vectors = await embedTexts(texts);
  } catch (e) {
    throw new VectorStoreError(
      `Failed to generate embeddings: ${e instanceof Error ? e.message : String(e)}`,
      "embedTexts",
      e instanceof Error ? e : undefined,
    );
  }

  // LanceDB用のデータ形式に変換
  const data: StoredDocument[] = chunks.map((chunk, i) => {
    const meta = chunk.metadata;
    return {
      id: chunk.id,
      content: chunk.content,
      vector: vectors[i],
      source: meta.source,
      // 頻繁にフィルタリングされるフィールドを個別カラムに展開
      // Note: LanceDBはnullの型推論ができないため空文字列を使用
      articleNumber: "articleNumber" in meta ? String(meta.articleNumber) : "",
      category: "category" in meta ? String(meta.category) : "",
      filename: "filename" in meta ? String(meta.filename) : "",
      metadata: JSON.stringify(meta),
    };
  });

  // LanceDBはRecord<string, unknown>[]を期待するのでキャスト
  // Note: これはLanceDBのAPI制約によるもの
  const records = data as unknown as Record<string, unknown>[];

  try {
    if (tableNames.includes(TABLE_NAME)) {
      // 既存テーブルに追加
      const table = await db.openTable(TABLE_NAME);
      await table.add(records);
    } else {
      // 新規テーブル作成
      await db.createTable(TABLE_NAME, records);
    }
  } catch (e) {
    throw new VectorStoreError(
      `Failed to add documents to table: ${e instanceof Error ? e.message : String(e)}`,
      "addDocuments",
      e instanceof Error ? e : undefined,
    );
  }
}

/**
 * 検索結果行を安全にSearchResultに変換
 */
function parseSearchResult(row: Record<string, unknown>): SearchResult {
  const id = row.id;
  const content = row.content;
  const source = row.source;
  const articleNumber = row.articleNumber;
  const category = row.category;
  const filename = row.filename;
  const metadataStr = row.metadata;
  const distance = row._distance;

  // 必須フィールドの型チェック
  if (typeof id !== "string") {
    throw new Error(`Invalid id type: expected string, got ${typeof id}`);
  }
  if (typeof content !== "string") {
    throw new Error(`Invalid content type: expected string, got ${typeof content}`);
  }
  if (typeof source !== "string") {
    throw new Error(`Invalid source type: expected string, got ${typeof source}`);
  }
  if (typeof metadataStr !== "string") {
    throw new Error(`Invalid metadata type: expected string, got ${typeof metadataStr}`);
  }
  if (typeof distance !== "number") {
    throw new Error(`Invalid _distance type: expected number, got ${typeof distance}`);
  }

  // ソースのバリデーション
  const validatedSource = validateSource(source);

  // JSONパースを安全に実行
  let metadata: Record<string, unknown>;
  try {
    metadata = JSON.parse(metadataStr) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`Failed to parse metadata JSON: ${e instanceof Error ? e.message : String(e)}`);
  }

  return {
    id,
    content,
    source: validatedSource,
    articleNumber: typeof articleNumber === "string" ? articleNumber : "",
    category: typeof category === "string" ? category : "",
    filename: typeof filename === "string" ? filename : "",
    metadata,
    score: distance,
  };
}

/**
 * ベクトル検索を実行
 * @throws {VectorStoreError} 検索失敗時
 */
export async function search(
  query: string,
  options: {
    limit?: number;
    source?: SourceType;
  } = {},
): Promise<SearchResult[]> {
  const { limit = 5, source } = options;

  // クエリの検証
  if (!query || query.trim().length === 0) {
    throw new VectorStoreError("Query cannot be empty", "search");
  }

  const table = await getTable();

  let queryVector: number[];
  try {
    queryVector = await embedText(query);
  } catch (e) {
    throw new VectorStoreError(
      `Failed to generate query embedding: ${e instanceof Error ? e.message : String(e)}`,
      "embedText",
      e instanceof Error ? e : undefined,
    );
  }

  let searchQuery = table.vectorSearch(queryVector).limit(limit);

  // ソースでフィルタリング（バリデーション済みの値のみ使用）
  if (source) {
    const validatedSource = validateSource(source);
    searchQuery = searchQuery.where(`source = '${validatedSource}'`);
  }

  let results: Record<string, unknown>[];
  try {
    results = await searchQuery.toArray();
  } catch (e) {
    throw new VectorStoreError(
      `Failed to execute search: ${e instanceof Error ? e.message : String(e)}`,
      "vectorSearch",
      e instanceof Error ? e : undefined,
    );
  }

  return results.map((row) => parseSearchResult(row as Record<string, unknown>));
}

/**
 * 複数ソースから並列検索
 * デフォルトで法令・ガイドライン・Q&A全てを検索
 * 結果は距離（類似度）順にソート
 */
export async function multiSearch(
  query: string,
  options: {
    limitPerSource?: number;
    sources?: SourceType[];
  } = {},
): Promise<SearchResult[]> {
  // デフォルトで全ソースを検索（Q&Aも含む）
  const { limitPerSource = 3, sources = ["law", "guideline", "qa"] } = options;

  const searches = sources.map((source) => search(query, { limit: limitPerSource, source }));

  const results = await Promise.all(searches);
  // 全結果を距離順（昇順）でソート
  return results.flat().sort((a, b) => a.score - b.score);
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
