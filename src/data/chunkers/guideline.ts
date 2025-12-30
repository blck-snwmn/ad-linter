/**
 * ガイドライン用チャンカー
 * セクション単位 + オーバーラップでチャンク分割
 */

import type { PdfDocument } from "../loaders/pdf.js";

export interface GuidelineChunk {
  id: string;
  content: string;
  metadata: {
    source: "guideline";
    filename: string;
    title?: string;
    pageNumber?: number;
    sectionTitle?: string;
    chunkIndex: number;
  };
}

export interface GuidelineChunkerOptions {
  /** チャンクサイズ（文字数） */
  chunkSize?: number;
  /** オーバーラップサイズ（文字数） */
  chunkOverlap?: number;
  /** セクション区切りパターン */
  sectionPattern?: RegExp;
}

const DEFAULT_OPTIONS: Required<GuidelineChunkerOptions> = {
  chunkSize: 1000,
  chunkOverlap: 200,
  sectionPattern: /^(?:第[一二三四五六七八九十\d]+[章節条]|[\d]+[.．]|\([\d]+\)|【[^】]+】)/m,
};

/**
 * テキストをセクションに分割
 */
function splitIntoSections(
  text: string,
  sectionPattern: RegExp,
): { title?: string; content: string }[] {
  const sections: { title?: string; content: string }[] = [];
  const lines = text.split("\n");

  let currentSection: { title?: string; content: string[] } = { content: [] };

  for (const line of lines) {
    if (sectionPattern.test(line.trim())) {
      // 前のセクションを保存
      if (currentSection.content.length > 0) {
        sections.push({
          title: currentSection.title,
          content: currentSection.content.join("\n"),
        });
      }
      // 新しいセクション開始
      currentSection = { title: line.trim(), content: [] };
    } else {
      currentSection.content.push(line);
    }
  }

  // 最後のセクションを保存
  if (currentSection.content.length > 0) {
    sections.push({
      title: currentSection.title,
      content: currentSection.content.join("\n"),
    });
  }

  return sections;
}

/**
 * テキストを固定サイズ + オーバーラップでチャンク分割
 */
function splitWithOverlap(text: string, chunkSize: number, chunkOverlap: number): string[] {
  const chunks: string[] = [];

  if (text.length <= chunkSize) {
    return [text];
  }

  let start = 0;
  while (start < text.length) {
    let end = start + chunkSize;

    // 文の途中で切れないように調整（句点で区切る）
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf("。", end);
      if (lastPeriod > start + chunkSize / 2) {
        end = lastPeriod + 1;
      }
    }

    chunks.push(text.slice(start, end).trim());

    // 次のチャンクの開始位置
    start = end - chunkOverlap;
    if (start < 0) start = 0;

    // 無限ループ防止
    if (end >= text.length) break;
  }

  return chunks;
}

/**
 * ガイドラインPDFをチャンク分割
 */
export function chunkGuideline(
  doc: PdfDocument,
  options: GuidelineChunkerOptions = {},
): GuidelineChunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const chunks: GuidelineChunk[] = [];

  // まずセクションに分割
  const sections = splitIntoSections(doc.text, opts.sectionPattern);

  let chunkIndex = 0;
  for (const section of sections) {
    // セクションが大きい場合はさらに分割
    const sectionChunks = splitWithOverlap(section.content, opts.chunkSize, opts.chunkOverlap);

    for (const content of sectionChunks) {
      if (!content.trim()) continue;

      const chunkContent = section.title ? `${section.title}\n\n${content}` : content;

      chunks.push({
        id: `${doc.filename}-chunk${chunkIndex}`,
        content: chunkContent,
        metadata: {
          source: "guideline",
          filename: doc.filename,
          title: doc.title,
          sectionTitle: section.title,
          chunkIndex,
        },
      });

      chunkIndex++;
    }
  }

  return chunks;
}

/**
 * ページ単位でチャンク分割（シンプルな方法）
 */
export function chunkGuidelineByPage(doc: PdfDocument): GuidelineChunk[] {
  return doc.pages.map((page, index) => ({
    id: `${doc.filename}-page${page.pageNumber}`,
    content: page.text,
    metadata: {
      source: "guideline" as const,
      filename: doc.filename,
      title: doc.title,
      pageNumber: page.pageNumber,
      chunkIndex: index,
    },
  }));
}

/**
 * チャンクの内容を整形して表示用テキストに変換
 */
export function formatGuidelineChunk(chunk: GuidelineChunk): string {
  const source = chunk.metadata.title || chunk.metadata.filename;
  const header = `【ガイドライン: ${source}】`;
  return `${header}\n${chunk.content}`;
}
