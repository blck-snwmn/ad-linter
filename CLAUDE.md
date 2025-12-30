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
│ClaimExtractor │  主張抽出（優良/有利誤認トリガー検出）
└───────────────┘
        │
        ▼
┌───────────────┐
│MultiRetriever │  並列RAG検索
│ ├─ 法令       │  - 景表法条文
│ ├─ ガイドライン│  - 消費者庁GL
│ ├─ Q&A        │  - 公式Q&A
│ └─ 違反事例   │  - 措置命令
└───────────────┘
        │
        ▼
┌───────────────┐
│ RiskAnalyzer  │  LLMによるリスク判定
└───────────────┘
        │
        ▼
┌───────────────┐
│ResponseGen    │  出力生成（リスク/根拠/改善案）
└───────────────┘
        │
        ▼
[出力: リスク判定 + 根拠引用 + 改善提案]
```

## データソース

| ソース | 取得方法 | 形式 |
|--------|----------|------|
| 景品表示法（条文） | e-Gov法令API v2 | JSON |
| 消費者庁ガイドライン | Puppeteer + pdf-parse | PDF |
| Q&A集 | Cheerioスクレイピング | HTML |
| 違反事例（措置命令） | 手動収集 + パース | PDF/HTML |

## 開発ガイド

### LLM切替

環境変数 `LLM_PROVIDER` で切替：

```bash
# 開発フェーズ
LLM_PROVIDER=gemini-flash

# 検証フェーズ
LLM_PROVIDER=gemini-pro
LLM_PROVIDER=claude
```

### データ取り込み

```bash
npm run ingest
```

### プロジェクト構造

```
src/
├── models/           # LLM切替ロジック
├── graph/            # LangGraphワークフロー
├── retrieval/        # LanceDB・Embedding
└── data/
    ├── loaders/      # データ取得
    └── chunkers/     # チャンク分割
```
