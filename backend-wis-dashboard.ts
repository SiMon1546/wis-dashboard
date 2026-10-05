
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

function getAdminKey(): string {
  const modern = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modern) {
    try {
      const obj = JSON.parse(modern);
      if (obj.default) return String(obj.default);
      const first = Object.values(obj)[0];
      if (first) return String(first);
    } catch (_) {}
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  throw new Error("No server-side Supabase key available");
}

const admin = createClient(SUPABASE_URL, getAdminKey(), {
  auth: { persistSession: false, autoRefreshToken: false }
});

Deno.serve(async (req: Request) => {
  const headers = new Headers({
    "content-type":"application/json; charset=utf-8",
    "cache-control":"no-store",
    "access-control-allow-origin":"*",
    "access-control-allow-methods":"GET,OPTIONS",
    "access-control-allow-headers":"content-type"
  });
  if (req.method === "OPTIONS") return new Response(null,{status:204,headers});
  if (req.method !== "GET") return new Response(JSON.stringify({ok:false,error:"METHOD_NOT_ALLOWED"}),{status:405,headers});
  try {
    const period = new URL(req.url).searchParams.get("history");
    if (period !== null && period !== "24h" && period !== "7d") return new Response(JSON.stringify({ok:false,error:"INVALID_HISTORY_PERIOD"}),{status:400,headers});
    const { data, error } = period
      ? await admin.rpc("wis_dashboard_history", {p_hours:period === "7d" ? 168 : 24})
      : await admin.rpc("wis_dashboard_snapshot");
    if (error) throw new Error(error.message);
    return new Response(JSON.stringify(data),{status:200,headers});
  } catch (e) {
    return new Response(JSON.stringify({ok:false,error:"DASHBOARD_SNAPSHOT_UNAVAILABLE"}),{status:500,headers});
  }
});
