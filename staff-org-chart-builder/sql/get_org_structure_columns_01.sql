-- sql/get_org_structure_columns_01.sql
-- BigQuery: 階層列型組織出力（level_1 .. level_5）
-- 出力: id, fullname, full_order_no, sortable_full_order_no, parent_id, order_no, depth, level_1, level_2, level_3, level_4, level_5

WITH RECURSIVE org_tree AS (
  SELECT
    id
    , name
    , parent_id
    , order_no
    , 0 AS depth
    , ARRAY[name] AS names
    , ARRAY[CAST(order_no AS STRING)] AS orders
    , CAST(name AS STRING) AS fullname
    , CAST(order_no AS STRING) AS full_order_no
    , LPAD(CAST(order_no AS STRING), 5, '0') AS sortable_full_order_no
  FROM `staff_org_chart_builder.org_nodes`
  WHERE
    parent_id IS NULL
    AND (available_from IS NULL OR available_from <= CURRENT_DATE())
    AND (available_to IS NULL OR available_to >= CURRENT_DATE())

  UNION ALL

  SELECT
    c.id
    , c.name
    , c.parent_id
    , c.order_no
    , p.depth + 1 AS depth
    , ARRAY_CONCAT(p.names, [c.name]) AS names
    , ARRAY_CONCAT(p.orders, [CAST(c.order_no AS STRING)]) AS orders
    , CONCAT(p.fullname, ' > ', c.name) AS fullname
    , CONCAT(p.full_order_no, '/', CAST(c.order_no AS STRING)) AS full_order_no
    , CONCAT(p.sortable_full_order_no, '/', LPAD(CAST(c.order_no AS STRING), 5, '0')) AS sortable_full_order_no
  FROM `staff_org_chart_builder.org_nodes` AS c
  INNER JOIN org_tree AS p
    ON c.parent_id = p.id
  WHERE
    (c.available_from IS NULL OR c.available_from <= CURRENT_DATE())
    AND (c.available_to IS NULL OR c.available_to >= CURRENT_DATE())
)

SELECT
  id
  , fullname
  , full_order_no
  , sortable_full_order_no
  , parent_id
  , order_no
  , depth
  -- level_0 .. level_4: 足りない要素は NULL（zero-origin）
  , IF(ARRAY_LENGTH(names) >= 1, names[OFFSET(0)], NULL) AS level_0
  , IF(ARRAY_LENGTH(names) >= 2, names[OFFSET(1)], NULL) AS level_1
  , IF(ARRAY_LENGTH(names) >= 3, names[OFFSET(2)], NULL) AS level_2
  , IF(ARRAY_LENGTH(names) >= 4, names[OFFSET(3)], NULL) AS level_3
  , IF(ARRAY_LENGTH(names) >= 5, names[OFFSET(4)], NULL) AS level_4
FROM org_tree
WHERE depth <= 4
-- ORDER BY には sortable_full_order_no を使用（各 order_no を LPAD(...,5,'0') でゼロ埋めしているため、文字列ソートで数値順になる）
ORDER BY sortable_full_order_no;
