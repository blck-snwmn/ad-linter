/**
 * RiskAnalyzer ノード
 * LLMを使用して広告文の景品表示法リスクを評価
 */

import { z } from "zod";
import { getLLM } from "../llm.js";
import type { AgentStateType, RiskAssessment, Citation } from "../state.js";
import type { SearchResult } from "../../retrieval/vectorStore.js";

/** リスク評価の出力スキーマ */
const RiskAnalysisSchema = z.object({
  assessments: z.array(
    z.object({
      expression: z.string().describe("問題のある表現（広告文からの抜粋）"),
      riskLevel: z.enum(["high", "medium", "low", "none"]).describe("リスクレベル"),
      violationType: z.string().describe("違反類型（例: 優良誤認（第5条1項1号））"),
      reasoning: z.string().describe("判断理由（具体的な法令やガイドラインを引用）"),
      citedDocIds: z.array(z.string()).describe("参照した文書のID"),
      suggestion: z.string().describe("改善提案"),
    }),
  ),
  overallRisk: z.enum(["high", "medium", "low", "none"]).describe("総合リスクレベル"),
  summary: z.string().describe("日本語のサマリーレポート（広告担当者向け）"),
});

/** リスク評価プロンプト */
const RISK_ANALYSIS_PROMPT = `あなたは景品表示法の専門家です。
以下の広告文について、景品表示法違反のリスクを評価してください。

## 評価すべき違反類型

### 優良誤認（第5条1項1号）
商品・サービスの品質、規格その他の内容について、実際のものよりも著しく優良であると示す表示
- 例: 「業界No.1」「最高品質」「効果抜群」「科学的根拠に基づく」（根拠なし）

### 有利誤認（第5条1項2号）
商品・サービスの価格その他の取引条件について、実際のものよりも取引の相手方に著しく有利であると誤認させる表示
- 例: 「今だけ半額」（通常価格が不明瞭）、「限定価格」（常時販売）、二重価格表示

### 景品規制（第4条）
過大な景品類の提供
- 懸賞: 取引価額の20倍または10万円のいずれか低い方が上限
- 総付: 取引価額の20%または200円のいずれか高い方が上限

## リスクレベルの基準

### high（高リスク）
- 明確に法令違反に該当する可能性が高い
- 消費者庁から措置命令を受けた類似事例がある
- 直ちに表示の修正が必要

### medium（中リスク）
- 違反の可能性があり、追加の根拠資料が必要
- 表現方法によっては問題となりうる
- 法務確認を推奨

### low（低リスク）
- 直接的な違反ではないが、注意が必要
- 打消し表示の追加等で改善可能
- ベストプラクティスに沿っていない

### none（リスクなし）
- 景品表示法上の問題は見られない

## 広告文
{adText}

## 参照可能な法令・ガイドライン・Q&A
{documents}

## 出力形式
以下のJSON形式で出力してください。**必ず問題のある表現を1つ以上検出してください。**

\`\`\`json
{
  "assessments": [
    {
      "expression": "問題のある表現（広告文からそのまま抜粋）",
      "riskLevel": "high" | "medium" | "low" | "none",
      "violationType": "違反類型（例: 優良誤認（第5条1項1号））",
      "reasoning": "判断理由（参照文書を引用して具体的に）",
      "citedDocIds": ["参照した文書のID"],
      "suggestion": "改善提案（具体的な修正案）"
    }
  ],
  "overallRisk": "high" | "medium" | "low" | "none",
  "summary": "広告担当者向けの日本語サマリー（専門用語を避け、実務的なアドバイスを含む）"
}
\`\`\`

**重要:**
- 「業界No.1」「最高」「最安」などの最上級表現は、根拠がない限り優良誤認リスクがあります
- 「今だけ」「限定」などの表現は、有利誤認リスクがあります
- assessmentsが空になることは稀です。少しでも疑わしい表現があれば検出してください
- 問題が全く見つからない場合のみ、assessmentsを空配列にしてください`;

/**
 * 検索結果をプロンプト用にフォーマット
 */
function formatDocuments(docs: SearchResult[]): string {
  if (docs.length === 0) {
    return "（参照文書なし）";
  }

  return docs
    .map((doc) => {
      const sourceLabel =
        doc.source === "law"
          ? "【法令】"
          : doc.source === "guideline"
            ? "【ガイドライン】"
            : "【Q&A】";
      const articleInfo = doc.articleNumber ? `第${doc.articleNumber}条` : "";
      const header = `[${doc.id}] ${sourceLabel}${articleInfo}`;
      // コンテンツは最大500文字に制限
      const content =
        doc.content.length > 500 ? `${doc.content.substring(0, 500)}...` : doc.content;
      return `${header}\n${content}`;
    })
    .join("\n\n---\n\n");
}

/**
 * 引用情報を構築
 */
function buildCitations(citedDocIds: string[], docs: SearchResult[]): Citation[] {
  return citedDocIds
    .map((id) => {
      const doc = docs.find((d) => d.id === id);
      if (!doc) return null;
      return {
        source: doc.source,
        id: doc.id,
        articleNumber: doc.articleNumber,
        content: doc.content.substring(0, 200),
        relevanceScore: doc.score,
      } as Citation;
    })
    .filter((c): c is Citation => c !== null);
}

/**
 * RiskAnalyzer ノード関数
 * 広告文と検索結果をLLMに渡してリスク評価を実行
 */
export async function riskAnalyzer(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const { normalizedText, retrievedDocs } = state;

  // 広告文がない場合は評価をスキップ
  if (!normalizedText || normalizedText.length === 0) {
    return {
      riskAssessments: [],
      overallRisk: "none",
      summary: "広告文が入力されていません。",
    };
  }

  // LLMを取得
  const llm = getLLM();

  // 構造化出力を設定
  const structuredLlm = llm.withStructuredOutput(RiskAnalysisSchema);

  // プロンプトを構築
  const prompt = RISK_ANALYSIS_PROMPT.replace("{adText}", normalizedText).replace(
    "{documents}",
    formatDocuments(retrievedDocs),
  );

  // LLMを実行
  const result = await structuredLlm.invoke(prompt);

  // RiskAssessmentに変換
  const riskAssessments: RiskAssessment[] = result.assessments.map((a) => ({
    expression: a.expression,
    riskLevel: a.riskLevel,
    violationType: a.violationType,
    reasoning: a.reasoning,
    citations: buildCitations(a.citedDocIds, retrievedDocs),
    suggestion: a.suggestion,
  }));

  return {
    riskAssessments,
    overallRisk: result.overallRisk,
    summary: result.summary,
  };
}
