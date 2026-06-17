# Life Tips — デプロイ手順（Firebase Hosting）

第三者が誰でもアクセスして投稿・コメントできるよう、Firebase Hosting に公開する手順です。

## 1. 初回準備（一度だけ）

```powershell
# Firebase CLI をインストール（未インストールの場合）
npm install -g firebase-tools

# Googleアカウントでログイン
firebase login
```

プロジェクトはすでに `.firebaserc` で `life-tips-app-4f749` に紐付け済みです。

## 2. デプロイ

```powershell
# Firestore セキュリティルール + インデックス + サイトをまとめて公開
firebase deploy
```

個別に公開する場合:

```powershell
firebase deploy --only hosting     # サイトのみ
firebase deploy --only firestore   # ルール・インデックスのみ
```

公開後、誰でも次のURLからアクセスできます:

- https://life-tips-app-4f749.web.app
- https://life-tips-app-4f749.firebaseapp.com

## 3. Googleログインのバグについて

「Googleにログインできない」原因は主に次の2つです。本コミットで両方に対処しています。

### (A) コード側（対応済み）
- ポップアップがブロック/閉じられた場合に **リダイレクト方式へ自動フォールバック** するようにしました（スマホやポップアップブロック環境で失敗しなくなります）。
- 起動時に `getRedirectResult` でリダイレクトログインの結果を回収します。
- `prompt: "select_account"` を付与し、毎回アカウント選択を表示します。

### (B) 設定側（要確認 — 手動）
Google認証は **承認済みドメイン** からのみ許可されます。`localhost` や独自ドメインで
`auth/unauthorized-domain` が出る場合は、以下で追加してください。

1. [Firebase コンソール](https://console.firebase.google.com/project/life-tips-app-4f749/authentication/settings) を開く
2. **Authentication → Settings → 承認済みドメイン**
3. 次が含まれているか確認（なければ追加）:
   - `localhost`
   - `life-tips-app-4f749.web.app`
   - `life-tips-app-4f749.firebaseapp.com`
   - （独自ドメインを使う場合はそれも追加）
4. **Authentication → Sign-in method** で **Google** プロバイダが「有効」になっているか確認

> `file://` で直接 index.html を開くと Google ログインは動作しません。
> 必ず Hosting のURL（または `firebase serve` / ローカルサーバー）経由で開いてください。

## 4. ローカル確認

```powershell
firebase serve   # http://localhost:5000 でホスティングをエミュレート
```
