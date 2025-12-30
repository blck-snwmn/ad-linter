/**
 * 広告リンター Agent テスト実行スクリプト
 *
 * 使い方:
 *   npx tsx scripts/test-agent.ts
 */

import "dotenv/config";
import { analyzeAd, formatAnalysisResult, getLLMProviderName } from "../src/agent/index.js";

/** テストケース */
const TEST_CASES = [
  {
    name: "優良誤認（高リスク）",
    text: "業界No.1の効果！たった1週間で-10kg減！科学的根拠に基づく独自配合成分で、誰でも簡単にダイエット成功！",
    expectedRisk: "high",
  },
  {
    name: "有利誤認（中リスク）",
    text: "今だけ限定！通常価格10,000円が半額の5,000円！先着100名様限り！お急ぎください！",
    expectedRisk: "medium",
  },
  {
    name: "景品規制リスク",
    text: "購入者全員にもれなく10,000円分のギフトカードをプレゼント！さらに抽選で100万円が当たる！",
    expectedRisk: "high",
  },
  {
    name: "複合リスク",
    text: "満足度98%！日本一売れてる美容液が今なら半額！さらに購入者全員に高級化粧品セット（5,000円相当）をプレゼント！",
    expectedRisk: "high",
  },
  {
    name: "低リスク",
    text: "お客様の声をもとに改良を重ねた自信作。まずはお試しください。※個人の感想です。効果には個人差があります。",
    expectedRisk: "low",
  },
];

async function main() {
  console.log("=".repeat(60));
  console.log("広告リンター Agent テスト実行");
  console.log(`LLMプロバイダー: ${getLLMProviderName()}`);
  console.log(`テストケース数: ${TEST_CASES.length}`);
  console.log("=".repeat(60));

  const results: { name: string; expected: string; actual: string; match: boolean }[] = [];

  for (const testCase of TEST_CASES) {
    console.log(`\n${"#".repeat(60)}`);
    console.log(`# ${testCase.name}`);
    console.log(`# 期待リスク: ${testCase.expectedRisk}`);
    console.log(`${"#".repeat(60)}`);
    console.log(`入力: ${testCase.text}\n`);

    try {
      const result = await analyzeAd(testCase.text);
      console.log(formatAnalysisResult(result));

      const match = result.overallRisk === testCase.expectedRisk;
      results.push({
        name: testCase.name,
        expected: testCase.expectedRisk,
        actual: result.overallRisk,
        match,
      });

      if (!match) {
        console.log(`\n⚠️  期待: ${testCase.expectedRisk}, 実際: ${result.overallRisk}`);
      }
    } catch (error) {
      console.error("エラー:", error instanceof Error ? error.message : String(error));
      results.push({
        name: testCase.name,
        expected: testCase.expectedRisk,
        actual: "error",
        match: false,
      });
    }
  }

  // サマリー
  console.log(`\n${"=".repeat(60)}`);
  console.log("テスト結果サマリー");
  console.log("=".repeat(60));

  for (const r of results) {
    const icon = r.match ? "✅" : "❌";
    console.log(`${icon} ${r.name}: 期待=${r.expected}, 実際=${r.actual}`);
  }

  const passed = results.filter((r) => r.match).length;
  console.log(`\n合計: ${passed}/${results.length} パス`);
}

main().catch(console.error);
