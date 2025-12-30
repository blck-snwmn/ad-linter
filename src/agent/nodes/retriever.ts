/**
 * Retriever ノード
 * RAG検索を実行して関連法令・ガイドライン・Q&Aを取得
 */

import { multiSearch } from "../../retrieval/vectorStore.js";
import type { AgentStateType } from "../state.js";

/** 検索設定 */
const SEARCH_CONFIG = {
  /** 各ソースからの取得件数 */
  limitPerSource: 5,
  /** 検索対象ソース */
  sources: ["law", "guideline", "qa"] as const,
};

/**
 * Retriever ノード関数
 * 正規化されたテキスト全文でRAG検索を実行
 */
export async function retriever(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const { normalizedText } = state;

  if (!normalizedText || normalizedText.length === 0) {
    return {
      retrievedDocs: [],
    };
  }

  // 全文で検索（multiSearchは各ソースから並列で検索）
  const results = await multiSearch(normalizedText, {
    limitPerSource: SEARCH_CONFIG.limitPerSource,
    sources: [...SEARCH_CONFIG.sources],
  });

  return {
    retrievedDocs: results,
  };
}
