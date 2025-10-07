-- sql/org_nodes_with_members_01.sql
-- BigQuery: 組織ノードに所属メンバーを付与して出力する（CTE ベース、読みやすさ重視）
-- 出力: id, fullname, parent_id, order_no, full_order_no, sortable_full_order_no, depth, members

-- ポイント:
--  - fullname: ルートからのパス（例: 会社A > 総務本部 > 総務部）
--  - full_order_no: 表示用の順序（スラッシュ区切り）
--  - sortable_full_order_no: LPAD(...,5,'0') を使ったソート用キー
--  - members: ARRAY<STRUCT(person_id, business_name, role, is_secondment, status, order_no)>（org_member_relations.order_no で整列）

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
  -- 再帰で階層を展開し、表示用 fullname / full_order_no / sortable_full_order_no / depth を作る
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

, node_members AS (
  -- 各組織ノードに紐づく有効な配属を集め、表示順で並べた配列を作る
  SELECT
    r.org_node_id
    , ARRAY_AGG(STRUCT(
      r.person_id AS person_id
      , p.business_name AS business_name
      , r.role AS role
      , r.is_secondment AS is_secondment
      , r.status AS status
      , r.order_no AS order_no
    ) ORDER BY COALESCE(r.order_no, 999999), p.business_name) AS members
  FROM `staff_org_chart_builder.org_member_relations` AS r
  INNER JOIN `staff_org_chart_builder.persons` AS p
    ON r.person_id = p.id
  WHERE
    (r.available_from IS NULL OR r.available_from <= CURRENT_DATE())
    AND (r.available_to IS NULL OR r.available_to >= CURRENT_DATE())
  GROUP BY r.org_node_id
)

, relation_all AS (
  SELECT
    t.id
    , t.fullname
    , t.parent_id
    , t.order_no
    , t.full_order_no
    , t.sortable_full_order_no
    , t.depth
    , COALESCE(nm.members, []) AS members
  FROM org_tree AS t
  LEFT JOIN node_members AS nm
    ON t.id = nm.org_node_id
)

SELECT
  fullname
  , (
    SELECT
      ARRAY_AGG(STRUCT(
        business_name
        , role
        , is_secondment
        , status
      ))
    FROM UNNEST(members)
  ) AS members
FROM relation_all
ORDER BY sortable_full_order_no;
