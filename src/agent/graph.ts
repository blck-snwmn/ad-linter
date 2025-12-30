/**
 * LangGraph ワークフロー定義
 * 広告文の景品表示法リスク評価グラフ
 */

import { StateGraph, END } from "@langchain/langgraph";
import { AgentState } from "./state.js";
import { inputParser } from "./nodes/inputParser.js";
import { retriever } from "./nodes/retriever.js";
import { riskAnalyzer } from "./nodes/riskAnalyzer.js";

/**
 * 広告リンターグラフを構築
 *
 * フロー:
 * __start__ → inputParser → retriever → riskAnalyzer → __end__
 */
export function createAdLinterGraph() {
  const workflow = new StateGraph(AgentState)
    // ノードを追加
    .addNode("inputParser", inputParser)
    .addNode("retriever", retriever)
    .addNode("riskAnalyzer", riskAnalyzer)
    // エッジを定義（シンプルな直線フロー）
    .addEdge("__start__", "inputParser")
    .addEdge("inputParser", "retriever")
    .addEdge("retriever", "riskAnalyzer")
    .addEdge("riskAnalyzer", END);

  return workflow.compile();
}
