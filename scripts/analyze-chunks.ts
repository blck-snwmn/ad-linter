/**
 * チャンク分析スクリプト
 * RAGとしての品質を評価（法令・Q&A・ガイドライン全て）
 */

import { join } from "path";
import { fetchKeihyoLaw } from "../src/data/loaders/egov.js";
import { fetchAllQa } from "../src/data/loaders/qa.js";
import { loadDownloadedGuidelines } from "../src/data/loaders/guideline.js";
import { chunkLaw } from "../src/data/chunkers/law.js";
import { chunkAllQa } from "../src/data/chunkers/qa.js";
import { chunkGuideline } from "../src/data/chunkers/guideline.js";

const DATA_DIR = join(process.cwd(), "data", "raw");

// Embedding推奨サイズ（OpenAI: 512-2048トークン ≈ 150-6000文字）
const RECOMMENDED_MIN = 100;
const RECOMMENDED_MAX = 4000;

interface ChunkStats {
  count: number;
  minLength: number;
  maxLength: number;
  avgLength: number;
  tooSmall: number;
  tooLarge: number;
}

function calcStats(lengths: number[]): ChunkStats {
  if (lengths.length === 0) {
    return { count: 0, minLength: 0, maxLength: 0, avgLength: 0, tooSmall: 0, tooLarge: 0 };
  }
  return {
    count: lengths.length,
    minLength: Math.min(...lengths),
    maxLength: Math.max(...lengths),
    avgLength: Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length),
    tooSmall: lengths.filter((l) => l < RECOMMENDED_MIN).length,
    tooLarge: lengths.filter((l) => l > RECOMMENDED_MAX).length,
  };
}

function printStats(name: string, stats: ChunkStats) {
  console.log(`  チャンク数: ${stats.count}`);
  console.log(`  文字数: 最小=${stats.minLength}, 最大=${stats.maxLength}, 平均=${stats.avgLength}`);
  if (stats.tooSmall > 0 || stats.tooLarge > 0) {
    console.log(`  ⚠ サイズ問題: 小さすぎ=${stats.tooSmall}件, 大きすぎ=${stats.tooLarge}件`);
  } else {
    console.log(`  ✓ 全チャンクが推奨サイズ範囲内`);
  }
}

async function main() {
  console.log("=== RAGデータ品質分析 ===\n");
  console.log(`推奨チャンクサイズ: ${RECOMMENDED_MIN}-${RECOMMENDED_MAX}文字\n`);

  // === 1. 法令チャンク分析 ===
  console.log("--- 1. 法令チャンク分析 ---");
  try {
    const law = await fetchKeihyoLaw();
    console.log(`✓ 法令取得成功: ${law.lawTitle}`);

    const lawChunks = chunkLaw(law, { chunkBy: "article" });
    const lawLengths = lawChunks.map((c) => c.content.length);
    const lawStats = calcStats(lawLengths);
    printStats("法令", lawStats);

    // サンプル表示
    const article5 = lawChunks.find((c) => c.metadata.articleNumber === "5");
    if (article5) {
      console.log(`\n  【サンプル: 第5条（不当表示禁止）】`);
      console.log(`  ${article5.content.substring(0, 200)}...`);
    }
  } catch (e) {
    console.error(`✗ 法令取得失敗: ${e instanceof Error ? e.message : String(e)}`);
  }

  // === 2. Q&Aチャンク分析 ===
  console.log("\n--- 2. Q&Aチャンク分析 ---");
  try {
    const { data: qaDataList, errors: qaErrors } = await fetchAllQa();

    if (qaErrors.length > 0) {
      console.warn(`⚠ Q&A取得エラー: ${qaErrors.length}件`);
    }

    for (const qa of qaDataList) {
      console.log(`  ${qa.source}: ${qa.items.length}件`);
      // premium はナビゲーションページなので0件が正常
      if (qa.source === "premium" && qa.items.length === 0) {
        console.log(`    ℹ ナビゲーションページのため0件（正常）`);
      } else if (qa.items.length < 5 && qa.source !== "premium") {
        console.log(`    ⚠ 件数が少ない - パース問題の可能性`);
      }
    }

    if (qaDataList.length > 0) {
      const qaChunks = chunkAllQa(qaDataList);
      const qaLengths = qaChunks.map((c) => c.content.length);
      const qaStats = calcStats(qaLengths);
      printStats("Q&A", qaStats);

      // サンプル表示
      if (qaChunks.length > 0) {
        console.log(`\n  【サンプル: 最初のQ&A】`);
        console.log(`  ${qaChunks[0].content.substring(0, 200)}...`);
      }
    } else {
      console.log("  ⚠ Q&Aデータが取得できませんでした");
    }
  } catch (e) {
    console.error(`✗ Q&A取得失敗: ${e instanceof Error ? e.message : String(e)}`);
  }

  // === 3. ガイドラインチャンク分析 ===
  console.log("\n--- 3. ガイドラインチャンク分析 ---");
  try {
    const { documents: guideDocs, errors: guideErrors } = await loadDownloadedGuidelines(DATA_DIR);

    if (guideErrors.length > 0) {
      console.warn(`⚠ ガイドライン読み込みエラー: ${guideErrors.length}件`);
    }

    if (guideDocs.length === 0) {
      console.log("  ⚠ ガイドラインがダウンロードされていません");
      console.log("  → npm run download:guidelines を実行してください");
    } else {
      console.log(`✓ ガイドライン読み込み成功: ${guideDocs.length}件`);

      // 全ガイドラインをチャンク化
      const allGuideChunks = guideDocs.flatMap((doc) => chunkGuideline(doc));
      const guideLengths = allGuideChunks.map((c) => c.content.length);
      const guideStats = calcStats(guideLengths);
      printStats("ガイドライン", guideStats);

      // カテゴリ別統計
      console.log("\n  【カテゴリ別】");
      const byCategory = new Map<string, number>();
      for (const doc of guideDocs) {
        const cat = doc.guidelineInfo.category;
        byCategory.set(cat, (byCategory.get(cat) || 0) + 1);
      }
      for (const [cat, count] of byCategory) {
        console.log(`    ${cat}: ${count}件`);
      }

      // サンプル表示
      if (allGuideChunks.length > 0) {
        console.log(`\n  【サンプル: 最初のチャンク】`);
        console.log(`  ${allGuideChunks[0].content.substring(0, 200)}...`);
      }
    }
  } catch (e) {
    console.error(`✗ ガイドライン読み込み失敗: ${e instanceof Error ? e.message : String(e)}`);
  }

  // === 総合評価 ===
  console.log("\n\n=== 総合評価 ===");
  console.log("Phase 1 RAG検索の準備状況:");
  console.log("  - 法令データ: e-Gov API経由で取得可能");
  console.log("  - Q&Aデータ: HTMLスクレイピングで取得（ページ構造に依存）");
  console.log("  - ガイドライン: PDFダウンロード済みなら利用可能");
  console.log("\n次のステップ:");
  console.log("  1. OPENAI_API_KEYを設定");
  console.log("  2. npm run ingest でベクトルDBに格納");
  console.log("  3. 検索テストを実施");
}

main().catch(console.error);
