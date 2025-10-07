-- sql/org_nodes_with_members_flat_01.sql
-- BigQuery: `org_nodes_with_members_array_01.sql` を起点に ARRAY_AGG を除去して各行を展開する版
-- 出力: 組織カラム + member_* カラム（メンバーが無ければ member_* は NULL）

WITH RECURSIVE
roots AS (
  SELECT *
  FROM `staff_org_chart_builder.org_nodes`
  WHERE
    parent_id IS NULL
    AND (available_from IS NULL OR available_from <= CURRENT_DATE())
    AND (available_to IS NULL OR available_to >= CURRENT_DATE())
)

, org_tree AS (
  -- org_nodes_with_members_array_01.sql と同一の org_tree を再利用
  SELECT
    id
    , name
    , parent_id
    , order_no
    , CAST(name AS STRING) AS fullname
    , CAST(order_no AS STRING) AS full_order_no
    , LPAD(CAST(order_no AS STRING), 5, '0') AS sortable_full_order_no
    , 0 AS depth
  FROM roots

  UNION ALL

  SELECT
    c.id
    , c.name
    , c.parent_id
    , c.order_no
    , CONCAT(p.fullname, ' > ', c.name) AS fullname
    , CONCAT(p.full_order_no, '/', CAST(c.order_no AS STRING)) AS full_order_no
    , CONCAT(p.sortable_full_order_no, '/', LPAD(CAST(c.order_no AS STRING), 5, '0')) AS sortable_full_order_no
    , p.depth + 1 AS depth
  FROM `staff_org_chart_builder.org_nodes` AS c
  INNER JOIN org_tree AS p
    ON c.parent_id = p.id
  WHERE
    (c.available_from IS NULL OR c.available_from <= CURRENT_DATE())
    AND (c.available_to IS NULL OR c.available_to >= CURRENT_DATE())
)

SELECT
  t.id
  , t.fullname
  , t.parent_id
  , t.order_no AS org_order_no
  , t.full_order_no
  , t.sortable_full_order_no
  , t.depth
  , r.person_id AS member_id
  , p.business_name AS member_business_name
  , r.role AS member_role
  , r.is_secondment AS member_is_secondment
  , r.status AS member_status
  , SAFE_CAST(r.order_no AS INT64) AS member_order_no
FROM org_tree AS t
LEFT JOIN `staff_org_chart_builder.org_member_relations` AS r
  ON
    t.id = r.org_node_id
    AND (r.available_from IS NULL OR r.available_from <= CURRENT_DATE())
    AND (r.available_to IS NULL OR r.available_to >= CURRENT_DATE())
LEFT JOIN `staff_org_chart_builder.persons` AS p
  ON r.person_id = p.id
ORDER BY t.sortable_full_order_no, COALESCE(SAFE_CAST(r.order_no AS INT64), 999999), p.business_name;
