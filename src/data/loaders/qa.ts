/**
 * 消費者庁 景品表示法Q&Aローダー
 * HTMLスクレイピングでQ&Aを取得
 */

import axios, { AxiosError } from "axios";
import * as cheerio from "cheerio";

/** Q&Aロード関連のエラー */
export class QaLoadError extends Error {
  constructor(
    message: string,
    public readonly url?: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "QaLoadError";
  }
}

export interface QaItem {
  id: string;
  category: string;
  question: string;
  answer: string;
}

export interface QaData {
  source: "representation" | "premium" | "guideline";
  title: string;
  url: string;
  items: QaItem[];
  fetchedAt: Date;
}

/** Q&AページのURL */
const QA_URLS = {
  /** 表示に関するQ&A */
  representation:
    "https://www.caa.go.jp/policies/policy/representation/fair_labeling/faq/representation/",
  /** 景品に関するQ&A */
  premium: "https://www.caa.go.jp/policies/policy/representation/fair_labeling/faq/premium/",
  /** 指針に関するQ&A */
  guideline: "https://www.caa.go.jp/policies/policy/representation/fair_labeling/faq/guideline/",
} as const;

export type QaSource = keyof typeof QA_URLS;

/**
 * HTMLからQ&Aを抽出
 */
function parseQaHtml(html: string, source: QaSource): { title: string; items: QaItem[] } {
  const $ = cheerio.load(html);
  const items: QaItem[] = [];

  // ページタイトルを取得
  const title = $("h1").first().text().trim() || $("title").text().trim() || "景品表示法Q&A";

  // 現在のカテゴリを追跡
  let currentCategory = "一般";

  // Q&Aセクションを探す
  // 消費者庁のページは通常、定義リスト(dl/dt/dd)またはdiv構造を使用
  $("h2, h3, h4, dl, .qa-item, [class*='qa']").each((_, element) => {
    const $el = $(element);
    const tagName = element.tagName?.toLowerCase();

    // 見出しはカテゴリとして扱う
    if (tagName === "h2" || tagName === "h3" || tagName === "h4") {
      const text = $el.text().trim();
      if (text && !text.includes("Q&A") && !text.includes("よくある質問")) {
        currentCategory = text;
      }
      return;
    }

    // 定義リスト形式のQ&A
    if (tagName === "dl") {
      const dts = $el.find("dt");
      const dds = $el.find("dd");

      dts.each((i, dt) => {
        const question = $(dt).text().trim();
        const answer = $(dds.eq(i)).text().trim();

        if (question && answer) {
          items.push({
            id: `${source}-q${items.length + 1}`,
            category: currentCategory,
            question: cleanText(question),
            answer: cleanText(answer),
          });
        }
      });
    }
  });

  // Q&Aが見つからない場合、別のパターンを試す
  if (items.length === 0) {
    // テーブル形式のQ&A
    $("table tr").each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length >= 2) {
        const question = $(cells[0]).text().trim();
        const answer = $(cells[1]).text().trim();

        if (question && answer && question.length > 5) {
          items.push({
            id: `${source}-q${items.length + 1}`,
            category: currentCategory,
            question: cleanText(question),
            answer: cleanText(answer),
          });
        }
      }
    });
  }

  // まだ見つからない場合、リンクを含むリストを探す
  if (items.length === 0) {
    $("a[href*='#q']").each((_, link) => {
      const question = $(link).text().trim();
      const href = $(link).attr("href");
      if (question && href) {
        // リンク先のコンテンツを探す
        const targetId = href.replace("#", "");
        const targetEl = $(`#${targetId}, [name="${targetId}"]`);
        if (targetEl.length > 0) {
          // 回答はターゲット要素の次の兄弟または親の次の要素
          const answerEl = targetEl.next();
          const answer = answerEl.text().trim();
          if (answer) {
            items.push({
              id: `${source}-q${items.length + 1}`,
              category: currentCategory,
              question: cleanText(question),
              answer: cleanText(answer),
            });
          }
        }
      }
    });
  }

  return { title, items };
}

/**
 * テキストのクリーニング
 */
function cleanText(text: string): string {
  return text
    .replace(/\s+/g, " ") // 連続する空白を1つに
    .replace(/^\s+|\s+$/g, "") // 前後の空白を削除
    .replace(/\n{3,}/g, "\n\n"); // 3つ以上の改行を2つに
}

/**
 * Q&Aページを取得
 * @throws {QaLoadError} 取得失敗時
 */
export async function fetchQa(source: QaSource): Promise<QaData> {
  const url = QA_URLS[source];

  let html: string;
  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; AdLinter/1.0; +https://github.com/example/ad-linter)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "ja,en;q=0.9",
      },
      timeout: 30000,
      responseType: "text",
    });
    html = response.data as string;
  } catch (e) {
    if (e instanceof AxiosError) {
      throw new QaLoadError(`Failed to fetch Q&A from ${url}: ${e.message}`, url, e);
    }
    throw new QaLoadError(
      `Failed to fetch Q&A from ${url}: ${e instanceof Error ? e.message : String(e)}`,
      url,
      e instanceof Error ? e : undefined,
    );
  }

  // HTMLの基本検証
  if (!html || html.length < 100) {
    throw new QaLoadError(`Invalid response from ${url}: too short`, url);
  }

  const { title, items } = parseQaHtml(html, source);

  return {
    source,
    title,
    url,
    items,
    fetchedAt: new Date(),
  };
}

/**
 * 全Q&Aソースから取得
 */
export async function fetchAllQa(): Promise<{
  data: QaData[];
  errors: QaLoadError[];
}> {
  const sources: QaSource[] = ["representation", "premium", "guideline"];
  const data: QaData[] = [];
  const errors: QaLoadError[] = [];

  for (const source of sources) {
    try {
      const qaData = await fetchQa(source);
      data.push(qaData);
    } catch (e) {
      if (e instanceof QaLoadError) {
        errors.push(e);
      } else {
        errors.push(
          new QaLoadError(
            `Unexpected error fetching ${source}: ${e instanceof Error ? e.message : String(e)}`,
            QA_URLS[source],
            e instanceof Error ? e : undefined,
          ),
        );
      }
    }
  }

  return { data, errors };
}
