/**
 * Q&A用チャンカー
 * 質問-回答ペア単位でチャンク分割する
 */

import type { QaData, QaItem } from "../loaders/qa.js";

export interface QaChunk {
  id: string;
  content: string;
  metadata: {
    source: "qa";
    qaSource: "representation" | "premium" | "guideline" | "purchase";
    category: string;
    originalId: string;
    url: string;
  };
}

export interface QaChunkerOptions {
  /** Q&Aを結合するか（関連するQ&Aを1チャンクにまとめる） */
  combineRelated?: boolean;
  /** 最大チャンクサイズ（文字数） */
  maxChunkSize?: number;
}

/**
 * 1つのQ&Aアイテムをチャンクに変換
 */
function qaItemToChunk(item: QaItem, qaData: QaData): QaChunk {
  const content = formatQaContent(item);

  return {
    id: item.id,
    content,
    metadata: {
      source: "qa",
      qaSource: qaData.source,
      category: item.category,
      originalId: item.id,
      url: qaData.url,
    },
  };
}

/**
 * Q&Aコンテンツをフォーマット
 */
function formatQaContent(item: QaItem): string {
  const lines: string[] = [];

  // カテゴリを含める
  if (item.category) {
    lines.push(`【${item.category}】`);
  }

  // 質問
  lines.push(`Q: ${item.question}`);

  // 回答
  lines.push(`A: ${item.answer}`);

  return lines.join("\n\n");
}

/**
 * Q&Aデータをチャンク分割
 */
export function chunkQa(qaData: QaData, options: QaChunkerOptions = {}): QaChunk[] {
  const { combineRelated = false, maxChunkSize = 2000 } = options;

  if (!combineRelated) {
    // 各Q&Aを個別のチャンクとして返す
    return qaData.items.map((item) => qaItemToChunk(item, qaData));
  }

  // 関連するQ&Aを結合する場合
  const chunks: QaChunk[] = [];
  const itemsByCategory = new Map<string, QaItem[]>();

  // カテゴリごとにグループ化
  for (const item of qaData.items) {
    const category = item.category || "一般";
    if (!itemsByCategory.has(category)) {
      itemsByCategory.set(category, []);
    }
    itemsByCategory.get(category)!.push(item);
  }

  // カテゴリごとにチャンクを作成
  for (const [category, items] of itemsByCategory) {
    let currentContent = "";
    let currentItems: QaItem[] = [];
    let chunkIndex = 1;

    for (const item of items) {
      const formattedItem = formatQaContent(item);

      // 最大サイズを超える場合は新しいチャンクを開始
      if (
        currentContent.length > 0 &&
        currentContent.length + formattedItem.length > maxChunkSize
      ) {
        // 現在のチャンクを保存
        chunks.push({
          id: `${qaData.source}-${category.replace(/\s+/g, "-")}-${chunkIndex}`,
          content: currentContent,
          metadata: {
            source: "qa",
            qaSource: qaData.source,
            category,
            originalId: currentItems.map((i) => i.id).join(","),
            url: qaData.url,
          },
        });

        currentContent = "";
        currentItems = [];
        chunkIndex++;
      }

      if (currentContent.length > 0) {
        currentContent += "\n\n---\n\n";
      }
      currentContent += formattedItem;
      currentItems.push(item);
    }

    // 残りのチャンクを保存
    if (currentContent.length > 0) {
      chunks.push({
        id: `${qaData.source}-${category.replace(/\s+/g, "-")}-${chunkIndex}`,
        content: currentContent,
        metadata: {
          source: "qa",
          qaSource: qaData.source,
          category,
          originalId: currentItems.map((i) => i.id).join(","),
          url: qaData.url,
        },
      });
    }
  }

  return chunks;
}

/**
 * 複数のQ&Aデータをチャンク分割
 */
export function chunkAllQa(qaDataList: QaData[], options: QaChunkerOptions = {}): QaChunk[] {
  const allChunks: QaChunk[] = [];

  for (const qaData of qaDataList) {
    const chunks = chunkQa(qaData, options);
    allChunks.push(...chunks);
  }

  return allChunks;
}

/**
 * チャンクの内容を整形して表示用テキストに変換
 */
export function formatQaChunk(chunk: QaChunk): string {
  const header = `【景品表示法Q&A - ${chunk.metadata.category}】`;
  return `${header}\n${chunk.content}`;
}
