# Nginx 前段リバースプロキシ設定要件定義書 (MCP SSE対応)

このドキュメントでは、MCP (Model Context Protocol) サーバーなどの **SSE (Server-Sent Events) ストリームを中継する前段リバースプロキシ (Nginx など)** に求められる必須設定要件を定義します。

通常のウェブアプリケーション用の設定のままだと、タイムアウトやデータの堰き止め（バッファリング）により、ストリーム通信が正常に機能しません。

---

## 必須設定要件チェックリスト

SSE 通信を前段のリバースプロキシで正常に中継するには、以下の **4つの領域の設定**が極めて重要です。

| 要件項目 | 設定パラメータ | 推奨値 / 指定内容 | 主な目的 |
| :--- | :--- | :--- | :--- |
| **1. バッファリングの無効化** | `proxy_buffering` | `off` | サーバーから送信されたストリームイベントを即座に（堰き止めずに）リアルタイムでクライアントへ転送するため。 |
| **2. HTTPバージョンの明示** | `proxy_http_version` | `1.1` | SSEの持続的な Chunked 転送特性や効率的な Keep-Alive コネクションの維持を機能させるため。 |
| **3. コネクションヘッダー制御** | `proxy_set_header Connection` | `""` (空) | HTTP/1.1 におけるバックエンド（Upstream）との永続的なコネクションプール維持のため。 |
| **4. 読み込みタイムアウト延長** | `proxy_read_timeout` | `24h` (または十分長い時間) | イベントが一定時間送信されずに無通信状態が続いた場合でも、プロキシ判断により一方的に切断されることを防ぐため。 |

---

## Nginx 設定実装例 (`location` コンテキスト)

上記の全要件を満たす、Nginx の最も推奨されるコンフィグ構造は以下の通りです。

```nginx
server {
    listen 80;
    server_name localhost;

    location / {
        # バックエンド（プロキシ、または直接のMCP/SSEサーバー）への転送設定
        proxy_pass http://oauth2-proxy:4180;
        
        # 1. HTTP/1.1 の明示と接続維持 (SSEのデータ転送や切断検出に必須)
        proxy_http_version 1.1;
        proxy_set_header Connection "";

        # 2. 応答バッファリングの無効化 (これを行わないと、メッセージが堰き止められます)
        proxy_buffering off;
        proxy_cache off;

        # 3. タイムアウトの延長 (デフォルト60秒での切断を保護)
        # ※ MCPサーバーが接続開通後に長時間アイドリング状態であっても、接続を維持します。
        proxy_read_timeout 24h;
        proxy_send_timeout 24h;

        # 4. 基本的なプロキシヘッダー転送 (IPアドレスやスキームの伝達)
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # (任意) 必要に応じて Nginx の許容バッファサイズを設定します
        proxy_buffer_size          128k;
        proxy_buffers              4 256k;
        proxy_busy_buffers_size    256k;
    }
}
```

---

## 各設定パラメータの詳細解説

### 1. `proxy_buffering off;`
* **動作**: Nginx はデフォルトで、バックエンドから送信されたデータをローカルのメモリやディスクテンポラリに一旦「バッファリング（プール）」し、一定量が溜まるかレスポンスが終了した時点でまとめてクライアントへ返します。
* **SSEでの問題**: SSE は接続を切断せずにイベントを逐次ストリーミングする仕組みであるため、「レスポンスの終了」は存在しません。バッファリングが有効な場合、クライアントは最初のイベントすら何分間も待たされる現象が発生します。
* **解決策**: `off` にすることで、バックエンドがパケットをフラッシュした瞬間に Nginx もリアルタイムでクライアントへ転送します。

### 2. `proxy_http_version 1.1;` & `proxy_set_header Connection "";`
* **動作**: Nginx の標準プロキシはデフォルトで `HTTP/1.0` を用いてバックエンドと通信します。また、Upstream に対して `Connection: close` ヘッダーを暗黙のうちに送信します。
* **SSEでの問題**: HTTP/1.0 では Chunked 転送エンコーディングや、効率的な接続持続（Keep-Alive）に対応していません。これらは SSE コネクションを円滑に走らせるための土台です。
* **解決策**: HTTP バージョンを `1.1` に変更し、さらに `Connection` ヘッダーをクリア（空文字に再定義）して、Nginx がバックエンドに対して Connection Close を指示するのを防止します。

### 3. `proxy_read_timeout 24h;`
* **動作**: Nginx がバックエンドから次のパケットセグメントを読み込もうとして、無通信状態がどれだけ続いたら接続をエラー扱いにするかを定義します（デフォルトは 60 秒）。
* **SSEでの問題**: クライアントからの POST 等に対して MCP サーバーが SSE ストリーム内で返答する際、しばらくメッセージが発生せず静かな時間が経過する（＝アイドル状態）ことは多々あります。60秒経過した時点で Nginx ログに `upstream timed out (110: Operation timed out)` が出力され、強制エラー切断（HTTP 504 または 200で途中でブ千切り）されます。
* **解決策**: 数時間単位（例: `24h`）にセットすることで、途中の不要な切断・ハートビート維持のシビアさを低減します。

