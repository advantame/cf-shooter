# システムアーキテクチャ

## 全体構成

```
┌──────────────────────────────────────────────────────────────────┐
│                         Cloudflare Edge                          │
│                                                                  │
│  ┌─────────────────────┐      ┌─────────────────────────────┐   │
│  │   Cloudflare Pages  │      │   Cloudflare Workers        │   │
│  │                     │      │                             │   │
│  │  cf-shooter-        │      │  cf-shooter-backend         │   │
│  │  frontend.pages.dev │      │  .wstomo53.workers.dev      │   │
│  │                     │      │                             │   │
│  │  - index.html       │      │  ┌───────────────────────┐ │   │
│  │  - main.js (build)  │      │  │   Durable Object      │ │   │
│  │                     │      │  │   (GameRoom)          │ │   │
│  └─────────────────────┘      │  │                       │ │   │
│           │                   │  │  - WebSocket管理      │ │   │
│           │ 静的配信           │  │  - 状態中継           │ │   │
│           ▼                   │  │  - Zone割り当て       │ │   │
│      ┌─────────┐              │  └───────────────────────┘ │   │
│      │ Browser │◄─WebSocket──►│                             │   │
│      │ (Game   │              └─────────────────────────────┘   │
│      │  Logic) │                                                │
│      └─────────┘                                                │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## アーキテクチャの特徴

### クライアント権威モデル

- **ゲームロジック**: クライアント側で実行（60fps）
- **サーバーの役割**: 状態の中継のみ（約30Hz）
- **メリット**: 低遅延、即座のレスポンス
- **デメリット**: チート可能（身内用のため許容）

## コンポーネント詳細

### Frontend (Cloudflare Pages)

| 項目 | 詳細 |
|------|------|
| URL | https://cf-shooter-frontend.pages.dev |
| フレームワーク | Vite + TypeScript |
| ビルド出力 | `frontend/dist/` |
| 主要ファイル | `src/main.ts` |

**責務:**
- Canvas描画（正方形、画面サイズ依存）
- ゲームロジック実行（移動、射撃、当たり判定）
- 入力処理（マルチタッチ対応）
- 視点回転（自分の領域を下に表示）
- 他プレイヤーの補間描画
- サーバーへの状態送信
- 再接続処理

### Backend (Cloudflare Workers)

| 項目 | 詳細 |
|------|------|
| URL | https://cf-shooter-backend.wstomo53.workers.dev |
| エントリ | `src/index.ts` |
| 設定 | `wrangler.toml` |

**責務:**
- `/connect` エンドポイントでWebSocket接続を受付
- リクエストを適切なDurable Objectへルーティング

### Durable Object (GameRoom)

| 項目 | 詳細 |
|------|------|
| クラス | `GameRoom` |
| ファイル | `src/game-room.ts` |
| マイグレーション | `new_sqlite_classes` (無料プラン必須) |

**責務:**
- ルームごとのWebSocket接続管理
- Zone（領域）の割り当て（0, 1, 2）
- クライアント状態の受信・保存
- 全クライアントへの状態ブロードキャスト（約30Hz）
- ヒット通知の中継

**注意**: ゲームロジック（移動計算、当たり判定など）はクライアント側で実行

## ディレクトリ構成

```
cf-shooter/
├── .github/
│   └── workflows/
│       └── deploy.yml        # CI/CD設定
│
├── backend/
│   ├── src/
│   │   ├── index.ts          # Workerエントリ
│   │   └── game-room.ts      # Durable Object（中継専用）
│   ├── wrangler.toml         # Wrangler設定
│   ├── tsconfig.json
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   └── main.ts           # クライアント（ゲームロジック含む）
│   ├── index.html
│   ├── tsconfig.json
│   └── package.json
│
├── docs/
│   ├── GAME_DESIGN.md        # ゲーム設計
│   └── ARCHITECTURE.md       # 本ドキュメント
│
├── README.md
└── CONTRIBUTING.md
```

## デプロイフロー

```
git push (main)
      │
      ▼
┌─────────────────────────────────────────┐
│         GitHub Actions                   │
│                                         │
│  1. deploy-backend                      │
│     ├─ npm install                      │
│     └─ wrangler deploy                  │
│              │                          │
│              ▼                          │
│  2. deploy-frontend (after backend)     │
│     ├─ npm install                      │
│     ├─ npm run build                    │
│     │   (VITE_BACKEND_BASE注入)         │
│     ├─ pages project create (初回のみ)  │
│     └─ pages deploy                     │
│                                         │
└─────────────────────────────────────────┘
      │
      ▼
┌─────────────────────┐  ┌─────────────────────┐
│ Workers deployed    │  │ Pages deployed      │
│ cf-shooter-backend  │  │ cf-shooter-frontend │
└─────────────────────┘  └─────────────────────┘
```

## 環境変数・シークレット

### GitHub Secrets

| 名前 | 用途 |
|------|------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API認証 |
| `CLOUDFLARE_ACCOUNT_ID` | アカウント識別 |

### ビルド時環境変数

| 名前 | 値 | 用途 |
|------|-----|------|
| `VITE_BACKEND_BASE` | `https://cf-shooter-backend.wstomo53.workers.dev` | バックエンドURL |

## Cloudflare設定

### wrangler.toml

```toml
name = "cf-shooter-backend"
main = "src/index.ts"
compatibility_date = "2024-12-01"

[durable_objects]
bindings = [
  { name = "GAME_ROOMS", class_name = "GameRoom" }
]

[[migrations]]
tag = "v1"
new_sqlite_classes = ["GameRoom"]  # 無料プランで必須
```

### 無料プランの制限

| リソース | 制限 |
|---------|------|
| Workers リクエスト | 100,000/日 |
| Durable Objects リクエスト | 1,000,000/月 |
| Durable Objects ストレージ | 1 GB |
| WebSocket接続 | 制限なし (タイムアウトあり) |

## ローカル開発

### PC環境

```bash
# ターミナル1: バックエンド
cd backend
npm install
npx wrangler dev

# ターミナル2: フロントエンド
cd frontend
npm install
VITE_BACKEND_BASE=http://localhost:8787 npm run dev
```

### Termux/Android環境

wranglerがAndroidに対応していないため、ローカル開発不可。
GitHubにpushして本番環境でテスト。

## スケーラビリティ

### 現在の設計

- 1ルーム = 1 Durable Object インスタンス
- 同一ルームの接続は同一インスタンスで処理
- ルームが異なれば別インスタンス (自動スケール)

### 拡張時の考慮点

| シナリオ | 対応策 |
|---------|--------|
| ルーム数増加 | Durable Objectsが自動スケール |
| 同時接続数増加 | Workers/DOの制限を確認 |
| グローバル展開 | Cloudflareのエッジで自動分散 |
| 永続化が必要 | D1 (SQLite) または KV を追加 |

## トラブルシューティング

### デプロイエラー

| エラー | 原因 | 対処 |
|--------|------|------|
| `new_sqlite_classes` 必須 | 無料プランでのDO制限 | wrangler.tomlを修正 |
| workers.dev subdomain必要 | 初回設定未完了 | ダッシュボードでWorkersを開く |
| Pages project not found | プロジェクト未作成 | `pages project create` を実行 |

### 接続エラー

| 症状 | 原因 | 対処 |
|------|------|------|
| WebSocket接続失敗 | CORS/URL設定ミス | VITE_BACKEND_BASE確認 |
| 頻繁な切断 | タイムアウト | クライアント側で再接続実装済み |
| Room is full | 3人制限 | 別のroom名を使用 |
