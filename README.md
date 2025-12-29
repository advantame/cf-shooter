# 3人対戦シューティングゲーム

Cloudflare Workers + Durable Objects + Pages で構築されたスマホ向けリアルタイムマルチプレイヤーシューティングゲーム。

## プレイ

**ゲームURL**: https://cf-shooter-frontend.pages.dev/

### 操作方法（スマホ）

| 画面領域 | 操作 | 機能 |
|----------|------|------|
| 下半分 | スワイプ | 自機移動 |
| 上半分 | 左右スワイプ | 照準調整 |

- 両手で同時操作可能
- 射撃は自動（常時連射、二股発射）
- 自分の領域が常に画面下側に表示される

### PC（デバッグ用）

| 画面領域 | 操作 | 機能 |
|----------|------|------|
| 下半分 | ドラッグ | 自機移動 |
| 上半分 | 左右ドラッグ | 照準調整 |

### ルーム共有

同じルームで遊ぶには同じURLを共有:
```
https://cf-shooter-frontend.pages.dev/?room=ルーム名
```

## ゲームルール

- 3人対戦
- 円形フィールドをピザ型に3分割
- 各プレイヤーは自分の領域内のみ移動可能
- HP 200、弾1発で1ダメージ
- 常時連射（二股発射）

## ドキュメント

| ドキュメント | 内容 |
|-------------|------|
| [ゲーム設計書](docs/GAME_DESIGN.md) | ルール、パラメータ、通信プロトコル |
| [アーキテクチャ](docs/ARCHITECTURE.md) | システム構成、デプロイ、Cloudflare設定 |
| [貢献ガイド](CONTRIBUTING.md) | 開発フロー、コード規約 |

## クイックスタート (開発者向け)

### デプロイ

`main`ブランチにpushすると自動デプロイ:

```bash
git add -A
git commit -m "変更内容"
git push
```

### ローカル開発 (PC環境のみ)

```bash
# バックエンド
cd backend && npm install && npx wrangler dev

# フロントエンド (別ターミナル)
cd frontend && npm install && npm run dev
```

※ Termux/Android環境ではローカル開発不可 (wrangler未対応)

## 技術スタック

- **Frontend**: Vite + TypeScript + Canvas API
- **Backend**: Cloudflare Workers + Durable Objects（中継専用）
- **Hosting**: Cloudflare Pages
- **CI/CD**: GitHub Actions

## アーキテクチャ

- **クライアント権威モデル**: ゲームロジックはクライアント側で実行
- **低遅延**: サーバーは状態中継のみ、即座のレスポンス
- **補間描画**: 他プレイヤーの動きを滑らかに表示

## ライセンス

MIT
