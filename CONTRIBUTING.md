# 貢献ガイド

このプロジェクトへの貢献を歓迎します！

## 開発フロー

### 1. 環境セットアップ

```bash
git clone https://github.com/advantame/cf-shooter.git
cd cf-shooter
```

### 2. ブランチ命名規則

| プレフィックス | 用途 |
|--------------|------|
| `feature/` | 新機能追加 |
| `fix/` | バグ修正 |
| `refactor/` | リファクタリング |
| `docs/` | ドキュメント更新 |

例: `feature/respawn-system`, `fix/bullet-collision`

### 3. コミットメッセージ

```
<type>: <description>

[optional body]
```

**type:**
- `feat`: 新機能
- `fix`: バグ修正
- `refactor`: リファクタリング
- `docs`: ドキュメント
- `style`: コードスタイル
- `test`: テスト追加

例:
```
feat: リスポーン機能を追加

- 死亡後3秒でリスポーン
- リスポーン位置はランダム
```

## コード規約

### TypeScript

- `strict: true` を維持
- 型定義を明示的に記述
- `any` の使用は最小限に

### バックエンド (Durable Objects)

```typescript
// ゲーム定数は readonly で定義
private readonly TICK_MS = 50;

// 状態変更はtick()内で一括処理
private tick() {
  // 入力反映 → 物理演算 → 当たり判定 → 状態配信
}
```

### フロントエンド

```typescript
// 描画はrequestAnimationFrame
function draw() {
  requestAnimationFrame(draw);
  // 描画処理
}

// 入力送信は固定間隔
setInterval(() => {
  ws.send(JSON.stringify({ type: "input", ... }));
}, 33);
```

## 機能追加の流れ

### 例: 新しい武器を追加する場合

1. **仕様を決める**
   - ダメージ、弾速、クールダウン等

2. **バックエンドを修正** (`backend/src/game-room.ts`)
   - 武器の定数を追加
   - 弾の生成ロジックを修正
   - 必要なら新しいメッセージタイプを追加

3. **フロントエンドを修正** (`frontend/src/main.ts`)
   - 武器切り替えUIを追加
   - 入力メッセージに武器情報を追加
   - 弾の描画を修正

4. **プロトコルドキュメントを更新** (`README.md`)

## テスト方法

### ローカルテスト (PC環境)

```bash
# バックエンド
cd backend && npx wrangler dev

# フロントエンド
cd frontend && npm run dev
```

ブラウザで `http://localhost:5173` を複数タブで開いて動作確認。

### 本番テスト

1. featureブランチをpush
2. PRを作成
3. レビュー後にmainへマージ
4. 自動デプロイ後に https://cf-shooter-frontend.pages.dev/ で確認

## よくある質問

### Q: Termuxでwranglerが動かない

A: Android環境ではworkerdバイナリが未対応のため、ローカル開発はできません。GitHubにpushして本番環境でテストしてください。

### Q: WebSocket接続が切れる

A: Cloudflare Workersには接続タイムアウトがあります。クライアント側で再接続処理が実装されています。

### Q: Durable Objectsの制限

A: 無料プランでは `new_sqlite_classes` マイグレーションが必要です。詳細は [Cloudflare Docs](https://developers.cloudflare.com/durable-objects/) を参照。

## 連絡先

Issue または Pull Request でお気軽にどうぞ！
