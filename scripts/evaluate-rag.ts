/**
 * RAG評価スクリプト
 * 検索品質・チャンク戦略の評価
 */

import "dotenv/config";
import { multiSearch, type SearchResult } from "../src/retrieval/vectorStore.js";

/** 評価用クエリ */
const TEST_QUERIES = [
  // === 基本的な法令検索 ===
  {
    query: "優良誤認とは何ですか",
    expectedSources: ["law", "qa"],
    description: "優良誤認の定義（第5条1項1号）",
  },
  {
    query: "有利誤認表示の要件",
    expectedSources: ["law", "qa"],
    description: "有利誤認の要件（第5条1項2号）",
  },
  {
    query: "景品表示法の罰則",
    expectedSources: ["law"],
    description: "罰則規定",
  },

  // === 景品規制（重要：レビュー指摘で追加） ===
  // Note: "qa"を含めていないのは意図的。premium Q&Aはナビゲーションページで0件。
  // 景品規制の詳細はガイドラインPDFに含まれている。
  {
    query: "景品類の上限額はいくらですか",
    expectedSources: ["law", "guideline"],
    description: "景品規制の金額制限",
  },
  {
    query: "オープン懸賞とクローズド懸賞の違い",
    expectedSources: ["guideline"],
    description: "懸賞の種類",
  },
  {
    query: "総付景品の制限",
    expectedSources: ["law", "guideline"],
    description: "総付景品（ベタ付け）規制",
  },

  // === 不実証広告規制（重要：レビュー指摘で追加） ===
  {
    query: "合理的な根拠を示す資料とは",
    expectedSources: ["law", "guideline"],
    description: "不実証広告規制（第7条）",
  },
  {
    query: "効果効能の根拠資料の要件",
    expectedSources: ["guideline", "law"],
    description: "効果効能表示の根拠",
  },

  // === Q&A向け検索 ===
  {
    query: "二重価格表示は違法ですか",
    expectedSources: ["qa", "guideline", "law"],
    description: "二重価格表示の適法性",
  },
  {
    query: "「当社比」という表示は問題ありますか",
    expectedSources: ["qa", "guideline"],
    description: "比較広告の可否",
  },

  // === ガイドライン向け検索 ===
  {
    query: "打消し表示のガイドライン",
    expectedSources: ["guideline", "law"],
    description: "打消し表示のルール",
  },
  {
    query: "ステルスマーケティングの規制",
    expectedSources: ["guideline", "law"],
    description: "ステマ規制の内容",
  },

  // === その他重要論点（レビュー指摘で追加） ===
  {
    query: "おとり広告の定義",
    expectedSources: ["qa", "law", "guideline"],
    description: "おとり広告規制（指定告示）",
  },
  {
    query: "措置命令が出されるケース",
    expectedSources: ["law", "guideline"],
    description: "措置命令の要件",
  },

  // === 実務的なシナリオ ===
  {
    query: "「業界No.1」という広告表示",
    expectedSources: ["qa", "guideline"],
    description: "No.1表示の注意点",
  },
  {
    query: "口コミ・レビューの規制",
    expectedSources: ["guideline", "qa"],
    description: "口コミ規制",
  },
  {
    query: "課徴金の計算方法",
    expectedSources: ["law", "guideline"],
    description: "課徴金制度の詳細",
  },
];

/**
 * 検索結果を評価
 */
function evaluateResults(
  _query: string,
  results: SearchResult[],
  expectedSources: string[],
): {
  sourceMatchAny: boolean; // いずれかの期待ソースがマッチ
  sourceMatchAll: boolean; // 全ての期待ソースがマッチ
  contextQuality: "good" | "partial" | "poor";
  details: string[];
} {
  const details: string[] = [];

  // 1. ソースマッチ評価（緩い: いずれか一致、厳密: 全て一致）
  const foundSources = new Set(results.map((r) => r.source));
  const sourceMatchAny = expectedSources.some((s) =>
    foundSources.has(s as "law" | "guideline" | "qa"),
  );
  const sourceMatchAll = expectedSources.every((s) =>
    foundSources.has(s as "law" | "guideline" | "qa"),
  );
  const matchedSources = expectedSources.filter((s) =>
    foundSources.has(s as "law" | "guideline" | "qa"),
  );
  details.push(
    `期待ソース: ${expectedSources.join(", ")} → 取得: ${[...foundSources].join(", ")} (${matchedSources.length}/${expectedSources.length}マッチ)`,
  );

  // 2. コンテキスト品質評価
  let contextQuality: "good" | "partial" | "poor" = "poor";

  if (results.length === 0) {
    details.push("⚠ 検索結果なし");
  } else {
    // 各結果のコンテキスト長をチェック
    const avgLength = results.reduce((sum, r) => sum + r.content.length, 0) / results.length;
    const hasGoodContext = results.some((r) => r.content.length >= 200);
    const hasSectionTitle = results.some(
      (r) => r.content.includes("第") || r.content.includes("【") || r.content.includes("Q:"),
    );

    if (hasGoodContext && hasSectionTitle) {
      contextQuality = "good";
      details.push(`✓ 十分なコンテキスト（平均${Math.round(avgLength)}文字）`);
    } else if (hasGoodContext || hasSectionTitle) {
      contextQuality = "partial";
      details.push(`△ 部分的なコンテキスト（平均${Math.round(avgLength)}文字）`);
    } else {
      details.push(`✗ コンテキスト不足（平均${Math.round(avgLength)}文字）`);
    }
  }

  return { sourceMatchAny, sourceMatchAll, contextQuality, details };
}

/**
 * チャンク品質を分析
 */
function analyzeChunkQuality(results: SearchResult[]): {
  overlapDetected: boolean;
  fragmentationRisk: boolean;
  recommendations: string[];
} {
  const recommendations: string[] = [];

  // オーバーラップ検出（同じ内容が複数チャンクに含まれているか）
  let overlapDetected = false;
  for (let i = 0; i < results.length; i++) {
    for (let j = i + 1; j < results.length; j++) {
      const content1 = results[i].content;
      const content2 = results[j].content;
      // 50文字以上の共通部分があればオーバーラップと判定
      if (content1.length >= 50 && content2.length >= 50) {
        const overlap = findCommonSubstring(content1, content2, 50);
        if (overlap) {
          overlapDetected = true;
          break;
        }
      }
    }
    if (overlapDetected) break;
  }

  // フラグメンテーションリスク（短すぎるチャンクがあるか）
  const shortChunks = results.filter((r) => r.content.length < 150);
  const fragmentationRisk = shortChunks.length > results.length / 2;

  if (overlapDetected) {
    recommendations.push("オーバーラップあり - 文脈の連続性が保たれている可能性");
  } else {
    recommendations.push("オーバーラップなし - セクション間の文脈が分断されている可能性");
  }

  if (fragmentationRisk) {
    recommendations.push("短いチャンクが多い - チャンクサイズの見直しを検討");
  }

  return { overlapDetected, fragmentationRisk, recommendations };
}

/**
 * 共通部分文字列を探す
 */
function findCommonSubstring(str1: string, str2: string, minLength: number): string | null {
  for (let len = minLength; len <= Math.min(str1.length, str2.length); len++) {
    for (let i = 0; i <= str1.length - len; i++) {
      const substr = str1.substring(i, i + len);
      if (str2.includes(substr)) {
        return substr;
      }
    }
  }
  return null;
}

async function main() {
  console.log("=== RAG評価開始 ===\n");

  let sourceMatchAnyCount = 0;
  let sourceMatchAllCount = 0;
  let goodContextCount = 0;
  const allResults: SearchResult[] = [];

  for (const testCase of TEST_QUERIES) {
    console.log(`\n--- ${testCase.description} ---`);
    console.log(`クエリ: "${testCase.query}"`);

    try {
      const results = await multiSearch(testCase.query, { limitPerSource: 3 });
      allResults.push(...results);

      const evaluation = evaluateResults(testCase.query, results, testCase.expectedSources);

      // 距離の平均を表示（関連性の目安）
      const avgDist =
        results.length > 0 ? results.reduce((sum, r) => sum + r.score, 0) / results.length : 0;
      console.log(`平均距離: ${avgDist.toFixed(3)}（低いほど関連性が高い）`);
      console.log(
        `ソースマッチ: いずれか=${evaluation.sourceMatchAny ? "✓" : "✗"}, 全て=${evaluation.sourceMatchAll ? "✓" : "✗"}`,
      );
      console.log(`コンテキスト品質: ${evaluation.contextQuality}`);
      for (const detail of evaluation.details) {
        console.log(`  ${detail}`);
      }

      // トップ結果を表示
      if (results.length > 0) {
        console.log(`\n  【トップ結果】`);
        const top = results[0];
        console.log(`  ソース: ${top.source}, 距離: ${top.score.toFixed(4)}`);
        console.log(`  内容（先頭150字）: ${top.content.substring(0, 150).replace(/\n/g, " ")}...`);
      }

      if (evaluation.sourceMatchAny) sourceMatchAnyCount++;
      if (evaluation.sourceMatchAll) sourceMatchAllCount++;
      if (evaluation.contextQuality === "good") goodContextCount++;
    } catch (e) {
      console.error(`  ✗ エラー: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 総合評価
  console.log("\n\n=== 総合評価 ===");
  console.log(`テストケース数: ${TEST_QUERIES.length}`);
  console.log(
    `ソースマッチ率（いずれか）: ${((sourceMatchAnyCount / TEST_QUERIES.length) * 100).toFixed(1)}%`,
  );
  console.log(
    `ソースマッチ率（全て）: ${((sourceMatchAllCount / TEST_QUERIES.length) * 100).toFixed(1)}%`,
  );
  console.log(
    `良好コンテキスト率: ${((goodContextCount / TEST_QUERIES.length) * 100).toFixed(1)}%`,
  );

  // チャンク品質分析
  console.log("\n\n=== チャンク戦略評価 ===");
  const chunkAnalysis = analyzeChunkQuality(allResults);
  console.log(`オーバーラップ検出: ${chunkAnalysis.overlapDetected ? "あり" : "なし"}`);
  console.log(`フラグメンテーションリスク: ${chunkAnalysis.fragmentationRisk ? "高" : "低"}`);
  for (const rec of chunkAnalysis.recommendations) {
    console.log(`  → ${rec}`);
  }

  // ソース別統計
  console.log("\n\n=== ソース別統計 ===");
  const sourceStats = new Map<string, { count: number; avgLength: number; avgScore: number }>();
  for (const result of allResults) {
    const stats = sourceStats.get(result.source) || { count: 0, avgLength: 0, avgScore: 0 };
    stats.count++;
    stats.avgLength = (stats.avgLength * (stats.count - 1) + result.content.length) / stats.count;
    stats.avgScore = (stats.avgScore * (stats.count - 1) + result.score) / stats.count;
    sourceStats.set(result.source, stats);
  }
  for (const [source, stats] of sourceStats) {
    console.log(
      `${source}: ${stats.count}件, 平均長=${Math.round(stats.avgLength)}文字, 平均距離=${stats.avgScore.toFixed(4)}`,
    );
  }

  // 改善提案
  console.log("\n\n=== 改善提案 ===");
  if (sourceMatchAnyCount < TEST_QUERIES.length * 0.9) {
    console.log("- ソースマッチ率（いずれか）が低い: 検索クエリまたはチャンク戦略の見直しを検討");
  }
  if (sourceMatchAllCount < TEST_QUERIES.length * 0.5) {
    console.log(
      "- ソースマッチ率（全て）が低い: multiSearchの各ソースからバランスよく取得できていない可能性",
    );
  }
  if (goodContextCount < TEST_QUERIES.length * 0.7) {
    console.log("- コンテキスト品質が低い: チャンクサイズの拡大またはオーバーラップの追加を検討");
  }
  if (
    sourceMatchAnyCount >= TEST_QUERIES.length * 0.9 &&
    goodContextCount >= TEST_QUERIES.length * 0.8
  ) {
    console.log("✓ RAG品質は良好です。Phase 2のAgent構築に進めます。");
  }
}

main().catch(console.error);
