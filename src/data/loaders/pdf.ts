/**
 * PDFローダー
 * 消費者庁ガイドラインPDFを読み込む
 */

import { readFile } from "fs/promises";
import pdfParse from "pdf-parse";

export interface PdfDocument {
  filename: string;
  title?: string;
  numPages: number;
  text: string;
  pages: {
    pageNumber: number;
    text: string;
  }[];
}

export interface PdfLoadOptions {
  /** ページ番号を含めるか */
  includePageNumbers?: boolean;
  /** 空白ページをスキップするか */
  skipEmptyPages?: boolean;
}

/**
 * PDFファイルを読み込み、テキストを抽出
 */
export async function loadPdf(
  filePath: string,
  options: PdfLoadOptions = {}
): Promise<PdfDocument> {
  const { includePageNumbers = true, skipEmptyPages = true } = options;

  const buffer = await readFile(filePath);
  const data = await pdfParse(buffer);

  // ファイル名を取得
  const filename = filePath.split("/").pop() || filePath;

  // ページごとのテキストを抽出
  // pdf-parseはページ区切りを\nで表現することがある
  // より正確なページ分割にはpdf.jsなどを使う必要があるが、
  // 現状はシンプルな実装で進める
  const pages: PdfDocument["pages"] = [];
  const pageTexts = data.text.split(/\f/); // フォームフィードでページ分割

  for (let i = 0; i < pageTexts.length; i++) {
    const pageText = pageTexts[i].trim();

    if (skipEmptyPages && !pageText) {
      continue;
    }

    pages.push({
      pageNumber: i + 1,
      text: includePageNumbers ? `[Page ${i + 1}]\n${pageText}` : pageText,
    });
  }

  return {
    filename,
    title: data.info?.Title || undefined,
    numPages: data.numpages,
    text: data.text,
    pages,
  };
}

/**
 * 複数のPDFファイルを読み込み
 */
export async function loadPdfs(
  filePaths: string[],
  options: PdfLoadOptions = {}
): Promise<PdfDocument[]> {
  const results = await Promise.all(
    filePaths.map((path) => loadPdf(path, options))
  );
  return results;
}

/**
 * PDFドキュメントをテキスト形式に変換
 */
export function pdfToText(doc: PdfDocument): string {
  const header = doc.title ? `# ${doc.title}\n\n` : `# ${doc.filename}\n\n`;
  return header + doc.text;
}

/**
 * ページごとのテキストを取得
 */
export function getPagesText(doc: PdfDocument): string[] {
  return doc.pages.map((page) => page.text);
}
