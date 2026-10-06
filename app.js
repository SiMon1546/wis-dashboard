'use strict';
const API_URL = 'https://pexkpkdhiktvenvbowvb.supabase.co/functions/v1/wis-dashboard';
const REFRESH_MS = 60000;
const ORDER = ['C2', 'C13', 'C12'];
const locations = {C2:'เจ้าพระยาตอนบน · นครสวรรค์', C13:'ด้านท้ายเขื่อนเจ้าพระยา · ชัยนาท', C12:'เจ้าพระยาช่วงกรุงเทพฯ · สามเสน'};
const el = id => document.getElementById(id);
const number = (v, digits = 2) => v === null || v === undefined || !Number.isFinite(Number(v)) ? 'ไม่มีข้อมูล' : Number(v).toLocaleString('th-TH', {maximumFractionDigits: digits, minimumFractionDigits: digits});
const time = v => { const d = new Date(v); return v && Number.isFinite(d.getTime()) ? d.toLocaleString('th-TH', {timeZone: 'Asia/Bangkok', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'}) : 'ไม่มีข้อมูล'; };
const riskNames = {NORMAL:'ปกติ', WATCH:'เฝ้าระวัง', WARNING:'เตือน', CRITICAL:'วิกฤต', DANGER:'อันตราย', EMERGENCY:'ฉุกเฉิน'};
const trendNames = {RISING:'↑ เพิ่มขึ้น', FALLING:'↓ ลดลง', STEADY:'→ ทรงตัว', UNKNOWN:'ยังประเมินไม่ได้'};
let busy = false, nextRefresh = 0, lastData = null, lastSuccess = null, failure = false;
function node(tag, text, cls) { const n = document.createElement(tag); if(text !== undefined) n.textContent = text; if(cls) n.className = cls; return n; }
function riskBadge(value) { const risk = Object.hasOwn(riskNames, value) ? value : 'UNKNOWN'; return node('span', `${riskNames[risk] || 'ยังประเมินไม่ได้'} · ${value || 'UNKNOWN'}`, `badge risk-${risk}`); }
function row(parent, label, value) { const r = node('div', undefined, 'metric-row'); r.append(node('span', label), node('strong', value)); parent.append(r); }
function age(s) { const d = Date.parse(s.observed_at); return Number.isFinite(d) ? Math.max(0,(Date.now()-d)/60000) : s.age_minutes; }
function riskReason(s) {
  const box = node('div', undefined, 'risk-reason');
  box.append(node('strong', 'เหตุผลของ WIS risk'));
  if(s.engine_version !== '04A-basic-v0.1') {
    box.append(node('p', 'แสดงระดับจาก Backend · ยังไม่มีคำอธิบายเกณฑ์สำหรับ Engine รุ่นนี้'));
    return box;
  }
  const margin = s.bank_margin_m;
  let expected, reason;
  if(s.qc_status === 'SUSPECT') {
    expected = 'WATCH'; reason = 'QC เป็น SUSPECT: Engine ให้เฝ้าระวังเพราะข้อมูลผิดปกติ และยังสรุปสถานะน้ำไม่ได้';
  } else if((s.bank_text || '').includes('ล้นตลิ่ง')) {
    expected = 'CRITICAL'; reason = 'ข้อความจากแหล่งข้อมูลระบุล้นตลิ่ง จึงจัดเป็น CRITICAL';
  } else if(margin == null || !Number.isFinite(Number(margin))) {
    expected = 'WATCH'; reason = 'ไม่มีระยะถึงตลิ่ง จึงจัดเป็น WATCH เพราะข้อมูลยังไม่ครบ';
  } else if(Number(margin) <= 0.5) {
    expected = 'WARNING'; reason = `ระยะถึงตลิ่ง ${number(margin)} ม. อยู่ในเกณฑ์ไม่เกิน 0.50 ม. จึงเป็น WARNING`;
  } else if(Number(margin) <= 1) {
    expected = 'WATCH'; reason = `ระยะถึงตลิ่ง ${number(margin)} ม. อยู่ในเกณฑ์มากกว่า 0.50 ถึง 1.00 ม. จึงเป็น WATCH`;
  } else {
    expected = 'NORMAL'; reason = `ระยะถึงตลิ่ง ${number(margin)} ม. มากกว่า 1.00 ม. จึงเป็น NORMAL`;
  }
  box.append(node('p', expected === s.risk_level ? reason : 'ระดับจาก Backend ไม่ตรงกับเกณฑ์ที่หน้าเว็บรู้จัก จึงยังยืนยันเหตุผลไม่ได้'));
  const details = node('details'), summary = node('summary', 'เกณฑ์และความเชื่อมั่น'); details.append(summary);
  details.append(node('p', 'เกณฑ์ระยะถึงตลิ่ง: ≤ 0.50 ม. WARNING · > 0.50–1.00 ม. WATCH · > 1.00 ม. NORMAL; ข้อความล้นตลิ่งเป็น CRITICAL และ QC SUSPECT มีสิทธิ์ทับเป็น WATCH'));
  details.append(node('p', 'แนวโน้มแสดงประกอบเท่านั้น ยังไม่เพิ่มหรือลดระดับ risk ใน Engine รุ่นนี้'));
  details.append(node('p', 'ความเชื่อมั่นเป็นคะแนนตามกฎคุณภาพข้อมูล ไม่ใช่โอกาสทำนายถูก: LIVE 95%, DELAYED 80%, STALE 45%, อื่น ๆ 30%; ไม่มีระยะถึงตลิ่งหัก 15 จุด และ trend UNKNOWN หัก 5 จุด โดยมีขั้นต่ำ 20%'));
  details.append(node('p', `คำนวณความเสี่ยงเมื่อ: ${time(s.calculated_at)} · Engine ${s.engine_version}`));
  details.append(node('p', 'ระดับนี้อ้างอิงข้อมูล ณ เวลาคำนวณ โปรดดู QC และเวลาตรวจวัดประกอบ โดยเฉพาะเมื่อข้อมูลเก่า'));
  box.append(details); return box;
}
function card(s) {
  const article = node('article', undefined, 'station'); article.dataset.station = s.station_code;
  const top = node('div', undefined, 'card-top'), name = node('div');
  name.append(node('div', `จุด ${ORDER.indexOf(s.station_code)+1} · ${s.station_code}`, 'code'),node('div', s.province || 'ไม่มีข้อมูลจังหวัด', 'province'),node('h2', s.name_th || s.name_en || s.site_code, 'site-name'),node('p', locations[s.station_code] || s.river_name || '', 'location-context'));
  if(s.lat != null && s.lon != null && Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lon)) && Math.abs(Number(s.lat))<=90 && Math.abs(Number(s.lon))<=180) {
    const map = node('a','ดูตำแหน่งบนแผนที่ ↗','map-link');
    map.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.lat+','+s.lon)}`;
    map.target = '_blank'; map.rel = 'noopener noreferrer'; map.setAttribute('aria-label', `ดูตำแหน่ง ${s.station_code} ${s.name_th || ''} บนแผนที่`); name.append(map);
  }
  top.append(name,riskBadge(s.risk_level));
  const metrics = node('div', undefined, 'metrics'); metrics.append(node('div', 'ระดับน้ำ', 'label'));
  const level = node('div', number(s.water_level_m), 'level'); level.append(node('span', ' ม.', 'unit')); metrics.append(level);
  row(metrics,'อัตราการไหล / ระบาย',s.discharge_m3s == null ? 'ไม่มีข้อมูล' : `${number(s.discharge_m3s,0)} ม³/วินาที`);
  row(metrics,'ระยะถึงตลิ่ง',s.bank_margin_m == null ? 'ไม่มีข้อมูล' : `${number(s.bank_margin_m)} ม.`);
  row(metrics,'แนวโน้ม',trendNames[s.trend] || s.trend || 'ยังประเมินไม่ได้');
  row(metrics,'อัตราเปลี่ยนระดับ',s.water_rate_m_per_hr == null ? 'ไม่มีข้อมูล' : `${number(s.water_rate_m_per_hr,3)} ม./ชม.`);
  const quality = node('div', undefined, 'quality');
  for(const text of [`QC: ${s.qc_status || 'UNKNOWN'} · อายุข้อมูล ${number(age(s),0)} นาที`, `ความเชื่อมั่น: ${s.confidence == null ? 'ไม่มีข้อมูล' : number(s.confidence*100,0)+'%'}`, `เวลาตรวจวัด: ${time(s.observed_at)}`, `สถานะน้ำ: ${s.water_state || 'UNKNOWN'}`, `หลักฐานน้ำล้น: ${s.flood_state || 'UNKNOWN'}`, `Trend method: ${s.trend_method || 'UNKNOWN'}`]) quality.append(node('p',text));
  article.append(top,metrics,riskReason(s),quality); return article;
}
function render(data) {
  el('overall').replaceChildren(riskBadge(data.overall_risk));
  const list = el('stations'); list.replaceChildren();
  for(const code of ORDER) { const s = data.stations.find(x => x.station_code === code); list.append(card(s || {station_code:code,name_th:'ไม่พบข้อมูลสถานี',qc_status:'MISSING',risk_level:'UNKNOWN'})); }
  const ingest = data.last_ingestion || {};
  el('ingestion').textContent = `การนำเข้าล่าสุด: ${ingest.status || 'UNKNOWN'} · ${time(ingest.finished_at)} · Engine: ${data.stations[0]?.engine_version || 'UNKNOWN'}`;
}
async function refresh() {
  if(busy) return; busy = true; el('refresh').disabled = true;
  const controller = new AbortController(), timeout = setTimeout(()=>controller.abort(),20000);
  try {
    const response = await fetch(API_URL,{cache:'no-store',signal:controller.signal});
    if(!response.ok) throw new Error(`API HTTP ${response.status}`);
    const data = await response.json();
    if(!Array.isArray(data.stations) || !data.stations.length) throw new Error('API ไม่ส่งข้อมูลสถานี');
    lastData = data; lastSuccess = new Date(); failure = false; render(data);
    el('last-fetch').textContent = `รับข้อมูลล่าสุด: ${time(lastSuccess)}`;
    el('status').textContent = `เชื่อมต่อสำเร็จ · ${data.source || 'WIS'} · ${data.station_count ?? data.stations.length} สถานี · เวลา API: ${time(data.generated_at)}`;
    el('status').className = '';
  } catch(error) {
    failure = true;
    el('status').textContent = `เชื่อมต่อไม่สำเร็จ (${error.name === 'AbortError' ? 'หมดเวลารอ' : error.message})${lastSuccess ? ' · กำลังแสดงข้อมูลที่รับไว้เมื่อ '+time(lastSuccess)+' โปรดดูเวลาตรวจวัดก่อนใช้งาน' : ' · ยังไม่มีข้อมูลที่ยืนยันได้'}`;
    el('status').className = 'error';
  } finally { clearTimeout(timeout); busy = false; el('refresh').disabled = false; nextRefresh = Date.now()+REFRESH_MS; }
}
el('refresh').addEventListener('click',refresh);
document.addEventListener('visibilitychange',()=>{if(!document.hidden) refresh();});
setInterval(()=>{
  if(document.hidden || busy) return;
  if(Date.now()>=nextRefresh) {refresh();return;}
  el('countdown').textContent = `รีเฟรชอีก ${Math.ceil((nextRefresh-Date.now())/1000)} วินาที${failure?' · จะลองเชื่อมต่อใหม่':''}`;
},1000);
refresh();
