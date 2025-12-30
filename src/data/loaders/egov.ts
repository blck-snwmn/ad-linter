/**
 * e-Gov法令API v2 クライアント
 * https://laws.e-gov.go.jp/api/2/swagger-ui/
 */

import axios from "axios";

const EGOV_API_BASE = "https://laws.e-gov.go.jp/api/2";

// 景品表示法の法令ID
const KEIHYO_LAW_ID = "337AC0000000134";

export interface LawArticle {
  articleNumber: string;
  articleTitle?: string;
  content: string;
  paragraphs: {
    paragraphNumber: number;
    content: string;
    items: {
      itemNumber: string;
      content: string;
    }[];
  }[];
}

export interface LawData {
  lawId: string;
  lawNumber: string;
  lawTitle: string;
  articles: LawArticle[];
  rawXml?: string;
}

/**
 * 法令XMLをパースして構造化データに変換
 */
function parseLawXml(xml: string): LawArticle[] {
  const articles: LawArticle[] = [];

  // 条（Article）を抽出
  const articleRegex =
    /<Article[^>]*Num="(\d+)"[^>]*>[\s\S]*?<\/Article>/g;
  let articleMatch;

  while ((articleMatch = articleRegex.exec(xml)) !== null) {
    const articleNum = articleMatch[1];
    const articleXml = articleMatch[0];

    // 条のタイトル
    const titleMatch = articleXml.match(/<ArticleTitle>([^<]+)<\/ArticleTitle>/);
    const articleTitle = titleMatch ? titleMatch[1] : undefined;

    // 項（Paragraph）を抽出
    const paragraphs: LawArticle["paragraphs"] = [];
    const paragraphRegex =
      /<Paragraph[^>]*Num="(\d+)"[^>]*>[\s\S]*?<\/Paragraph>/g;
    let paragraphMatch;

    while ((paragraphMatch = paragraphRegex.exec(articleXml)) !== null) {
      const paragraphNum = parseInt(paragraphMatch[1], 10);
      const paragraphXml = paragraphMatch[0];

      // 項の本文（Sentence）
      const sentenceMatches = paragraphXml.match(
        /<Sentence[^>]*>([^<]+)<\/Sentence>/g
      );
      const paragraphContent = sentenceMatches
        ? sentenceMatches
            .map((s) => s.replace(/<\/?Sentence[^>]*>/g, ""))
            .join("")
        : "";

      // 号（Item）を抽出
      const items: LawArticle["paragraphs"][0]["items"] = [];
      const itemRegex = /<Item[^>]*Num="(\d+)"[^>]*>[\s\S]*?<\/Item>/g;
      let itemMatch;

      while ((itemMatch = itemRegex.exec(paragraphXml)) !== null) {
        const itemNum = itemMatch[1];
        const itemXml = itemMatch[0];
        const itemSentences = itemXml.match(
          /<Sentence[^>]*>([^<]+)<\/Sentence>/g
        );
        const itemContent = itemSentences
          ? itemSentences
              .map((s) => s.replace(/<\/?Sentence[^>]*>/g, ""))
              .join("")
          : "";

        items.push({
          itemNumber: itemNum,
          content: itemContent,
        });
      }

      paragraphs.push({
        paragraphNumber: paragraphNum,
        content: paragraphContent,
        items,
      });
    }

    // 条全体のコンテンツ（項がない場合のフォールバック）
    let articleContent = "";
    if (paragraphs.length === 0) {
      const sentenceMatches = articleXml.match(
        /<Sentence[^>]*>([^<]+)<\/Sentence>/g
      );
      articleContent = sentenceMatches
        ? sentenceMatches
            .map((s) => s.replace(/<\/?Sentence[^>]*>/g, ""))
            .join("")
        : "";
    }

    articles.push({
      articleNumber: articleNum,
      articleTitle,
      content: articleContent,
      paragraphs,
    });
  }

  return articles;
}

/**
 * 景品表示法の条文を取得
 */
export async function fetchKeihyoLaw(): Promise<LawData> {
  const url = `${EGOV_API_BASE}/laws/${KEIHYO_LAW_ID}`;

  const response = await axios.get(url, {
    headers: {
      Accept: "application/xml",
    },
  });

  const xml = response.data as string;

  // 法令番号とタイトルを抽出
  const lawNumMatch = xml.match(/<LawNum>([^<]+)<\/LawNum>/);
  const lawTitleMatch = xml.match(/<LawTitle>([^<]+)<\/LawTitle>/);

  const articles = parseLawXml(xml);

  return {
    lawId: KEIHYO_LAW_ID,
    lawNumber: lawNumMatch ? lawNumMatch[1] : "",
    lawTitle: lawTitleMatch ? lawTitleMatch[1] : "不当景品類及び不当表示防止法",
    articles,
    rawXml: xml,
  };
}

/**
 * 条文をテキスト形式に変換（チャンク分割用）
 */
export function articleToText(article: LawArticle): string {
  const lines: string[] = [];

  const title = article.articleTitle
    ? `第${article.articleNumber}条（${article.articleTitle}）`
    : `第${article.articleNumber}条`;

  lines.push(title);

  if (article.content) {
    lines.push(article.content);
  }

  for (const paragraph of article.paragraphs) {
    const prefix =
      paragraph.paragraphNumber === 1 ? "" : `${paragraph.paragraphNumber}　`;
    lines.push(`${prefix}${paragraph.content}`);

    for (const item of paragraph.items) {
      lines.push(`　${item.itemNumber}　${item.content}`);
    }
  }

  return lines.join("\n");
}

/**
 * 法令全体をテキスト形式に変換
 */
export function lawToText(law: LawData): string {
  const header = `${law.lawTitle}（${law.lawNumber}）\n\n`;
  const body = law.articles.map(articleToText).join("\n\n");
  return header + body;
}
