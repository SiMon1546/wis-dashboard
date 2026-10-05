CREATE OR REPLACE FUNCTION public.wis_dashboard_history(p_hours integer DEFAULT 24)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
WITH bounds AS (SELECT now() AS end_at, now()-make_interval(hours=>CASE WHEN p_hours=168 THEN 168 ELSE 24 END) AS start_at),
base AS (SELECT s.site_id,s.site_code,s.name_th,CASE s.site_code WHEN 'TW-2795' THEN 'C2' WHEN 'TW-2744' THEN 'C13' ELSE 'C12' END AS station_code FROM core.sites s WHERE s.site_code IN ('TW-2795','TW-2744','TW-2599')),
series AS (SELECT b.*,coalesce((SELECT jsonb_agg(jsonb_build_object('observed_at',d.observed_at,'water_level_m',d.value,'qc_status',d.qc_status,'vertical_datum_id',d.vertical_datum_id) ORDER BY d.observed_at) FROM (SELECT DISTINCT ON (o.observed_at) o.observed_at,o.value,o.qc_status,o.vertical_datum_id FROM obs.observations o JOIN meta.parameters p ON p.parameter_id=o.parameter_id CROSS JOIN bounds t WHERE o.site_id=b.site_id AND o.source_id='01A' AND p.parameter_code='water_level' AND o.is_latest_revision AND o.observed_at BETWEEN t.start_at AND t.end_at ORDER BY o.observed_at,o.revision_no DESC,o.processed_at DESC LIMIT 10001) d),'[]'::jsonb) points FROM base b)
SELECT jsonb_build_object('generated_at',t.end_at,'start_at',t.start_at,'end_at',t.end_at,'hours',CASE WHEN p_hours=168 THEN 168 ELSE 24 END,'source','ThaiWater','stations',coalesce((SELECT jsonb_agg(jsonb_build_object('station_code',station_code,'site_code',site_code,'name_th',name_th,'point_count',jsonb_array_length(points),'truncated',jsonb_array_length(points)>10000,'points',CASE WHEN jsonb_array_length(points)>10000 THEN '[]'::jsonb ELSE points END) ORDER BY CASE station_code WHEN 'C2' THEN 1 WHEN 'C13' THEN 2 ELSE 3 END) FROM series),'[]'::jsonb)) FROM bounds t;
$$;
REVOKE ALL ON FUNCTION public.wis_dashboard_history(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wis_dashboard_history(integer) TO service_role;
-- Server-only read privileges; no grants to browser roles.
GRANT USAGE ON SCHEMA core,obs,meta TO service_role;
GRANT SELECT ON core.sites,obs.observations,meta.parameters TO service_role;
