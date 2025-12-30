/**
 * LLM切り替え機構
 * 環境変数LLM_PROVIDERでGemini/Claudeを切り替え
 */

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatAnthropic } from "@langchain/anthropic";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

export type LLMProvider = "gemini-flash" | "gemini-pro" | "claude";

/**
 * 環境変数からLLMプロバイダーを取得
 */
export function getLLMProvider(): LLMProvider {
  const provider = process.env.LLM_PROVIDER as LLMProvider | undefined;
  if (provider && ["gemini-flash", "gemini-pro", "claude"].includes(provider)) {
    return provider;
  }
  return "gemini-flash"; // デフォルト
}

/**
 * LLMインスタンスを取得
 * @param provider - 使用するプロバイダー（省略時は環境変数から取得）
 */
export function getLLM(provider?: LLMProvider): BaseChatModel {
  const llmProvider = provider ?? getLLMProvider();

  switch (llmProvider) {
    case "gemini-flash":
      return new ChatGoogleGenerativeAI({
        model: "gemini-2.0-flash",
        temperature: 0,
      });

    case "gemini-pro":
      return new ChatGoogleGenerativeAI({
        model: "gemini-1.5-pro",
        temperature: 0,
      });

    case "claude":
      return new ChatAnthropic({
        model: "claude-sonnet-4-20250514",
        temperature: 0,
        maxTokens: 4096,
      });

    default:
      throw new Error(`Unknown LLM provider: ${llmProvider}`);
  }
}

/**
 * LLMプロバイダー名を取得（ログ用）
 */
export function getLLMProviderName(provider?: LLMProvider): string {
  const llmProvider = provider ?? getLLMProvider();

  switch (llmProvider) {
    case "gemini-flash":
      return "Gemini 2.0 Flash";
    case "gemini-pro":
      return "Gemini 1.5 Pro";
    case "claude":
      return "Claude Sonnet 4";
    default:
      return "Unknown";
  }
}
