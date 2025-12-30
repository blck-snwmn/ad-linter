/**
 * InputParser ノード
 * 広告文テキストの正規化
 */

import type { AgentStateType } from "../state.js";

/**
 * テキストを正規化
 * - 全角英数字を半角に
 * - 全角記号を半角に
 * - 連続する空白を単一に
 * - 前後の空白を削除
 */
function normalizeText(text: string): string {
  return (
    text
      // 全角英数字を半角に
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
      // 全角記号を半角に
      .replace(/[！]/g, "!")
      .replace(/[？]/g, "?")
      .replace(/[％]/g, "%")
      .replace(/[＆]/g, "&")
      .replace(/[（]/g, "(")
      .replace(/[）]/g, ")")
      .replace(/[「」『』【】]/g, '"')
      // 全角スペースを半角に
      .replace(/　/g, " ")
      // 連続する空白を単一に
      .replace(/\s+/g, " ")
      // 前後の空白を削除
      .trim()
  );
}

/**
 * InputParser ノード関数
 * 広告文テキストを正規化する
 */
export async function inputParser(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const { adText } = state;

  if (!adText || adText.trim().length === 0) {
    return {
      normalizedText: "",
    };
  }

  const normalizedText = normalizeText(adText);

  return {
    normalizedText,
  };
}
