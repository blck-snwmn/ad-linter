/**
 * LangGraph Agent State定義
 * 広告文の景品表示法リスク評価における状態管理
 */

import { Annotation } from "@langchain/langgraph";
import type { SearchResult } from "../retrieval/vectorStore.js";

/** 引用情報 */
export interface Citation {
  source: "law" | "guideline" | "qa";
  id: string;
  articleNumber?: string;
  content: string;
  relevanceScore: number;
}

/** リスク評価結果 */
export interface RiskAssessment {
  /** 問題のある表現 */
  expression: string;
  /** リスクレベル */
  riskLevel: "high" | "medium" | "low" | "none";
  /** 違反類型（例: "優良誤認（第5条1項1号）"） */
  violationType: string;
  /** 判断理由 */
  reasoning: string;
  /** 根拠となる法令・ガイドライン */
  citations: Citation[];
  /** 改善提案 */
  suggestion: string;
}

/** LangGraph State Annotation */
export const AgentState = Annotation.Root({
  /** 入力: 広告文テキスト */
  adText: Annotation<string>,

  /** 処理中: 正規化されたテキスト */
  normalizedText: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),

  /** 処理中: RAG検索結果 */
  retrievedDocs: Annotation<SearchResult[]>({
    reducer: (_, update) => update,
    default: () => [],
  }),

  /** 出力: 個別リスク評価 */
  riskAssessments: Annotation<RiskAssessment[]>({
    reducer: (_, update) => update,
    default: () => [],
  }),

  /** 出力: 総合リスクレベル */
  overallRisk: Annotation<"high" | "medium" | "low" | "none">({
    reducer: (_, update) => update,
    default: () => "none",
  }),

  /** 出力: サマリーレポート */
  summary: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),

  /** メタデータ: 処理時間（ms） */
  processingTime: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 0,
  }),
});

/** State型（エクスポート用） */
export type AgentStateType = typeof AgentState.State;

/** 分析結果の出力型 */
export interface AnalysisResult {
  adText: string;
  riskAssessments: RiskAssessment[];
  overallRisk: "high" | "medium" | "low" | "none";
  summary: string;
  processingTime: number;
  retrievedDocsCount: number;
}
