/**
 * データ取り込みスクリプト
 * e-Gov APIから景品表示法を取得し、ベクトルストアに格納
 */

import { fetchKeihyoLaw } from "../src/data/loaders/egov.js";
import { chunkLaw } from "../src/data/chunkers/law.js";
import { addDocuments, clearTable, countDocuments } from "../src/retrieval/vectorStore.js";

async function main() {
  console.log("=== データ取り込み開始 ===\n");

  // 既存データをクリア
  console.log("既存データをクリア中...");
  await clearTable();

  // e-Gov APIから景品表示法を取得
  console.log("e-Gov APIから景品表示法を取得中...");
  const law = await fetchKeihyoLaw();
  console.log(`取得完了: ${law.lawTitle} (${law.articles.length}条)`);

  // チャンク分割
  console.log("\nチャンク分割中...");
  const lawChunks = chunkLaw(law, { chunkBy: "article" });
  console.log(`法令チャンク数: ${lawChunks.length}`);

  // ベクトルストアに追加
  console.log("\nベクトルストアに追加中...");
  await addDocuments(lawChunks);

  // 結果確認
  const count = await countDocuments();
  console.log(`\n=== 完了 ===`);
  console.log(`格納ドキュメント数: ${count}`);
}

main().catch(console.error);
