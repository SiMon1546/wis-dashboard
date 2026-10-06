# Water-level history correction — 2026-10-06

The original live connector began capturing observations on 2026-10-05. Selecting 7d did not create older observations. The first history frontend also stretched every selection to the available data, making 24h and 7d appear identical.

Real history was retrieved from the endpoint used by the official ThaiWater frontend:
`https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_graph`
Parameters: station_type=tele_waterlevel, station_id=2795/2744/2599, start_date=2026-09-29, end_date=2026-10-06 23:59.

All 45 existing overlapping values matched within 0.00001 m, confirming station, datum and Asia/Bangkok datetime interpretation. Inserted 159 missing water-level observations per station (477 total); kept existing observations, current_state and risk unchanged. Imported only times at or before the station's latest WIS observation. NULL values were omitted; gaps remain visible. This was a one-time backfill; the live connector continues accumulation.

Full response JSON and SHA-256 provenance were saved in raw.raw_ingest, linked to BACKFILL ingestion runs and observations. Backfill rows use QC STALE because they were retrieved later; values passed a basic -20..100 m range check, which does not certify instrument accuracy. They do not claim real-time LIVE QC.

Charts now use API start_at/end_at for the actual 24h/7d axis. Historical STALE values can be displayed with grey markers after a range check; SUSPECT/ERROR/MISSING values remain excluded. Lines are not drawn over gaps greater than 90 minutes or datum changes.
