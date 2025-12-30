/**
 * RAG詳細評価スクリプト
 * 各ソース別の検索結果を詳細に分析
 */

import "dotenv/config";
import { search, type SourceType } from "../src/retrieval/vectorStore.js";

/**
 * 評価用クエリ（evaluate-rag.tsと同期）
 * Note: 景品規制クエリでqaを期待しないのは、premium Q&Aが0件（ナビゲーションページ）のため
 */
const TEST_QUERIES = [
  // === 基本的な法令検索 ===
  "優良誤認とは何ですか",
  "有利誤認表示の要件",
  "景品表示法の罰則",
  // === 景品規制 ===
  "景品類の上限額はいくらですか",
  "オープン懸賞とクローズド懸賞の違い",
  "総付景品の制限",
  // === 不実証広告規制 ===
  "合理的な根拠を示す資料とは",
  "効果効能の根拠資料の要件",
  // === Q&A向け検索 ===
  "二重価格表示は違法ですか",
  "「当社比」という表示は問題ありますか",
  // === ガイドライン向け検索 ===
  "打消し表示のガイドライン",
  "ステルスマーケティングの規制",
  // === その他重要論点 ===
  "おとり広告の定義",
  "措置命令が出されるケース",
  // === 実務的なシナリオ ===
  "「業界No.1」という広告表示",
  "口コミ・レビューの規制",
  "課徴金の計算方法",
];

async function evaluateQuery(query: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`クエリ: "${query}"`);
  console.log("=".repeat(60));

  const sources: SourceType[] = ["law", "qa", "guideline"];

  for (const source of sources) {
    console.log(`\n--- ${source.toUpperCase()} ---`);

    const results = await search(query, { limit: 3, source });

    if (results.length === 0) {
      console.log("  結果なし");
      continue;
    }

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      console.log(`\n  [${i + 1}] 距離: ${r.score.toFixed(4)}`);

      // メタデータ表示
      if (r.articleNumber) console.log(`      条番号: 第${r.articleNumber}条`);
      if (r.category) console.log(`      カテゴリ: ${r.category}`);
      if (r.filename) console.log(`      ファイル: ${r.filename}`);

      // コンテンツの先頭を表示
      const preview = r.content.substring(0, 200).replace(/\n/g, " ").replace(/\s+/g, " ");
      console.log(`      内容: ${preview}...`);

      // クエリのキーワードが含まれているか
      const keywords = query.replace(/[？?は]/g, "").split(/[・、]/);
      const matchedKeywords = keywords.filter((k) => r.content.includes(k));
      if (matchedKeywords.length > 0) {
        console.log(`      ✓ キーワードマッチ: ${matchedKeywords.join(", ")}`);
      }
    }
  }
}

async function main() {
  console.log("=== RAG詳細評価 ===");
  console.log("各ソースごとにトップ3結果を表示\n");

  for (const query of TEST_QUERIES) {
    await evaluateQuery(query);
  }

  // 結論
  console.log("\n\n" + "=".repeat(60));
  console.log("=== 結論 ===");
  console.log("=".repeat(60));
  console.log(`
上記の結果から以下を確認:

1. 各ソースからの検索結果の質
2. 距離（類似度）の妥当性
3. キーワードマッチの有無
4. クエリ意図との整合性

改善が必要な場合:
- チャンクサイズの調整
- Embedding戦略の見直し（キーワード埋め込みなど）
- リランキングの導入
`);
}

main().catch(console.error);
