/**
 * データ取り込みスクリプト
 * e-Gov APIから景品表示法を取得し、ベクトルストアに格納
 * Q&Aも消費者庁サイトから取得
 */

import { fetchKeihyoLaw } from "../src/data/loaders/egov.js";
import { fetchAllQa } from "../src/data/loaders/qa.js";
import { chunkLaw } from "../src/data/chunkers/law.js";
import { chunkAllQa } from "../src/data/chunkers/qa.js";
import { addDocuments, clearTable, countDocuments } from "../src/retrieval/vectorStore.js";

async function main() {
  console.log("=== データ取り込み開始 ===\n");

  // 既存データをクリア
  console.log("既存データをクリア中...");
  await clearTable();

  // === 法令データ ===
  console.log("\n--- 法令データ ---");
  console.log("e-Gov APIから景品表示法を取得中...");
  const law = await fetchKeihyoLaw();
  console.log(`取得完了: ${law.lawTitle} (${law.articles.length}条)`);

  // チャンク分割
  console.log("チャンク分割中...");
  const lawChunks = chunkLaw(law, { chunkBy: "article" });
  console.log(`法令チャンク数: ${lawChunks.length}`);

  // ベクトルストアに追加
  console.log("ベクトルストアに追加中...");
  await addDocuments(lawChunks);

  // === Q&Aデータ ===
  console.log("\n--- Q&Aデータ ---");
  console.log("消費者庁Q&Aを取得中...");
  const { data: qaDataList, errors: qaErrors } = await fetchAllQa();

  if (qaErrors.length > 0) {
    console.warn(`Q&A取得エラー: ${qaErrors.length}件`);
    for (const err of qaErrors) {
      console.warn(`  - ${err.message}`);
    }
  }

  if (qaDataList.length > 0) {
    console.log(`Q&A取得完了: ${qaDataList.length}ソース`);
    for (const qa of qaDataList) {
      console.log(`  - ${qa.title}: ${qa.items.length}件`);
    }

    // チャンク分割
    console.log("チャンク分割中...");
    const qaChunks = chunkAllQa(qaDataList);
    console.log(`Q&Aチャンク数: ${qaChunks.length}`);

    // ベクトルストアに追加
    console.log("ベクトルストアに追加中...");
    await addDocuments(qaChunks);
  } else {
    console.warn("Q&Aデータが取得できませんでした");
  }

  // 結果確認
  const count = await countDocuments();
  console.log(`\n=== 完了 ===`);
  console.log(`格納ドキュメント数: ${count}`);
}

main().catch(console.error);
