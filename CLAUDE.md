# ad-linter

景品表示法チェック RAG Bot/Agent

広告文・キャッチコピーが景品表示法に違反するリスクを判定する。

## 技術選定

### LLM

切替可能な3モデル構成：

| モデル | 用途 | コスト |
|--------|------|--------|
| Gemini 3 Flash | 開発・動作確認 | $0.50/$3 per 1M |
| Gemini 3 Pro | 検証 | $2/$12 per 1M |
| Claude 4.5 Opus | 検証（高精度） | $5/$25 per 1M |

**選定理由:**
- Claude 4.5 Opus: 指示遵守#1、法律文書の厳密な解釈に最適
- Gemini 3 Pro: 100万トークンコンテキスト、コスパ良好
- Gemini 3 Flash: 開発フェーズの低コスト動作確認用

### Vector DB

**LanceDB**

- TypeScriptネイティブサポート（唯一の組み込み型ベクトルDB）
- `npm install` のみで完結、Docker/サーバー不要
- メタデータフィルタリングが強力（法令条項での絞り込みに有用）

### Embedding

**OpenAI text-embedding-3-large**

- 日本語精度を優先（MIRACLベンチマーク上位）
- 3072次元で法律文書の微妙なニュアンス差を捕捉
- 将来的に `multilingual-e5-large` への切替も可能

## アーキテクチャ

```
[入力: 広告文テキスト]
        │
        ▼
┌───────────────┐
│ InputParser   │  前処理・正規化
└───────────────┘
        │
        ▼
┌───────────────┐
│MultiRetriever │  並列RAG検索
│ ├─ 法令       │  - 景表法条文
│ ├─ ガイドライン│  - 消費者庁GL
│ └─ Q&A        │  - 公式Q&A
└───────────────┘
        │
        ▼
┌───────────────┐
│ RiskAnalyzer  │  LLMによるリスク判定+レポート生成
└───────────────┘
        │
        ▼
[出力: リスク判定 + 根拠引用 + 改善提案]
```

ClaimExtractorは漏れリスク回避のため省略し、全文でRAG検索を実行。

## データソース

| ソース | 取得方法 | 形式 |
|--------|----------|------|
| 景品表示法（条文） | e-Gov法令API v2 | JSON |
| 消費者庁ガイドライン | Puppeteer + pdf-parse | PDF |
| Q&A集 | Cheerioスクレイピング | HTML |
| 違反事例（措置命令） | 手動収集 + パース | PDF/HTML |

## 開発ガイド

### 使い方

```bash
# 広告文のリスクチェック
npx tsx scripts/run-agent.ts "業界No.1の効果！"
echo "広告文" | npx tsx scripts/run-agent.ts

# テストケース実行
npx tsx scripts/test-agent.ts

# データ取り込み
npm run ingest
```

### LLM切替

環境変数 `LLM_PROVIDER` で切替：

```bash
LLM_PROVIDER=gemini-flash  # デフォルト（開発用）
LLM_PROVIDER=gemini-pro    # 検証用
LLM_PROVIDER=claude        # 高精度（要ANTHROPIC_API_KEY）
```

### プロジェクト構造

```
src/
├── agent/            # LangGraph Agent
│   ├── graph.ts      # ワークフロー定義
│   ├── state.ts      # State型定義
│   ├── llm.ts        # LLM切替ロジック
│   └── nodes/        # 各ノード実装
├── retrieval/        # LanceDB・Embedding
└── data/
    ├── loaders/      # データ取得
    └── chunkers/     # チャンク分割
scripts/
├── run-agent.ts      # Agent実行
├── test-agent.ts     # テストケース実行
└── ingest.ts         # データ取り込み
```
