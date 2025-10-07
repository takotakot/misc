-- sql/org_nodes_columns_with_members_flat_02.sql
-- BigQuery: 階層列型出力 (level_0 .. level_4) に対して members をフラットに展開するバージョン
-- 出力: level_0 .. level_4, member_business_name, member_role, member_is_secondment, member_status, member_order_no

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

, relation_all AS (
  SELECT
    t.id
    , t.fullname
    , t.parent_id
    , t.order_no AS org_order_no
    , t.full_order_no
    , t.sortable_full_order_no
    , t.depth
    , IF(ARRAY_LENGTH(t.names) >= 1, t.names[OFFSET(0)], NULL) AS level_0
    , IF(ARRAY_LENGTH(t.names) >= 2, t.names[OFFSET(1)], NULL) AS level_1
    , IF(ARRAY_LENGTH(t.names) >= 3, t.names[OFFSET(2)], NULL) AS level_2
    , IF(ARRAY_LENGTH(t.names) >= 4, t.names[OFFSET(3)], NULL) AS level_3
    , IF(ARRAY_LENGTH(t.names) >= 5, t.names[OFFSET(4)], NULL) AS level_4
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
  WHERE t.depth <= 4
)

SELECT
  level_0
  , level_1
  , level_2
  , level_3
  , level_4
  , member_business_name
  , member_role
  , member_is_secondment
  , member_status
FROM relation_all
ORDER BY sortable_full_order_no, COALESCE(member_order_no, 999999), member_business_name;
