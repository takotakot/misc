# SPEC

目的:
- Google Sheets をデータ管理の一次ソースとし、BigQuery の Connected Sheets 機能を使って人員構成図を生成するためのデータ仕様を定義する。

基本方針:
- データは基本的に Google Sheets 上で管理する。
- 組織は階層的（親子関係）で表現する。
- BigQuery へは必要に応じて定期的または手動で取り込み、階層クエリを実行する。

## テーブル定義

### 組織 `org_nodes`

- `id` (STRING): 各ノードを一意に識別する ID。Sheets 由来の文字列 ID を使う想定である
- `name` (STRING): 会社・部署名
- `parent_id` (STRING | NULL): 親ノードの `id`。トップレベルは NULL を指定する
- `order_no` (INT64): 同じ親内での表示順序を指定する数値
- `available_from` (DATE): 有効期間開始日（将来の異動や組織変更を見越す）
- `available_to` (DATE): 有効期間終了日。NULL は無期限

### 社員・関係者 `persons`

- `id` (STRING): 各人を一意に識別する ID（Sheets のキーをそのまま使う想定）
- `business_name` (STRING): 表示名（氏名や職務表示など）
- `email` (STRING): 連絡用メールアドレス
- `ladder` (STRING): 職位レベル（例: L1, L2, L10 など）
- `available_from` (DATE): 有効開始日
- `available_to` (DATE): 有効終了日（NULL は無期限）

### 配属 `org_member_relations`

- `org_node_id` (STRING): 所属先の組織（`org_nodes.id`）
- `person_id` (STRING): `persons.id`
- `role` (STRING): 役割・役職名（例: '部長', 'メンバー'）
- `is_secondment` (BOOLEAN) NOT NULL DEFAULT FALSE: 兼務／出向フラグ（TRUE = 兼務または出向）
- `status` (STRING | NULL): 表示用ステータス（例: '休職', '出向先', '出向元' 等、自由入力）
- `order_no` (INT64 | NULL): 同一組織内での配属の表示順を指定する数値（NULL は未指定）
- `available_from` (DATE): 関係の有効開始日
- `available_to` (DATE): 関係の有効終了日（NULL は無期限）
- `note` (STRING | NULL): 任意の注記

## データ例

### 組織

| id  | name     | parent_id | order_no | available_from | available_to |
| --- | -------- | --------- | -------- | -------------- | ------------ |
| o1  | 会社A    | NULL      | 1        | 2025-01-01     | NULL         |
| o2  | 総務本部 | o1        | 1        | 2025-01-01     | NULL         |
| o3  | 総務部   | o2        | 1        | 2025-01-01     | NULL         |
| o4  | 人事部   | o2        | 2        | 2025-01-01     | NULL         |
| o5  | 事業本部 | o1        | 2        | 2025-01-01     | NULL         |
| o6  | 企画部   | o5        | 1        | 2025-01-01     | NULL         |
| o7  | 営業部   | o5        | 2        | 2025-01-01     | NULL         |
| o8  | 会社B    | NULL      | 2        | 2025-01-01     | NULL         |

### 社員・関係者

| id  | business_name  | email                      | ladder | available_from | available_to |
| --- | -------------- | -------------------------- | ------ | -------------- | ------------ |
| p1  | Alice Allen    | alice.allen@example.com    | L10    | 2025-01-01     | NULL         |
| p2  | Bob Allen      | bob.allen@example.com      | L9     | 2025-01-01     | NULL         |
| p3  | Charlie Allen  | charlie.allen@example.com  | L7     | 2025-01-01     | NULL         |
| p4  | Andrew Brown   | andrew.brown@example.com   | L6     | 2025-01-01     | NULL         |
| p5  | Bella Brown    | bella.brown@example.com    | L2     | 2025-01-01     | NULL         |
| p6  | Cathy Brown    | cathy.brown@example.com    | L1     | 2025-01-01     | NULL         |
| p7  | Amelia Clerk   | amelia.clerk@example.com   | L7     | 2025-01-01     | NULL         |
| p8  | Benjamin Clerk | benjamin.clerk@example.com | L4     | 2025-01-01     | NULL         |
| p9  | Chloe Clerk    | chloe.clerk@example.com    | L3     | 2025-01-01     | NULL         |

### 配属

| org_node_id | person_id | role      | is_secondment | status | order_no | available_from | available_to | note |
| ----------- | --------- | --------- | ------------: | ------ | -------: | -------------- | ------------ | ---- |
| o1          | p1        | CEO       |         FALSE | NULL   |        1 | 2025-01-01     | NULL         | NULL |
| o2          | p3        | HoD       |         FALSE | NULL   |        1 | 2025-01-01     | NULL         | NULL |
| o3          | p3        | GM        |          TRUE | NULL   |        1 | 2025-01-01     | NULL         | NULL |
| o3          | p5        | SA        |         FALSE | NULL   |        2 | 2025-01-01     | NULL         | NULL |
| o4          | p4        | GM        |         FALSE | NULL   |        1 | 2025-01-01     | NULL         | NULL |
| o4          | p6        | A         |         FALSE | NULL   |        3 | 2025-01-01     | NULL         | NULL |
| o5          | p7        | HoD       |         FALSE | NULL   |        1 | 2025-01-01     | NULL         | NULL |
| o6          | p7        | GM        |          TRUE | NULL   |        1 | 2025-01-01     | NULL         | NULL |
| o6          | p8        | AM        |         FALSE | NULL   |        2 | 2025-01-01     | NULL         | NULL |
| o7          | p8        | AM        |         FALSE | TRUE   |        1 | 2025-01-01     | NULL         | NULL |
| o7          | p9        | L         |         FALSE | 育休   |        2 | 2025-01-01     | NULL         | NULL |
| o8          | p2        | President |         FALSE | NULL   |        1 | 2025-01-01     | NULL         | NULL |

## クエリ・出力例

### fullname 型組織出力

fullname 型の組織出力は、各ノードについてルートからのパスを連結した文字列を生成する。

出力カラム例:
- `id` (INT64)
- `fullname` (STRING): ルートから区切り文字 ` > ` で連結した表示名（例: `会社A > 総務本部 > 総務部`）
- `parent_id` (INT64 | NULL)
- `order_no` (INT64)
- `full_order_no` (STRING): ルートからの order_no を連結したもの（例: `1.1.1` など、任意）

注記（ソートの扱い）:
- 表示用の `full_order_no` は可読性を優先してスラッシュ区切り（例: `1/2/10`）で表示する
- ただし文字列ソートだと `1/10` が `1/2` より先に来るため、ソート用には各 `order_no` をゼロパディングして連結した `sortable_full_order_no` を生成する
- 本実装では LPAD 幅を `5`（最大 99999）とする

補足（実装と運用）:
- SQL の実装では `sortable_full_order_no` を生成し、表示用 `full_order_no` は人間向けにそのまま出力する
- `sortable_full_order_no` は内部的に LPAD(..., 5, '0') を用いて各 `order_no` をゼロ埋めして連結する、これにより文字列ソートで数値順となる
- `get_org_structure_01.sql` および `get_org_structure_columns_01.sql` はこのフィールドを生成して `ORDER BY` に使用する実装例を含む

出力例:

| id  | fullname                  | parent_id | order_no | full_order_no | depth |
| --- | ------------------------- | --------- | -------- | ------------- | ----- |
| o1  | 会社A                     | NULL      | 1        | 1             | 0     |
| o2  | 会社A > 総務本部          | o1        | 1        | 1/1           | 1     |
| o3  | 会社A > 総務本部 > 総務部 | o2        | 1        | 1/1/1         | 2     |
| o4  | 会社A > 総務本部 > 人事部 | o2        | 2        | 1/1/2         | 2     |
| o5  | 会社A > 事業本部          | o1        | 2        | 1/2           | 1     |
| o6  | 会社A > 事業本部 > 企画部 | o5        | 1        | 1/2/1         | 2     |
| o7  | 会社A > 事業本部 > 営業部 | o5        | 2        | 1/2/2         | 2     |
| o8  | 会社B                     | NULL      | 2        | 2             | 0     |

### 階層列型組織出力

level 別に列を持つ階層列型組織出力も提供できる。文字列連結ではなく「列」を利用するため、フィルタや検索が容易になる。

出力例:

| id  | fullname                  | full_order_no | sortable_full_order_no | parent_id | order_no | depth | level_0 | level_1  | level_2 | level_3 | level_4 |
| --- | ------------------------- | ------------- | ---------------------- | --------- | -------- | ----: | ------- | -------- | ------- | ------- | ------- |
| o1  | 会社A                     | 1             | 00001                  | NULL      | 1        |     0 | 会社A   | NULL     | NULL    | NULL    | NULL    |
| o2  | 会社A > 総務本部          | 1/1           | 00001/00001            | o1        | 1        |     1 | 会社A   | 総務本部 | NULL    | NULL    | NULL    |
| o3  | 会社A > 総務本部 > 総務部 | 1/1/1         | 00001/00001/00001      | o2        | 1        |     2 | 会社A   | 総務本部 | 総務部  | NULL    | NULL    |
| o4  | 会社A > 総務本部 > 人事部 | 1/1/2         | 00001/00001/00002      | o2        | 2        |     2 | 会社A   | 総務本部 | 人事部  | NULL    | NULL    |
| o5  | 会社A > 事業本部          | 1/2           | 00001/00002            | o1        | 2        |     1 | 会社A   | 事業本部 | NULL    | NULL    | NULL    |
| o6  | 会社A > 事業本部 > 企画部 | 1/2/1         | 00001/00002/00001      | o5        | 1        |     2 | 会社A   | 事業本部 | 企画部  | NULL    | NULL    |
| o7  | 会社A > 事業本部 > 営業部 | 1/2/2         | 00001/00002/00002      | o5        | 2        |     2 | 会社A   | 事業本部 | 営業部  | NULL    | NULL    |
| o8  | 会社B                     | 2             | 00002                  | NULL      | 2        |     0 | 会社B   | NULL     | NULL    | NULL    | NULL    |

### fullname 型人員構成図出力

fullname 型組織出力 の、各組織ノードに対して、所属メンバーを「配属」の `order_no` 順に列挙することができる。

出力例:

| fullname                  | member_business_name | member_role | member_is_secondment | member_status  | member_order_no |
| ------------------------- | -------------------- | ----------- | -------------------: | -------------- | --------------- |
| 会社A                     | Alice Allen          | CEO         |                false | NULL           | 1               |
| 会社A > 総務本部          | Charlie Allen        | HoD         |                false | NULL           | 1               |
| 会社A > 総務本部 > 総務部 | Charlie Allen        | GM          |                 true | NULL           | 1               |
| 会社A > 総務本部 > 総務部 | Bella Brown          | SA          |                false | NULL           | 2               |
| 会社A > 総務本部 > 人事部 | Andrew Brown         | GM          |                false | NULL           | 1               |
| 会社A > 総務本部 > 人事部 | Cathy Brown          | A           |                false | NULL           | 3               |
| 会社A > 事業本部          | Amelia Clerk         | HoD         |                false | NULL           | 1               |
| 会社A > 事業本部 > 企画部 | Amelia Clerk         | GM          |                false | NULL           | 1               |
| 会社A > 事業本部 > 企画部 | Benjamin Clerk       | AM          |                false | NULL           | 2               |
| 会社A > 事業本部 > 営業部 | Benjamin Clerk       | AM          |                 true | NULL           | 1               |
| 会社A > 事業本部 > 営業部 | Chloe Clerk          | L           |                false | parental leave | 2               |
| 会社B                     | Bob Allen            | President   |                false | NULL           | 1               |

### 階層列型人員構成図出力

階層列型組織出力 の、各組織ノードに対して、所属メンバーを「配属」の `order_no` 順に列挙することができる。

出力例:

| level_0 | level_1  | level_2 | level_3 | level_4 | business_name  | role      | is_secondment | status         |
| ------- | -------- | ------- | ------- | ------- | -------------- | --------- | ------------: | -------------- |
| 会社A   | NULL     | NULL    | NULL    | NULL    | Alice Allen    | CEO       |         false | NULL           |
| 会社A   | 総務本部 | NULL    | NULL    | NULL    | Charlie Allen  | HoD       |         false | NULL           |
| 会社A   | 総務本部 | 総務部  | NULL    | NULL    | Charlie Allen  | GM        |          true | NULL           |
| 会社A   | 総務本部 | 総務部  | NULL    | NULL    | Bella Brown    | SA        |         false | NULL           |
| 会社A   | 総務本部 | 人事部  | NULL    | NULL    | Andrew Brown   | GM        |         false | NULL           |
| 会社A   | 総務本部 | 人事部  | NULL    | NULL    | Cathy Brown    | A         |         false | NULL           |
| 会社A   | 事業本部 | NULL    | NULL    | NULL    | Amelia Clerk   | HoD       |         false | NULL           |
| 会社A   | 事業本部 | 企画部  | NULL    | NULL    | Amelia Clerk   | GM        |         false | NULL           |
| 会社A   | 事業本部 | 企画部  | NULL    | NULL    | Benjamin Clerk | AM        |         false | NULL           |
| 会社A   | 事業本部 | 営業部  | NULL    | NULL    | Benjamin Clerk | AM        |          true | NULL           |
| 会社A   | 事業本部 | 営業部  | NULL    | NULL    | Chloe Clerk    | L         |         false | parental leave |
| 会社B   | NULL     | NULL    | NULL    | NULL    | Bob Allen      | President |         false | NULL           |
