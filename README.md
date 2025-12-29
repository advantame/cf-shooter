# 3人対戦シューティングゲーム

Cloudflare Workers + Durable Objects + Pages で構築されたリアルタイムマルチプレイヤーシューティングゲーム。

## プレイ

**ゲームURL**: https://cf-shooter-frontend.pages.dev/

### 操作方法

| 操作 | キー/マウス |
|------|------------|
| 移動 | WASD / 矢印キー |
| 照準 | マウス移動 |
| 射撃 | スペース / クリック |

### ルーム共有

同じルームで遊ぶには同じURLを共有:
```
https://cf-shooter-frontend.pages.dev/?room=ルーム名
```

## ドキュメント

| ドキュメント | 内容 |
|-------------|------|
| [ゲーム設計書](docs/GAME_DESIGN.md) | ルール、パラメータ、通信プロトコル、拡張予定 |
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
- **Backend**: Cloudflare Workers + Durable Objects
- **Hosting**: Cloudflare Pages
- **CI/CD**: GitHub Actions

## ライセンス

MIT
