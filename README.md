# 3人対戦シューティングゲーム

Cloudflare Workers + Durable Objects + Pages で構築されたリアルタイムマルチプレイヤーシューティングゲーム。

## デモ

- **ゲーム**: https://cf-shooter-frontend.pages.dev/
- **バックエンド**: https://cf-shooter-backend.wstomo53.workers.dev

## アーキテクチャ

```
┌─────────────────┐     WebSocket      ┌─────────────────────────────────┐
│   Frontend      │◄──────────────────►│   Backend (Cloudflare Workers)  │
│  (Cloudflare    │                    │                                 │
│   Pages)        │                    │  ┌─────────────────────────┐   │
│                 │                    │  │   Durable Object        │   │
│  - Canvas描画    │                    │  │   (GameRoom)            │   │
│  - 入力送信      │                    │  │                         │   │
│  - 状態受信      │                    │  │  - ゲーム状態管理        │   │
└─────────────────┘                    │  │  - 物理演算(サーバ権威)  │   │
                                       │  │  - 当たり判定            │   │
                                       │  └─────────────────────────┘   │
                                       └─────────────────────────────────┘
```

## ディレクトリ構成

```
.
├── backend/                 # Cloudflare Worker (バックエンド)
│   ├── src/
│   │   ├── index.ts        # Worker エントリポイント
│   │   └── game-room.ts    # Durable Object (ゲームロジック)
│   ├── wrangler.toml       # Wrangler設定
│   └── package.json
│
├── frontend/                # Vite + TypeScript (フロントエンド)
│   ├── src/
│   │   └── main.ts         # ゲームクライアント
│   ├── index.html
│   └── package.json
│
└── .github/
    └── workflows/
        └── deploy.yml      # GitHub Actions (自動デプロイ)
```

## ゲーム仕様

### 基本ルール

| 項目 | 値 |
|------|-----|
| 最大プレイヤー数 | 3人 |
| 初期HP | 5 |
| マップサイズ | 800 x 600 px |

### プレイヤー

| 項目 | 値 |
|------|-----|
| 移動速度 | 180 px/sec |
| 当たり判定半径 | 18 px (円形) |
| 表示サイズ | 半径 16 px |

### 弾

| 項目 | 値 |
|------|-----|
| 弾速 | 420 px/sec |
| 発射クールダウン | 180 ms |
| 当たり判定 | プレイヤー半径内 |
| ダメージ | 1 HP |

### 通信

| 項目 | 値 |
|------|-----|
| サーバーTick | 20 Hz (50ms間隔) |
| クライアント入力送信 | 30 Hz (33ms間隔) |
| プロトコル | WebSocket + JSON |

## 操作方法

| 操作 | キー/マウス |
|------|------------|
| 移動 | WASD / 矢印キー |
| 照準 | マウス移動 / タッチ |
| 射撃 | スペースキー / クリック / タッチ |

## 通信プロトコル

### クライアント → サーバー

```typescript
// 入力メッセージ
{
  type: "input",
  seq: number,        // シーケンス番号
  up: boolean,
  down: boolean,
  left: boolean,
  right: boolean,
  shoot: boolean,
  aimX: number,       // 照準X座標
  aimY: number        // 照準Y座標
}
```

### サーバー → クライアント

```typescript
// 接続時
{
  type: "hello",
  playerId: string    // UUID
}

// 状態更新 (20Hz)
{
  type: "state",
  t: number,          // タイムスタンプ
  players: {
    [playerId]: {
      x: number,
      y: number,
      hp: number
    }
  },
  bullets: [
    { x: number, y: number }
  ]
}

// エラー
{
  type: "error",
  message: string
}
```

## 開発

### 必要環境

- Node.js 20+
- Cloudflare アカウント

### ローカル開発

Termux/Android環境ではwranglerが動作しないため、GitHub経由でデプロイします。

PC環境の場合:

```bash
# バックエンド
cd backend
npm install
npx wrangler dev

# フロントエンド (別ターミナル)
cd frontend
npm install
npm run dev
```

### デプロイ

`main`ブランチにpushすると自動デプロイされます。

```bash
git add -A
git commit -m "変更内容"
git push
```

## 今後の拡張案

### 優先度: 高

- [ ] リスポーン機能
- [ ] 勝敗判定・ラウンド制
- [ ] ルーム一覧・マッチメイキング

### 優先度: 中

- [ ] クライアント予測 (自機のラグ軽減)
- [ ] 補間処理 (他プレイヤーの滑らか表示)
- [ ] 壁・障害物の追加
- [ ] 武器の種類追加

### 優先度: 低

- [ ] 観戦モード
- [ ] スコア/ランキング (D1連携)
- [ ] サウンドエフェクト
- [ ] モバイル用バーチャルパッド

## チート対策メモ

現在の実装はサーバー権威モデルだが、以下の強化が必要:

- [ ] 入力頻度制限 (秒間最大回数)
- [ ] 移動速度の厳格な検証
- [ ] 射撃クールダウンのサーバー側強制
- [ ] 不正パケット検知・切断

## ライセンス

MIT

## 貢献

1. このリポジトリをFork
2. featureブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add amazing feature'`)
4. ブランチをPush (`git push origin feature/amazing-feature`)
5. Pull Requestを作成
