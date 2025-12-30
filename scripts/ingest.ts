/**
 * データ取り込みスクリプト
 * 法令・Q&A・ガイドラインを取得し、ベクトルストアに格納
 */

import "dotenv/config";
import { join } from "path";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { fetchKeihyoLaw } from "../src/data/loaders/egov.js";
import { fetchAllQa } from "../src/data/loaders/qa.js";
import { loadDownloadedGuidelines } from "../src/data/loaders/guideline.js";
import { chunkLaw } from "../src/data/chunkers/law.js";
import { chunkAllQa } from "../src/data/chunkers/qa.js";
import { chunkGuideline } from "../src/data/chunkers/guideline.js";
import { addDocuments, clearTable, countDocuments } from "../src/retrieval/vectorStore.js";

const DATA_DIR = join(process.cwd(), "data", "raw");
const CACHE_DIR = join(process.cwd(), "data", "cache");

/**
 * キャッシュディレクトリを作成
 */
function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

async function main() {
  console.log("=== データ取り込み開始 ===\n");

  // キャッシュディレクトリを作成
  ensureCacheDir();

  // 既存データをクリア
  console.log("既存データをクリア中...");
  await clearTable();

  let totalChunks = 0;

  // === 1. 法令データ ===
  console.log("\n--- 1. 法令データ ---");
  try {
    console.log("e-Gov APIから景品表示法を取得中...");
    const law = await fetchKeihyoLaw();
    console.log(`✓ 取得完了: ${law.lawTitle} (${law.articles.length}条)`);

    // ローカルキャッシュに保存（Claude Code等で読めるように）
    const lawCachePath = join(CACHE_DIR, "keihyo-law.json");
    const lawForCache = {
      lawId: law.lawId,
      lawNumber: law.lawNumber,
      lawTitle: law.lawTitle,
      articles: law.articles,
      fetchedAt: new Date().toISOString(),
    };
    writeFileSync(lawCachePath, JSON.stringify(lawForCache, null, 2), "utf-8");
    console.log(`✓ ローカルキャッシュに保存: ${lawCachePath}`);

    // 生XMLも保存（デバッグ・監査用）
    if (law.rawXml) {
      const xmlCachePath = join(CACHE_DIR, "keihyo-law.xml");
      writeFileSync(xmlCachePath, law.rawXml, "utf-8");
      console.log(`✓ 生XMLを保存: ${xmlCachePath}`);
    }

    console.log("チャンク分割中...");
    const lawChunks = chunkLaw(law, { chunkBy: "article" });
    console.log(`法令チャンク数: ${lawChunks.length}`);

    console.log("ベクトルストアに追加中...");
    await addDocuments(lawChunks);
    totalChunks += lawChunks.length;
  } catch (e) {
    console.error(`✗ 法令取得失敗: ${e instanceof Error ? e.message : String(e)}`);
  }

  // === 2. Q&Aデータ ===
  console.log("\n--- 2. Q&Aデータ ---");
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
      console.log(`✓ Q&A取得完了: ${qaDataList.length}ソース`);
      for (const qa of qaDataList) {
        console.log(`  - ${qa.source}: ${qa.items.length}件`);
      }

      // ローカルキャッシュに保存（Claude Code等で読めるように）
      const qaCachePath = join(CACHE_DIR, "qa-data.json");
      const qaForCache = qaDataList.map((qa) => ({
        source: qa.source,
        title: qa.title,
        url: qa.url,
        items: qa.items,
        fetchedAt: qa.fetchedAt.toISOString(),
      }));
      writeFileSync(qaCachePath, JSON.stringify(qaForCache, null, 2), "utf-8");
      console.log(`✓ ローカルキャッシュに保存: ${qaCachePath}`);

      console.log("チャンク分割中...");
      const qaChunks = chunkAllQa(qaDataList);
      console.log(`Q&Aチャンク数: ${qaChunks.length}`);

      console.log("ベクトルストアに追加中...");
      await addDocuments(qaChunks);
      totalChunks += qaChunks.length;
    } else {
      console.warn("⚠ Q&Aデータが取得できませんでした");
    }
  } catch (e) {
    console.error(`✗ Q&A取得失敗: ${e instanceof Error ? e.message : String(e)}`);
  }

  // === 3. ガイドラインデータ ===
  console.log("\n--- 3. ガイドラインデータ ---");
  try {
    console.log(`ガイドラインPDFを読み込み中... (${DATA_DIR})`);
    const { documents: guideDocs, errors: guideErrors } = await loadDownloadedGuidelines(DATA_DIR);

    if (guideErrors.length > 0) {
      console.warn(`⚠ ガイドライン読み込みエラー: ${guideErrors.length}件`);
      for (const err of guideErrors) {
        console.warn(`  - ${err.message}`);
      }
    }

    if (guideDocs.length === 0) {
      console.warn("⚠ ガイドラインがダウンロードされていません");
      console.warn("  → npm run download:guidelines を先に実行してください");
    } else {
      console.log(`✓ ガイドライン読み込み完了: ${guideDocs.length}件`);

      console.log("チャンク分割中...");
      const guideChunks = guideDocs.flatMap((doc) => chunkGuideline(doc));
      console.log(`ガイドラインチャンク数: ${guideChunks.length}`);

      console.log("ベクトルストアに追加中...");
      await addDocuments(guideChunks);
      totalChunks += guideChunks.length;
    }
  } catch (e) {
    console.error(`✗ ガイドライン読み込み失敗: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 結果確認
  const count = await countDocuments();
  console.log(`\n=== 完了 ===`);
  console.log(`追加チャンク数: ${totalChunks}`);
  console.log(`格納ドキュメント数: ${count}`);
}

main().catch(console.error);
