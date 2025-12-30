/**
 * Embedding生成
 * OpenAI text-embedding-3-large を使用
 */

import { OpenAIEmbeddings } from "@langchain/openai";

let embeddingsInstance: OpenAIEmbeddings | null = null;

/**
 * Embeddingインスタンスを取得（シングルトン）
 */
export function getEmbeddings(): OpenAIEmbeddings {
  if (!embeddingsInstance) {
    embeddingsInstance = new OpenAIEmbeddings({
      model: "text-embedding-3-large",
      dimensions: 3072, // フルサイズ
    });
  }
  return embeddingsInstance;
}

/**
 * テキストのEmbeddingを生成
 */
export async function embedText(text: string): Promise<number[]> {
  const embeddings = getEmbeddings();
  return embeddings.embedQuery(text);
}

/**
 * 複数テキストのEmbeddingを生成
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const embeddings = getEmbeddings();
  return embeddings.embedDocuments(texts);
}
