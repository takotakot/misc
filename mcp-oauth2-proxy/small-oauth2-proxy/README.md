# small-oauth2-proxy

Go言語で実装された、軽量なOAuth2リバースプロキシです。以下の目的のために設計されています。
- `/.well-known/oauth-protected-resource` の自動的なレスポンス返却
- `https://www.googleapis.com/oauth2/v3/tokeninfo` を用いたGoogle OAuth2/OIDCトークンのリアルタイム検証
- 保護ルート（`/mcp` 以下）へのリクエストの検証と、成功時のバックエンドへのセキュアなフォワード（ID情報のメタヘッダー付与）

## 仕様と動作

### 1. `/.well-known/oauth-protected-resource` の中身と定義

クライアント認証サーバーとの連携や、クライアントが保護リソースの情報を検出するために、以下のレスポンスを返します。

- **URLパス**: `/.well-known/oauth-protected-resource`
- **メソッド**: `GET` (CORS対応としてプリフライト用の `OPTIONS` などの考慮も含みます)
- **Content-Type**: `application/json`
- **返却されるJSONの中身**:
  ```json
  {
    "resource": "<RESOURCE_URL>",
    "authorization_servers": [
      "https://accounts.google.com"
    ],
    "scopes_supported": [
      "email"
    ]
  }
  ```

#### `resource` フィールドの設定ロジック
このプロキシは、クライアントが要求するべきリソースエンドポイント (`resource`) を環境変数に応じて自動的に設定します。
1. **最高優先**: 環境変数 `RESOURCE_URL` が設定されている場合、その値を使用します。
2. **第二優先**: 環境変数 `OAUTH2_PROXY_REDIRECT_URL` が設定されている場合（例: `http://localhost:8080/oauth2/callback`）、そのスキームとホスト情報を自動抽出し、末尾に `/mcp` を付加して構築します（例: `http://localhost:8080/mcp`）。
3. **デフォルト（フォールバック）**: `http://localhost:8080/mcp` となります。

---

### 2. 環境変数の設定一覧

`oauth2-proxy` の既存の設定（環境変数）をそのまま移行し、互換性を保ちながら動作するようにエイリアス環境変数（`OAUTH2_PROXY_*`）もサポートしています。

| 環境変数名 | エイリアス（優先される同義変数） | デフォルト値 | 説明 |
| :--- | :--- | :--- | :--- |
| `PORT` | `OAUTH2_PROXY_HTTP_ADDRESS` | `:4180` | プロキシサーバーがリッスンするアドレス。`0.0.0.0:4180` のように指定可能。 |
| `UPSTREAM_URL` | `OAUTH2_PROXY_UPSTREAMS` | `http://mock-mcp-server:5678` | トークンが正しく検証された際にリクエストを転送するバックエンドサーバーのURL。`OAUTH2_PROXY_UPSTREAMS` がカンマ区切りの場合は、その中からHTTP/HTTPSスキームで始まる最初のURLを自動検出します。 |
| `CLIENT_ID` | `OAUTH2_PROXY_CLIENT_ID` | なし（検証なし） | Google OAuth2のClient ID。セットされている場合、Googleの検証結果に含まれる `aud` (Audience) または `azp` (Authorized party) がこの値と一致するか厳格にチェックします（トークン差し替え攻撃対策）。 |
| `ALLOWED_EMAILS` | `OAUTH2_PROXY_ALLOWED_EMAILS` | `*` (全許可) | リクエストを許可するGoogleアカウントのメールアドレス（複数ある場合はカンマ `,` 区切り）。`*` または未設定の場合は検証に合格したすべてのGoogleアカウント（メール認証要）を許可します。 |
| `RESOURCE_URL` | なし | 上記ロジック参照 | `oauth-protected-resource` の `resource` フィールドに指定するURL。 |

---

### 3. 保護ルート `/mcp` でのトークン検証フロー

1. **トークンの抽出**:
   - `Authorization: Bearer <token>` ヘッダー、またはクエリパラメータの `access_token` もしくは `id_token` からトークンを収集します。
2. **検証先の選定**:
   - トークンがJWT（`.` が2つ以上含まれる）である場合は、Googleの検証API `https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=<token>` にアクセスします。
   - それ以外（通常のAccessToken）の場合は、`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=<token>` にアクセスします。
3. **認可および属性検証**:
   - トークンが正常かつ有効期限内であることを確認。
   - `CLIENT_ID` (Audience) の一致確認。
   - Google側でメールが疎通確認されていること (`email_verified` = `true`) を確認。
   - メールが `ALLOWED_EMAILS` リストに存在することを確認。
4. **プロキシとヘッダー伝播**:
   - バックエンドにリクエストをプロキシする際、クライアントにメールなどのメタデータを伝えるため、以下のヘッダーを付与して upstream へ中継します。
     - `X-Forwarded-User`: 認証済みメールアドレス
     - `X-Forwarded-Email`: 認証済みメールアドレス
