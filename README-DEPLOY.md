# Life Tips — デプロイ手順

ホスティングは **Vercel** に一本化。**Firebase は Firestore（DB＋ルール）専用**です。
（以前の Firebase Hosting 設定は重複のため廃止しました）

## 構成

```
[ブラウザ] ──サイト配信──▶ Vercel（GitHub連携で自動デプロイ）
          ──データ/認証──▶ Firebase（Firestore + メール/パスワード認証）
```

## 1. サイトの公開（Vercel）

GitHub（`okada188/life-tips-app`）の `master` に push すると、Vercel が自動でデプロイします。
初回のみ Vercel ダッシュボードでリポジトリを Import してください（Framework: Other、Build なし）。

## 2. Firestore ルール／インデックスの反映（Firebase）

セキュリティルールやコメント機能の権限は Firebase 側にあります。変更したら必ず反映してください。

```powershell
firebase deploy --only firestore
```

> サイトの配信（hosting）は Vercel が担当するため、`firebase deploy --only hosting` は不要です。

## 認証について

- メールアドレス + パスワードのみ（Google ログイン・匿名ログインは廃止）
- 閲覧は誰でも可能。投稿・いいね・コメント・通報・保存はログイン必須
- 新規登録時に表示名・アイコンの初回設定あり
