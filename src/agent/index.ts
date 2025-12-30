/**
 * 広告リンター Agent エクスポート
 */

import { createAdLinterGraph } from "./graph.js";
import { getLLMProviderName } from "./llm.js";
import type { AnalysisResult } from "./state.js";

// 型のエクスポート
export type { RiskAssessment, Citation, AnalysisResult } from "./state.js";
export type { LLMProvider } from "./llm.js";

// 関数のエクスポート
export { getLLM, getLLMProvider, getLLMProviderName } from "./llm.js";
export { createAdLinterGraph } from "./graph.js";

/**
 * 広告文の景品表示法リスクを分析
 *
 * @param adText - 分析対象の広告文
 * @returns 分析結果
 *
 * @example
 * ```typescript
 * const result = await analyzeAd("業界No.1の効果！今だけ半額！");
 * console.log(result.overallRisk); // "high"
 * console.log(result.summary);
 * ```
 */
export async function analyzeAd(adText: string): Promise<AnalysisResult> {
  const startTime = Date.now();

  // グラフを作成
  const graph = createAdLinterGraph();

  // 実行
  const result = await graph.invoke({ adText });

  const processingTime = Date.now() - startTime;

  return {
    adText: result.adText,
    riskAssessments: result.riskAssessments,
    overallRisk: result.overallRisk,
    summary: result.summary,
    processingTime,
    retrievedDocsCount: result.retrievedDocs.length,
  };
}

/**
 * 分析結果を整形して表示用文字列に変換
 */
export function formatAnalysisResult(result: AnalysisResult): string {
  const lines: string[] = [];

  // ヘッダー
  lines.push("=".repeat(60));
  lines.push("景品表示法リスク評価レポート");
  lines.push("=".repeat(60));
  lines.push("");

  // 総合評価
  const riskLabels = {
    high: "🔴 高リスク",
    medium: "🟡 中リスク",
    low: "🟢 低リスク",
    none: "⚪ リスクなし",
  };
  lines.push(`【総合評価】${riskLabels[result.overallRisk]}`);
  lines.push("");

  // サマリー
  lines.push("【サマリー】");
  lines.push(result.summary);
  lines.push("");

  // 詳細評価
  if (result.riskAssessments.length > 0) {
    lines.push("-".repeat(60));
    lines.push("【検出されたリスク】");
    lines.push("");

    for (const assessment of result.riskAssessments) {
      lines.push(`▶ 表現: "${assessment.expression}"`);
      lines.push(`  リスク: ${riskLabels[assessment.riskLevel]}`);
      lines.push(`  違反類型: ${assessment.violationType}`);
      lines.push(`  判断理由: ${assessment.reasoning}`);
      lines.push(`  改善提案: ${assessment.suggestion}`);
      if (assessment.citations.length > 0) {
        lines.push(`  根拠: ${assessment.citations.map((c) => c.id).join(", ")}`);
      }
      lines.push("");
    }
  }

  // メタ情報
  lines.push("-".repeat(60));
  lines.push(`処理時間: ${result.processingTime}ms`);
  lines.push(`参照文書数: ${result.retrievedDocsCount}`);
  lines.push(`LLMプロバイダー: ${getLLMProviderName()}`);

  return lines.join("\n");
}
