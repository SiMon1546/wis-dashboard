# WIS 06A Minimum Dashboard

Read-only responsive frontend for the existing WIS Supabase dashboard API.
Scope: C2, C13, C12; level, discharge, bank margin, trend, QC, freshness,
confidence and WIS risk. No backend, database or architecture changes.

Static HTML/CSS/JS; Vercel framework preset **Other**, root directory **.**,
no install/build command and no environment variables required.
Public API URL is in app.js. No credentials or secrets are included.

Refresh every 60 seconds after completion of the previous request while visible;
refresh immediately on returning to the tab. iOS can suspend background tabs.
NULL is displayed as missing, never zero. Failed requests retain the last
successful data and clearly display the connection failure and last fetch time.

Source provenance: original 06A source could not be retrieved from the earlier
conversation; this implementation reconstructs its specified minimum behavior
using the live 06A-minimum-v1.0 API contract. No exact-source equivalence claimed.
