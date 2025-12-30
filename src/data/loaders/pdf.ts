/**
 * PDFローダー
 * 消費者庁ガイドラインPDFを読み込む
 */

import { readFile } from "fs/promises";
import pdfParse from "pdf-parse";

/** PDFロード関連のエラー */
export class PdfLoadError extends Error {
  constructor(
    message: string,
    public readonly filePath?: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "PdfLoadError";
  }
}

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
 * @throws {PdfLoadError} ファイル読み込みまたはパース失敗時
 */
export async function loadPdf(
  filePath: string,
  options: PdfLoadOptions = {},
): Promise<PdfDocument> {
  const { includePageNumbers = true, skipEmptyPages = true } = options;

  // ファイル読み込み
  let buffer: Buffer;
  try {
    buffer = await readFile(filePath);
  } catch (e) {
    const error = e as NodeJS.ErrnoException;
    if (error.code === "ENOENT") {
      throw new PdfLoadError(`PDF file not found: ${filePath}`, filePath, error);
    }
    if (error.code === "EACCES") {
      throw new PdfLoadError(`Permission denied: ${filePath}`, filePath, error);
    }
    throw new PdfLoadError(`Failed to read PDF file: ${error.message}`, filePath, error);
  }

  // バッファの検証
  if (buffer.length === 0) {
    throw new PdfLoadError(`PDF file is empty: ${filePath}`, filePath);
  }

  // PDFパース
  let data: Awaited<ReturnType<typeof pdfParse>>;
  try {
    data = await pdfParse(buffer);
  } catch (e) {
    throw new PdfLoadError(
      `Failed to parse PDF: ${e instanceof Error ? e.message : String(e)}`,
      filePath,
      e instanceof Error ? e : undefined,
    );
  }

  // テキストの検証
  if (!data.text || data.text.trim().length === 0) {
    throw new PdfLoadError(`PDF contains no extractable text: ${filePath}`, filePath);
  }

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
 * 一部のファイルでエラーが発生しても続行し、成功したものを返す
 */
export async function loadPdfs(
  filePaths: string[],
  options: PdfLoadOptions & { continueOnError?: boolean } = {},
): Promise<{ documents: PdfDocument[]; errors: PdfLoadError[] }> {
  const { continueOnError = false, ...loadOptions } = options;

  if (continueOnError) {
    const documents: PdfDocument[] = [];
    const errors: PdfLoadError[] = [];

    for (const path of filePaths) {
      try {
        const doc = await loadPdf(path, loadOptions);
        documents.push(doc);
      } catch (e) {
        if (e instanceof PdfLoadError) {
          errors.push(e);
        } else {
          errors.push(
            new PdfLoadError(
              `Unexpected error: ${e instanceof Error ? e.message : String(e)}`,
              path,
              e instanceof Error ? e : undefined,
            ),
          );
        }
      }
    }

    return { documents, errors };
  }

  // continueOnError=falseの場合は最初のエラーで停止
  const results = await Promise.all(filePaths.map((path) => loadPdf(path, loadOptions)));
  return { documents: results, errors: [] };
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
