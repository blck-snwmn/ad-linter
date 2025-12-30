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
 * 消費者庁Q&Aページの実際の構造:
 *
 * representation/guideline ページ:
 *   <dl>
 *     <dt>
 *       <span class="question" id="q1">Q1</span>
 *       <span>質問文</span>
 *     </dt>
 *     <dd>
 *       <span>A</span>
 *       <div>回答文</div>
 *     </dd>
 *   </dl>
 *
 * premium ページ:
 *   ナビゲーションのみ（Q&Aコンテンツなし、PDFダウンロードリンクあり）
 */
function parseQaHtml(html: string, source: QaSource): { title: string; items: QaItem[] } {
  const $ = cheerio.load(html);
  const items: QaItem[] = [];

  // ページタイトルを取得
  const title =
    $("#main h1, article h1").first().text().trim() ||
    $("h1").first().text().trim() ||
    "景品表示法Q&A";

  // メインコンテンツエリアを特定
  const $main = $("#main, article").first();
  const $content = $main.length > 0 ? $main : $("body");

  // パターン1（優先）: dl/dt/dd 形式（消費者庁Q&Aの実際の構造）
  // 各dlを処理
  $content.find("dl").each((_, dl) => {
    const $dl = $(dl);

    // この dl の直前の h2 を探してカテゴリを特定
    let category = "一般";
    let $prev = $dl.prev();
    while ($prev.length > 0) {
      if ($prev[0].tagName.toLowerCase() === "h2") {
        const headingText = $prev.text().trim();
        if (
          headingText &&
          !headingText.includes("消費者の方") &&
          !headingText.includes("相談員")
        ) {
          category = headingText;
        }
        break;
      }
      $prev = $prev.prev();
    }

    // dt/dd ペアを処理
    const dts = $dl.find("> dt");
    dts.each((i, dt) => {
      const $dt = $(dt);

      // 質問を取得: <span class="question" id="qN">QN</span> の次の <span> から
      const $questionSpan = $dt.find("span.question");
      if ($questionSpan.length === 0) {
        return; // Q&A形式でない dt はスキップ
      }

      const questionId = $questionSpan.attr("id") || "";
      const $questionTextSpan = $questionSpan.next("span");
      const questionText = $questionTextSpan.text().trim();

      if (!questionText || questionText.length < 5) {
        return;
      }

      // 回答を取得: 対応する dd 内の div から
      // dt の次の dd を取得
      const $dd = $dt.next("dd");
      if ($dd.length === 0) {
        return;
      }

      // dd 内の回答テキストを取得（"A" ラベルを除外）
      // <span>A</span> の次にある <div> から取得
      const $answerDiv = $dd.find("> div");
      let answerText = "";

      if ($answerDiv.length > 0) {
        answerText = $answerDiv.text().trim();
      } else {
        // div がない場合は dd 全体のテキストから "A" を除去
        answerText = $dd
          .text()
          .trim()
          .replace(/^A\s*/, "");
      }

      if (answerText && answerText.length > 10) {
        items.push({
          id: `${source}-${questionId || `q${items.length + 1}`}`,
          category,
          question: cleanText(questionText),
          answer: cleanText(answerText),
        });
      }
    });
  });

  // パターン2（フォールバック）: アンカーリンク形式
  // パターン1で見つからなかった場合のみ実行
  if (items.length === 0) {
    // #qN 形式のリンクを収集
    const qaLinks: { question: string; targetId: string }[] = [];

    $content.find('li a[href^="#q"]').each((_, a) => {
      const $a = $(a);
      const href = $a.attr("href") || "";

      if (/^#q\d+$/i.test(href)) {
        const question = $a.text().trim();
        if (question.length > 10) {
          qaLinks.push({
            question,
            targetId: href.replace("#", ""),
          });
        }
      }
    });

    // 各質問に対応する回答を取得
    for (const qa of qaLinks) {
      const $target = $content.find(`#${qa.targetId}`);
      if ($target.length === 0) continue;

      // ターゲット要素の親（dt）の次（dd）から回答を取得
      const $dt = $target.closest("dt");
      if ($dt.length > 0) {
        const $dd = $dt.next("dd");
        if ($dd.length > 0) {
          const answerText = $dd.find("> div").text().trim() || $dd.text().replace(/^A\s*/, "").trim();
          if (answerText.length > 10) {
            items.push({
              id: `${source}-${qa.targetId}`,
              category: "一般",
              question: cleanText(qa.question),
              answer: cleanText(answerText),
            });
          }
        }
      }
    }
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
