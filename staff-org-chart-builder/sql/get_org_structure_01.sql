-- sql/get_org_structure_01.sql
-- BigQuery: fullname 型組織出力のサンプル
-- 出力: id, fullname, parent_id, order_no, full_order_no, depth

-- 注: 表示用の `full_order_no` は可読性優先で `1/2/10` のように生成しますが、
-- 文字列ソートだと `1/10` が `1/2` より先に来てしまいます。
-- そのためソート用に各 order_no をゼロパディング（幅 5）した `sortable_full_order_no` を生成し、
-- ORDER BY にはこれを使用します。幅 5 は最大 99999 を想定した例です。

WITH RECURSIVE org_tree AS (
  -- ルートノード
  SELECT
    id
  , name
  , parent_id
  , order_no
  , CAST(name AS STRING) AS fullname
  -- 表示用の full_order_no（人間が読む用）
  , CAST(order_no AS STRING) AS full_order_no
  -- ソート用のキー: 各コンポーネントをゼロ埋めして連結する。LPAD の幅は 5 を使用。
  , LPAD(CAST(order_no AS STRING), 5, '0') AS sortable_full_order_no
  , 0 AS depth
  FROM `staff_org_chart_builder.org_nodes`
  WHERE parent_id IS NULL
  AND (available_from IS NULL OR available_from <= CURRENT_DATE())
  AND (available_to IS NULL OR available_to >= CURRENT_DATE())

  UNION ALL

  SELECT
    c.id
  , c.name
  , c.parent_id
  , c.order_no
  , CONCAT(p.fullname, ' > ', c.name) AS fullname
  -- 表示用 full_order_no はスラッシュ区切りで可読性を保つ
  , CONCAT(p.full_order_no, '/', CAST(c.order_no AS STRING)) AS full_order_no
  -- sortable_full_order_no は各 order_no を LPAD(...,5,'0') でゼロ埋めして連結
  , CONCAT(p.sortable_full_order_no, '/', LPAD(CAST(c.order_no AS STRING), 5, '0')) AS sortable_full_order_no
  , p.depth + 1 AS depth
  FROM `staff_org_chart_builder.org_nodes` AS c
  JOIN org_tree AS p
  ON c.parent_id = p.id
  WHERE (c.available_from IS NULL OR c.available_from <= CURRENT_DATE())
  AND (c.available_to IS NULL OR c.available_to >= CURRENT_DATE())
)

SELECT id
     , fullname
     , parent_id
     , order_no
     , full_order_no
     , depth
FROM org_tree
-- ORDER BY には sortable_full_order_no を使い、数値的順序に対応させる。
ORDER BY sortable_full_order_no;
