/**
 * 広告リンター Agent 動作確認スクリプト
 */

import "dotenv/config";
import { analyzeAd, formatAnalysisResult, getLLMProviderName } from "../src/agent/index.js";

/** テスト用広告文 */
const TEST_ADS = [
  // 優良誤認リスク（高）
  {
    name: "優良誤認（高リスク）",
    text: "業界No.1の効果！たった1週間で-10kg減！科学的根拠に基づく独自配合成分で、誰でも簡単にダイエット成功！",
  },

  // 有利誤認リスク（中）
  {
    name: "有利誤認（中リスク）",
    text: "今だけ限定！通常価格10,000円が半額の5,000円！先着100名様限り！お急ぎください！",
  },

  // 景品規制リスク
  {
    name: "景品規制リスク",
    text: "購入者全員にもれなく10,000円分のギフトカードをプレゼント！さらに抽選で100万円が当たる！",
  },

  // 複合リスク
  {
    name: "複合リスク",
    text: "満足度98%！日本一売れてる美容液が今なら半額！さらに購入者全員に高級化粧品セット（5,000円相当）をプレゼント！",
  },

  // 低リスク
  {
    name: "低リスク",
    text: "お客様の声をもとに改良を重ねた自信作。まずはお試しください。※個人の感想です。効果には個人差があります。",
  },
];

async function main() {
  console.log("=".repeat(60));
  console.log("広告リンター Agent 動作確認");
  console.log(`LLMプロバイダー: ${getLLMProviderName()}`);
  console.log("=".repeat(60));
  console.log("");

  // コマンドライン引数でテストケースを指定可能
  const args = process.argv.slice(2);
  const customText = args.join(" ");

  if (customText) {
    // カスタムテキストを分析
    console.log("【カスタム入力】");
    console.log(`入力: ${customText}`);
    console.log("");

    try {
      const result = await analyzeAd(customText);
      console.log(formatAnalysisResult(result));
    } catch (error) {
      console.error("エラー:", error instanceof Error ? error.message : String(error));
    }
  } else {
    // テストケースを順番に実行
    for (const testCase of TEST_ADS) {
      console.log(`\n${"#".repeat(60)}`);
      console.log(`# テストケース: ${testCase.name}`);
      console.log(`${"#".repeat(60)}`);
      console.log(`入力: ${testCase.text}`);
      console.log("");

      try {
        const result = await analyzeAd(testCase.text);
        console.log(formatAnalysisResult(result));
      } catch (error) {
        console.error("エラー:", error instanceof Error ? error.message : String(error));
      }

      console.log("");
    }
  }
}

main().catch(console.error);
