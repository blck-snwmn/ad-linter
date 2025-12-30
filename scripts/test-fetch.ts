/**
 * データ取得テストスクリプト
 * e-Gov APIとQ&A取得の動作確認（Embeddingなし）
 */

import { fetchKeihyoLaw } from "../src/data/loaders/egov.js";
import { fetchAllQa } from "../src/data/loaders/qa.js";
import { chunkLaw } from "../src/data/chunkers/law.js";
import { chunkAllQa } from "../src/data/chunkers/qa.js";

async function main() {
  console.log("=== データ取得テスト ===\n");

  // === 法令データ ===
  console.log("--- 法令データ ---");
  try {
    console.log("e-Gov APIから景品表示法を取得中...");
    const law = await fetchKeihyoLaw();
    console.log(`✓ 取得成功: ${law.lawTitle}`);
    console.log(`  法令番号: ${law.lawNumber}`);
    console.log(`  条数: ${law.articles.length}条`);

    // チャンク分割テスト
    const lawChunks = chunkLaw(law, { chunkBy: "article" });
    console.log(`  チャンク数: ${lawChunks.length}`);

    // サンプル表示
    if (lawChunks.length > 0) {
      console.log(`\n  サンプル（第1条）:`);
      console.log(`  ${lawChunks[0].content.substring(0, 200)}...`);
    }
  } catch (e) {
    console.error(`✗ 法令取得失敗: ${e instanceof Error ? e.message : String(e)}`);
  }

  // === Q&Aデータ ===
  console.log("\n--- Q&Aデータ ---");
  try {
    console.log("消費者庁Q&Aを取得中...");
    const { data: qaDataList, errors: qaErrors } = await fetchAllQa();

    if (qaErrors.length > 0) {
      console.warn(`⚠ Q&A取得エラー: ${qaErrors.length}件`);
      for (const err of qaErrors) {
        console.warn(`  - ${err.message}`);
      }
    }

    if (qaDataList.length > 0) {
      console.log(`✓ Q&A取得成功: ${qaDataList.length}ソース`);
      for (const qa of qaDataList) {
        console.log(`  - ${qa.source}: ${qa.items.length}件`);
      }

      // チャンク分割テスト
      const qaChunks = chunkAllQa(qaDataList);
      console.log(`  総チャンク数: ${qaChunks.length}`);

      // サンプル表示
      if (qaChunks.length > 0) {
        console.log(`\n  サンプル（最初のQ&A）:`);
        console.log(`  ${qaChunks[0].content.substring(0, 200)}...`);
      }
    } else {
      console.log("⚠ Q&Aデータが取得できませんでした");
      console.log(
        "  注: Q&AはHTMLスクレイピングで取得しており、ページ構造の変更で取得できない場合があります",
      );
    }
  } catch (e) {
    console.error(`✗ Q&A取得失敗: ${e instanceof Error ? e.message : String(e)}`);
  }

  console.log("\n=== テスト完了 ===");
}

main().catch(console.error);
