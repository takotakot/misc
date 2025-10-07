# SPEC

目的:
- Google Sheets をデータ管理の一次ソースとし、BigQuery の Connected Sheets 機能を使って人員構成図を生成するためのデータ仕様を定義する。

基本方針:
- データは基本的に Google Sheets 上で管理する。
- 組織は階層的（親子関係）で表現する。
- BigQuery へは必要に応じて定期的または手動で取り込み、階層クエリを実行する。

## テーブル定義

### 組織 `org_nodes`

- `id` (INT64): 各ノードを一意に識別する ID シートなので連番を付与すれば良い
- `name` (STRING): 会社・部署名
- `parent_id` (INT64 | NULL): 親ノードの `id`。トップレベルは NULL を指定する
- `order_no` (INT64): 同じ親内での表示順序を指定する数値
- `available_from` (DATE): 有効期間開始日（将来の異動や組織変更を見越す）
- `available_to` (DATE): 有効期間終了日。NULL は無期限

### 社員・関係者 `persons`

- `id` (INT64): 各人を一意に識別する ID
- `business_name` (STRING): 表示名（氏名や職務表示など）
- `email` (STRING): 連絡用メールアドレス
- `ladder` (STRING): 職位レベル（例: L1, L2, L10 など）
- `available_from` (DATE): 有効開始日
- `available_to` (DATE): 有効終了日（NULL は無期限）

### 配属 `org_member_relations`

- `org_node_id` (INT64): 所属先の組織（`org_nodes.id`）
- `person_id` (INT64): `persons.id`
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
| 1   | 会社A    | NULL      | 1        | 2025-01-01     | NULL         |
| 2   | 総務本部 | 1         | 1        | 2025-01-01     | NULL         |
| 3   | 総務部   | 2         | 1        | 2025-01-01     | NULL         |
| 4   | 人事部   | 2         | 2        | 2025-01-01     | NULL         |
| 5   | 事業本部 | 1         | 2        | 2025-01-01     | NULL         |
| 6   | 企画部   | 5         | 1        | 2025-01-01     | NULL         |
| 7   | 営業部   | 5         | 2        | 2025-01-01     | NULL         |
| 8   | 会社B    | NULL      | 2        | 2025-01-01     | NULL         |

### 社員・関係者

|   id | business_name  | email                      | ladder | available_from | available_to |
| ---: | -------------- | -------------------------- | ------ | -------------- | ------------ |
|    1 | Alice Allen    | alice.allen@example.com    | L10    | 2025-01-01     | NULL         |
|    2 | Bob Allen      | bob.allen@example.com      | L9     | 2025-01-01     | NULL         |
|    3 | Charlie Allen  | charlie.allen@example.com  | L7     | 2025-01-01     | NULL         |
|    4 | Andrew Brown   | andrew.brown@example.com   | L6     | 2025-01-01     | NULL         |
|    5 | Bella Brown    | bella.brown@example.com    | L2     | 2025-01-01     | NULL         |
|    6 | Cathy Brown    | cathy.brown@example.com    | L1     | 2025-01-01     | NULL         |
|    7 | Amelia Clerk   | amelia.clerk@example.com   | L7     | 2025-01-01     | NULL         |
|    8 | Benjamin Clerk | benjamin.clerk@example.com | L4     | 2025-01-01     | NULL         |
|    9 | Chloe Clerk    | chloe.clerk@example.com    | L3     | 2025-01-01     | NULL         |

### 配属

| org_node_id | person_id | role      | is_secondment | status | order_no | available_from | available_to | note |
| ----------: | --------: | --------- | ------------: | ------ | -------: | -------------- | ------------ | ---- |
|           1 |         1 | CEO       |         FALSE | NULL   |        1 | 2025-01-01     | NULL         | NULL |
|           2 |         3 | HoD       |         FALSE | NULL   |        1 | 2025-01-01     | NULL         | NULL |
|           3 |         3 | GM        |          TRUE | NULL   |        1 | 2025-01-01     | NULL         | NULL |
|           3 |         5 | SA        |         FALSE | NULL   |        2 | 2025-01-01     | NULL         | NULL |
|           4 |         4 | GM        |         FALSE | NULL   |        1 | 2025-01-01     | NULL         | NULL |
|           4 |         6 | A         |         FALSE | NULL   |        3 | 2025-01-01     | NULL         | NULL |
|           5 |         7 | HoD       |         FALSE | NULL   |        1 | 2025-01-01     | NULL         | NULL |
|           6 |         7 | GM        |          TRUE | NULL   |        1 | 2025-01-01     | NULL         | NULL |
|           6 |         8 | AM        |         FALSE | NULL   |        2 | 2025-01-01     | NULL         | NULL |
|           7 |         8 | AM        |         FALSE | TRUE   |        1 | 2025-01-01     | NULL         | NULL |
|           7 |         9 | L         |         FALSE | 育休   |        2 | 2025-01-01     | NULL         | NULL |
|           8 |         2 | President |         FALSE | NULL   |        1 | 2025-01-01     | NULL         | NULL |

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
| 1   | 会社A                     | NULL      | 1        | 1             | 0     |
| 2   | 会社A > 総務本部          | 1         | 1        | 1/1           | 1     |
| 3   | 会社A > 総務本部 > 総務部 | 2         | 1        | 1/1/1         | 2     |
| 4   | 会社A > 総務本部 > 人事部 | 2         | 2        | 1/1/2         | 2     |
| 5   | 会社A > 事業本部          | 1         | 2        | 1/2           | 1     |
| 6   | 会社A > 事業本部 > 企画部 | 5         | 1        | 1/2/1         | 2     |
| 7   | 会社A > 事業本部 > 営業部 | 5         | 2        | 1/2/2         | 2     |
| 8   | 会社B                     | NULL      | 2        | 2             | 0     |

### 階層列型組織出力

出力例:

| id  | fullname                  | full_order_no | sortable_full_order_no | parent_id | order_no | depth | level_0 | level_1  | level_2 | level_3 | level_4 |
| --- | ------------------------- | ------------- | ---------------------- | --------- | -------- | ----: | ------- | -------- | ------- | ------- | ------- |
| 1   | 会社A                     | 1             | 00001                  | NULL      | 1        |     0 | 会社A   | NULL     | NULL    | NULL    | NULL    |
| 2   | 会社A > 総務本部          | 1/1           | 00001/00001            | 1         | 1        |     1 | 会社A   | 総務本部 | NULL    | NULL    | NULL    |
| 3   | 会社A > 総務本部 > 総務部 | 1/1/1         | 00001/00001/00001      | 2         | 1        |     2 | 会社A   | 総務本部 | 総務部  | NULL    | NULL    |
| 4   | 会社A > 総務本部 > 人事部 | 1/1/2         | 00001/00001/00002      | 2         | 2        |     2 | 会社A   | 総務本部 | 人事部  | NULL    | NULL    |
| 5   | 会社A > 事業本部          | 1/2           | 00001/00002            | 1         | 2        |     1 | 会社A   | 事業本部 | NULL    | NULL    | NULL    |
| 6   | 会社A > 事業本部 > 企画部 | 1/2/1         | 00001/00002/00001      | 5         | 1        |     2 | 会社A   | 事業本部 | 企画部  | NULL    | NULL    |
| 7   | 会社A > 事業本部 > 営業部 | 1/2/2         | 00001/00002/00002      | 5         | 2        |     2 | 会社A   | 事業本部 | 営業部  | NULL    | NULL    |
| 8   | 会社B                     | 2             | 00002                  | NULL      | 2        |     0 | 会社B   | NULL     | NULL    | NULL    | NULL    |

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

