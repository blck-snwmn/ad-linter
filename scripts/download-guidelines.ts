/**
 * ガイドラインPDFダウンロードスクリプト
 * 消費者庁からガイドラインPDFをダウンロードしてdata/raw/に保存
 */

import { join } from "path";
import { downloadAllGuidelines, loadDownloadedGuidelines, GUIDELINE_PDFS } from "../src/data/loaders/guideline.js";

const OUTPUT_DIR = join(process.cwd(), "data", "raw");

async function main() {
  console.log("=== ガイドラインPDFダウンロード ===\n");
  console.log(`出力先: ${OUTPUT_DIR}\n`);

  // 利用可能なガイドライン一覧を表示
  console.log("--- 対象ガイドライン ---");
  for (const info of GUIDELINE_PDFS) {
    console.log(`  - ${info.title} (${info.category})`);
  }
  console.log();

  // ダウンロード実行
  const forceRedownload = process.argv.includes("--force");
  if (forceRedownload) {
    console.log("強制再ダウンロードモード\n");
  }

  console.log("ダウンロード中...\n");
  const { downloaded, skipped, errors } = await downloadAllGuidelines(OUTPUT_DIR, { forceRedownload });

  // 結果表示
  if (downloaded.length > 0) {
    console.log(`✓ ダウンロード完了: ${downloaded.length}件`);
    for (const dl of downloaded) {
      console.log(`  - ${dl.title}`);
      console.log(`    → ${dl.localPath}`);
    }
  }

  if (skipped.length > 0) {
    console.log(`\n⏭ スキップ（既存ファイル）: ${skipped.length}件`);
    for (const sk of skipped) {
      console.log(`  - ${sk.title}`);
    }
  }

  if (errors.length > 0) {
    console.log(`\n✗ エラー: ${errors.length}件`);
    for (const err of errors) {
      console.log(`  - ${err.message}`);
    }
  }

  // PDFの読み込みテスト
  console.log("\n--- PDF読み込みテスト ---");
  const { documents, errors: loadErrors } = await loadDownloadedGuidelines(OUTPUT_DIR);

  if (documents.length > 0) {
    console.log(`✓ 読み込み成功: ${documents.length}件`);
    for (const doc of documents) {
      console.log(`  - ${doc.guidelineInfo.title}`);
      console.log(`    ページ数: ${doc.numPages}, 文字数: ${doc.text.length}`);
      console.log(`    内容（先頭100文字）: ${doc.text.substring(0, 100).replace(/\n/g, " ")}...`);
    }
  }

  if (loadErrors.length > 0) {
    console.log(`\n⚠ 読み込みエラー: ${loadErrors.length}件`);
    for (const err of loadErrors) {
      console.log(`  - ${err.message}`);
    }
  }

  console.log("\n=== 完了 ===");
}

main().catch(console.error);
