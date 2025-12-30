/**
 * 広告リンター Agent 実行スクリプト
 *
 * 使い方:
 *   npx tsx scripts/run-agent.ts "広告文テキスト"
 *   echo "広告文テキスト" | npx tsx scripts/run-agent.ts
 */

import "dotenv/config";
import { analyzeAd, formatAnalysisResult, getLLMProviderName } from "../src/agent/index.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8").trim();
}

async function main() {
  // コマンドライン引数を取得
  const args = process.argv.slice(2);
  let adText = args.join(" ");

  // 引数がなければ標準入力から読む
  if (!adText) {
    if (process.stdin.isTTY) {
      console.error('使い方: npx tsx scripts/run-agent.ts "広告文テキスト"');
      console.error('        echo "広告文" | npx tsx scripts/run-agent.ts');
      process.exit(1);
    }
    adText = await readStdin();
  }

  if (!adText) {
    console.error("エラー: 広告文が入力されていません");
    process.exit(1);
  }

  console.log("=".repeat(60));
  console.log("広告リンター Agent");
  console.log(`LLMプロバイダー: ${getLLMProviderName()}`);
  console.log("=".repeat(60));
  console.log("");
  console.log(`入力: ${adText}`);
  console.log("");

  try {
    const result = await analyzeAd(adText);
    console.log(formatAnalysisResult(result));
  } catch (error) {
    console.error("エラー:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main().catch(console.error);
