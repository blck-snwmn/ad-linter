/**
 * 法令用チャンカー
 * 条・項・号単位でチャンク分割する
 */

import type { LawData } from "../loaders/egov.js";

/** 最小チャンクサイズ（これより小さいチャンクは次のチャンクと結合） */
const MIN_CHUNK_SIZE = 100;
/** 最大チャンクサイズ（マージ後にこれを超えないようにする） */
const MAX_CHUNK_SIZE = 2000;

export interface LawChunk {
  id: string;
  content: string;
  metadata: {
    source: "law";
    lawId: string;
    lawTitle: string;
    articleNumber: string;
    articleTitle?: string;
    paragraphNumber?: number;
    itemNumber?: string;
    chunkType: "article" | "paragraph" | "item";
  };
}

export interface LawChunkerOptions {
  /** チャンク単位: article=条単位, paragraph=項単位 */
  chunkBy: "article" | "paragraph";
}

/**
 * 条単位でチャンク分割
 */
function chunkByArticle(law: LawData): LawChunk[] {
  const chunks: LawChunk[] = [];

  for (const article of law.articles) {
    const lines: string[] = [];

    // 条のタイトル
    const title = article.articleTitle
      ? `第${article.articleNumber}条（${article.articleTitle}）`
      : `第${article.articleNumber}条`;
    lines.push(title);

    // 条の本文（項がない場合）
    if (article.content) {
      lines.push(article.content);
    }

    // 項
    for (const paragraph of article.paragraphs) {
      const prefix = paragraph.paragraphNumber === 1 ? "" : `${paragraph.paragraphNumber}　`;
      lines.push(`${prefix}${paragraph.content}`);

      // 号
      for (const item of paragraph.items) {
        lines.push(`　${item.itemNumber}　${item.content}`);
      }
    }

    chunks.push({
      id: `${law.lawId}-art${article.articleNumber}`,
      content: lines.join("\n"),
      metadata: {
        source: "law",
        lawId: law.lawId,
        lawTitle: law.lawTitle,
        articleNumber: article.articleNumber,
        articleTitle: article.articleTitle,
        chunkType: "article",
      },
    });
  }

  return chunks;
}

/**
 * 項単位でチャンク分割
 */
function chunkByParagraph(law: LawData): LawChunk[] {
  const chunks: LawChunk[] = [];

  for (const article of law.articles) {
    const articleTitle = article.articleTitle
      ? `第${article.articleNumber}条（${article.articleTitle}）`
      : `第${article.articleNumber}条`;

    // 項がない場合は条単位でチャンク
    if (article.paragraphs.length === 0 && article.content) {
      chunks.push({
        id: `${law.lawId}-art${article.articleNumber}`,
        content: `${articleTitle}\n${article.content}`,
        metadata: {
          source: "law",
          lawId: law.lawId,
          lawTitle: law.lawTitle,
          articleNumber: article.articleNumber,
          articleTitle: article.articleTitle,
          chunkType: "article",
        },
      });
      continue;
    }

    // 項ごとにチャンク
    for (const paragraph of article.paragraphs) {
      const lines: string[] = [];

      // 条のタイトルを含める（コンテキストのため）
      lines.push(articleTitle);

      const prefix = paragraph.paragraphNumber === 1 ? "" : `${paragraph.paragraphNumber}　`;
      lines.push(`${prefix}${paragraph.content}`);

      // 号を含める
      for (const item of paragraph.items) {
        lines.push(`　${item.itemNumber}　${item.content}`);
      }

      chunks.push({
        id: `${law.lawId}-art${article.articleNumber}-para${paragraph.paragraphNumber}`,
        content: lines.join("\n"),
        metadata: {
          source: "law",
          lawId: law.lawId,
          lawTitle: law.lawTitle,
          articleNumber: article.articleNumber,
          articleTitle: article.articleTitle,
          paragraphNumber: paragraph.paragraphNumber,
          chunkType: "paragraph",
        },
      });
    }
  }

  return chunks;
}

/**
 * 小さすぎるチャンクを隣接チャンクとマージ
 */
function mergeSmallChunks(chunks: LawChunk[]): LawChunk[] {
  if (chunks.length === 0) return [];

  const result: LawChunk[] = [];
  let pendingChunk: LawChunk | null = null;

  for (const chunk of chunks) {
    if (pendingChunk === null) {
      if (chunk.content.length < MIN_CHUNK_SIZE) {
        pendingChunk = chunk;
      } else {
        result.push(chunk);
      }
    } else {
      const mergedContent = `${pendingChunk.content}\n\n${chunk.content}`;

      if (mergedContent.length <= MAX_CHUNK_SIZE) {
        // マージ可能 - 条番号は範囲を示す（例: "1-2"）
        const mergedArticleNumber =
          pendingChunk.metadata.articleNumber === chunk.metadata.articleNumber
            ? pendingChunk.metadata.articleNumber
            : `${pendingChunk.metadata.articleNumber}-${chunk.metadata.articleNumber}`;

        const mergedChunk: LawChunk = {
          id: `${chunk.metadata.lawId}-art${mergedArticleNumber}`,
          content: mergedContent,
          metadata: {
            ...chunk.metadata,
            articleNumber: mergedArticleNumber,
            articleTitle: pendingChunk.metadata.articleTitle || chunk.metadata.articleTitle,
          },
        };

        if (mergedChunk.content.length < MIN_CHUNK_SIZE) {
          pendingChunk = mergedChunk;
        } else {
          result.push(mergedChunk);
          pendingChunk = null;
        }
      } else {
        result.push(pendingChunk);
        if (chunk.content.length < MIN_CHUNK_SIZE) {
          pendingChunk = chunk;
        } else {
          result.push(chunk);
          pendingChunk = null;
        }
      }
    }
  }

  if (pendingChunk !== null) {
    result.push(pendingChunk);
  }

  return result;
}

/**
 * 法令をチャンク分割
 */
export function chunkLaw(
  law: LawData,
  options: LawChunkerOptions = { chunkBy: "article" },
): LawChunk[] {
  let chunks: LawChunk[];

  switch (options.chunkBy) {
    case "article":
      chunks = chunkByArticle(law);
      break;
    case "paragraph":
      chunks = chunkByParagraph(law);
      break;
    default:
      chunks = chunkByArticle(law);
  }

  // 小さすぎるチャンクをマージ
  return mergeSmallChunks(chunks);
}

/**
 * チャンクの内容を整形して表示用テキストに変換
 */
export function formatLawChunk(chunk: LawChunk): string {
  const header = `【${chunk.metadata.lawTitle}】`;
  return `${header}\n${chunk.content}`;
}
