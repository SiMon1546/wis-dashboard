'use strict';
// Preview only. The API remains the sole authority for WIS risk and QC.
const API_URL = 'https://pexkpkdhiktvenvbowvb.supabase.co/functions/v1/wis-dashboard';
const REFRESH_MS = 60000, ORDER = ['C2', 'C13', 'C12'];
const el = id => document.getElementById(id);
const number = (v, digits = 2) => v === null || v === undefined || !Number.isFinite(Number(v)) ? 'ไม่มีข้อมูล' : Number(v).toLocaleString('th-TH', {maximumFractionDigits: digits, minimumFractionDigits: digits});
const time = v => {const d = new Date(v);return v && Number.isFinite(d.getTime()) ? d.toLocaleString('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}) : 'ไม่มีข้อมูล';};
const riskNames = {NORMAL:'ปกติ',WATCH:'เฝ้าระวัง',WARNING:'เตือน',CRITICAL:'วิกฤต',DANGER:'อันตราย',EMERGENCY:'ฉุกเฉิน'};
const trendNames = {RISING:'↑ เพิ่มขึ้น',FALLING:'↓ ลดลง',STEADY:'→ ทรงตัว',UNKNOWN:'ยังประเมินไม่ได้'};
const places = {C2:'นครสวรรค์ · ค่ายจิรประวัติ',C13:'ชัยนาท · ท้ายเขื่อนเจ้าพระยา',C12:'กรุงเทพฯ · สามเสน'};
let apiClockOffset = 0, busy = false, nextRefresh = 0, lastData = null, lastSuccess = null, failure = false;
function node(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function riskBadge(value){const risk=Object.hasOwn(riskNames,value)?value:'UNKNOWN';return node('span',`${riskNames[risk]||'ยังประเมินไม่ได้'} · ${value||'UNKNOWN'}`,`badge risk-${risk}`);}
function age(s){const d=Date.parse(s.observed_at);if(!Number.isFinite(d))return null;const minutes=(Date.now()+apiClockOffset-d)/60000;return minutes>=0?minutes:null;}
// Identical freshness boundaries and API clock correction to production V1.
function freshnessState(minutes){if(minutes==null||!Number.isFinite(minutes)||minutes<0)return ['UNKNOWN','ยังประเมินความสดไม่ได้'];if(minutes<=75)return ['LIVE','ข้อมูลล่าสุด'];if(minutes<=120)return ['DELAYED','ข้อมูลล่าช้า'];return ['STALE','ข้อมูลเก่า'];}
function freshness(s){const minutes=age(s),[status,label]=freshnessState(minutes);const box=node('div',undefined,`freshness fresh-${status}`);box.append(node('strong',`${label} · ${status}${minutes==null?'':` · ${Math.floor(minutes).toLocaleString('th-TH')} นาที`}`));const stamp=node('time',`ตรวจวัด ${time(s.observed_at)}`);if(Number.isFinite(Date.parse(s.observed_at)))stamp.dateTime=s.observed_at;box.append(stamp);return box;}
function currentStations(){return ORDER.map(code=>lastData?.stations.find(s=>s.station_code===code)||{station_code:code,risk_level:'UNKNOWN'});}
function updateSituation(){
  if(!lastData)return;
  const stations=currentStations();
  for(const s of stations){const old=document.querySelector(`[data-station="${s.station_code}"] .freshness`);if(old)old.replaceWith(freshness(s));}
  const missing=stations.some(s=>age(s)==null),oldest=Math.max(...stations.map(s=>age(s)??0));
  const [status,label]=freshnessState(missing?null:oldest);
  el('freshness-summary').className=`fresh-${status}`;
  el('freshness-summary').textContent=`${label} · ${status}${missing?'':` · จุดเก่าสุด ${Math.floor(oldest)} นาที`}`;
  el('observed-summary').textContent=`ตรวจวัดล่าสุดในชุดข้อมูล ${time(lastData.latest_observed_at)}`;
  // A falling level alone does not prove the overall situation is improving.
  const usable=stations.every(s=>freshnessState(age(s))[0]==='LIVE'&&['LIVE','PASS','VALID'].includes(s.qc_status));
  const same=usable&&stations.every(s=>s.trend===stations[0].trend);
  el('direction').textContent=same&&stations[0].trend==='STEADY'?'แนวโน้มระดับน้ำทั้ง 3 จุด: ทรงตัว':'ทิศทางภาพรวม: ยังสรุปไม่ได้จากข้อมูลที่มี';
  const reasons=[];
  const margins=stations.filter(s=>s.bank_margin_m!=null&&Number.isFinite(Number(s.bank_margin_m))).sort((a,b)=>Number(a.bank_margin_m)-Number(b.bank_margin_m));
  if(margins[0]){const s=margins[0];reasons.push(`${s.station_code} ระยะถึงตลิ่ง ${number(s.bank_margin_m)} ม. · WIS ${riskNames[s.risk_level]||s.risk_level||'ยังประเมินไม่ได้'}`);}
  const other=margins.find(s=>s.station_code!==margins[0]?.station_code&&s.risk_level&&s.risk_level!=='NORMAL');
  if(other)reasons.push(`${other.station_code} ระยะถึงตลิ่ง ${number(other.bank_margin_m)} ม. · ${trendNames[other.trend]||'ยังประเมินแนวโน้มไม่ได้'}`);
  const trends=stations.filter(s=>['RISING','FALLING','STEADY'].includes(s.trend));
  if(trends.length)reasons.push(`${trends.map(s=>`${s.station_code} ${trendNames[s.trend]}`).join(' · ')}${usable?'':' (อ้างอิงเวลาตรวจวัด ไม่ยืนยันแนวโน้มปัจจุบัน)'}`);
  const qc=stations.filter(s=>!['LIVE','PASS','VALID'].includes(s.qc_status));
  reasons.push(missing?'บางสถานีไม่มีเวลาตรวจวัดที่ใช้ประเมินความสดได้':`${label} ${Math.floor(oldest)} นาที${qc.length?` · QC ${qc.map(s=>`${s.station_code} ${s.qc_status||'UNKNOWN'}`).join(', ')}`:' · โปรดแยกอายุข้อมูลจาก QC ของ Backend'}`);
  el('reasons').replaceChildren(...reasons.slice(0,4).map(text=>node('li',text)));
}
function metric(dl,label,value){dl.append(node('div'));const row=dl.lastChild;row.append(node('dt',label),node('dd',value));}
function stationNode(s){
  const li=node('li',undefined,'station');li.dataset.station=s.station_code;
  const top=node('div',undefined,'station-top'),heading=node('h3',s.station_code);heading.append(node('span',places[s.station_code]||s.name_th||'ไม่มีข้อมูลสถานี'));top.append(heading,riskBadge(s.risk_level));li.append(top);
  const primary=node('div',undefined,'primary'),value=node('strong',number(s.water_level_m),s.water_level_m==null?'missing':'');primary.append(value,node('span',s.water_level_m==null?'ระดับน้ำ':'ม. · ระดับน้ำ'));li.append(primary);
  const metrics=node('dl',undefined,'station-metrics');metric(metrics,'ระยะถึงตลิ่ง',s.bank_margin_m==null?'ไม่มีข้อมูล':`${number(s.bank_margin_m)} ม.`);metric(metrics,'อัตราการไหล / ระบาย',s.discharge_m3s==null?'ไม่มีข้อมูล':`${number(s.discharge_m3s,0)} ม³/วินาที`);metric(metrics,'แนวโน้ม',trendNames[s.trend]||'ยังประเมินไม่ได้');metric(metrics,'QC จาก Backend',s.qc_status||'ไม่มีข้อมูล');li.append(metrics,freshness(s));
  if(s.lat!=null&&s.lon!=null&&Number.isFinite(Number(s.lat))&&Number.isFinite(Number(s.lon))&&Math.abs(Number(s.lat))<=90&&Math.abs(Number(s.lon))<=180){const map=node('a','ดูตำแหน่งสถานี ↗','location-link');map.href=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.lat+','+s.lon)}`;map.target='_blank';map.rel='noopener noreferrer';map.setAttribute('aria-label',`ดูตำแหน่ง ${s.station_code} ${s.name_th||''}`);li.append(map);}
  return li;
}
function reserved(name,status,context){const li=node('li',undefined,'reserved');li.append(node('h3',name),node('p',status),node('p',context));return li;}
function technicalStation(s){const section=node('article',undefined,'technical-station');section.append(node('h3',`${s.station_code} · ${s.name_th||'ไม่มีข้อมูล'}`));const dl=node('dl');for(const [label,value] of [['Source / site',`${lastData.source||'WIS'} / ${s.site_code||'ไม่มีข้อมูล'}`],['QC',s.qc_status||'UNKNOWN'],['Confidence',s.confidence==null?'ไม่มีข้อมูล':number(s.confidence*100,0)+'%'],['Observed',time(s.observed_at)],['Calculated',time(s.calculated_at)],['Engine',s.engine_version||'UNKNOWN'],['Trend method',s.trend_method||'UNKNOWN'],['Rate',s.water_rate_m_per_hr==null?'ไม่มีข้อมูล':number(s.water_rate_m_per_hr,3)+' ม./ชม.'],['Water state',s.water_state||'UNKNOWN'],['Flood evidence',s.flood_state||'UNKNOWN'],['Datum',s.vertical_datum_id||'API ปัจจุบันไม่เปิด datum ของ current value; ห้ามถือว่าต่างสถานีมีฐานเดียวกัน']])dl.append(node('dt',label),node('dd',value));section.append(dl);return section;}
function render(data){
  el('overall').replaceChildren(riskBadge(data.overall_risk));
  const stations=currentStations();
  el('river').replaceChildren(reserved('เขื่อนภูมิพล · ลำน้ำปิง','NOT CONNECTED · ยังไม่เชื่อมข้อมูล','ไม่มีค่าที่เผยแพร่ให้ Dashboard'),reserved('เขื่อนสิริกิติ์ · ลำน้ำน่าน','NOT CONNECTED · ยังไม่เชื่อมข้อมูล','ไม่มีค่าที่เผยแพร่ให้ Dashboard'),stationNode(stations[0]),stationNode(stations[1]),reserved('C29B · วัดกร่าง · ปทุมธานี','SOURCE READY · NOT EXPOSED TO DASHBOARD YET','RID C.29B พร้อมที่แหล่งข้อมูล แต่ยังไม่เปิดค่าบน Dashboard'),stationNode(stations[2]),reserved('อ่าวไทย / น้ำทะเลหนุน','NOT CONNECTED · ยังไม่เชื่อมข้อมูล','ยังไม่มีค่าตรวจวัดหรือค่าคาดการณ์น้ำทะเล'));
  el('station-technical').replaceChildren(...stations.map(technicalStation));
  const explanation=el('risk-explanation');explanation.replaceChildren(node('p','ระดับ WIS risk และ confidence มาจาก Backend เท่านั้น หน้า V2 ไม่สร้างระดับความเสี่ยงใหม่'));
  for(const s of stations)explanation.append(node('p',`${s.station_code}: ${s.risk_level||'UNKNOWN'} · ระยะถึงตลิ่ง ${s.bank_margin_m==null?'ไม่มีข้อมูล':number(s.bank_margin_m)+' ม.'} · QC ${s.qc_status||'UNKNOWN'} · ความเชื่อมั่น ${s.confidence==null?'ไม่มีข้อมูล':number(s.confidence*100,0)+'%'} · คำนวณ ${time(s.calculated_at)} · Engine ${s.engine_version||'UNKNOWN'}`));
  if(stations.every(s=>s.engine_version==='04A-basic-v0.1')){explanation.append(node('p','เกณฑ์ 04A: ระยะถึงตลิ่ง ≤0.50 ม. WARNING · >0.50–1.00 ม. WATCH · >1.00 ม. NORMAL; ไม่มีระยะถึงตลิ่งเป็น WATCH; ข้อความล้นตลิ่งเป็น CRITICAL และ QC SUSPECT มีสิทธิ์ทับเป็น WATCH แนวโน้มไม่เพิ่มหรือลด risk ในรุ่นนี้'),node('p','ความเชื่อมั่น: QC LIVE 95%, DELAYED 80%, STALE 45%, อื่น ๆ 30%; ไม่มีระยะถึงตลิ่งหัก 15 จุด และ trend UNKNOWN หัก 5 จุด ขั้นต่ำ 20% เป็นคำอธิบายกฎเดิม ไม่ใช่ความน่าจะเป็นน้ำท่วม'));}else explanation.append(node('p','Engine รุ่นนี้ยังไม่มีคำอธิบายเกณฑ์ในหน้าเว็บ โปรดอ้างอิงระดับจาก Backend'));
  const ingest=data.last_ingestion||{};el('ingestion').textContent=`การนำเข้าล่าสุด: ${ingest.status||'UNKNOWN'} · ${time(ingest.finished_at)} · API ${data.dashboard_version||'UNKNOWN'} · ${data.consistency_guard||'UNKNOWN'}`;
  updateSituation();
}
async function refresh(){if(busy)return;busy=true;el('refresh').disabled=true;const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);try{const response=await fetch(API_URL,{cache:'no-store',signal:controller.signal});if(!response.ok)throw new Error(`API HTTP ${response.status}`);const data=await response.json();if(!Array.isArray(data.stations)||!data.stations.length)throw new Error('API ไม่ส่งข้อมูลสถานี');apiClockOffset=Number.isFinite(Date.parse(data.generated_at))?Date.parse(data.generated_at)-Date.now():0;lastData=data;lastSuccess=new Date();failure=false;render(data);el('last-fetch').textContent=`เว็บรับ ${time(lastSuccess)} · ไม่ใช่เวลาตรวจวัด`;el('status').textContent=`เชื่อมต่อ ${data.source||'WIS'} · ${data.station_count??data.stations.length} สถานี · API ${time(data.generated_at)}`;el('status').className='';}catch(error){failure=true;el('status').textContent=`เชื่อมต่อไม่สำเร็จ (${error.name==='AbortError'?'หมดเวลารอ':error.message})${lastSuccess?' · กำลังแสดงข้อมูลที่รับไว้เมื่อ '+time(lastSuccess)+' โปรดดูเวลาตรวจวัดก่อนใช้งาน':' · ยังไม่มีข้อมูลที่ยืนยันได้'}`;el('status').className='error';}finally{clearTimeout(timeout);busy=false;el('refresh').disabled=false;nextRefresh=Date.now()+REFRESH_MS;}}
el('refresh').addEventListener('click',refresh);
el('technical-link').addEventListener('click',()=>{el('technical-disclosure').open=true;});
setInterval(()=>{if(!document.hidden)updateSituation();},15000);
setInterval(()=>{if(document.hidden||busy)return;if(Date.now()>=nextRefresh){refresh();return;}el('countdown').textContent=`รีเฟรชอีก ${Math.ceil((nextRefresh-Date.now())/1000)} วินาที${failure?' · จะลองเชื่อมต่อใหม่':''}`;},1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
refresh();

// History drawing adapted visually from production history.js; semantics retained.
'use strict';
let historyPeriod = '24h', historyRequest = 0, historyController;
const historyStatus = document.getElementById('history-status');
const chartRoot = document.getElementById('history-charts');
function svgNode(tag, attrs, text) {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k,v] of Object.entries(attrs)) n.setAttribute(k,String(v));
  if(text !== undefined) n.textContent=text;
  return n;
}
function historyCard(s, bounds) {
  const box=node('article',undefined,'history-card');
  box.append(node('h3',`${s.station_code} · ${s.name_th}`));
  const points=(s.points||[]).filter(p=>Number.isFinite(Date.parse(p.observed_at))).sort((a,b)=>Date.parse(a.observed_at)-Date.parse(b.observed_at));
  const valid=points.filter(p=>p.water_level_m != null && Number.isFinite(Number(p.water_level_m)) && ['LIVE','DELAYED','STALE','PASS','VALID'].includes(p.qc_status) && Number(p.water_level_m)>=-20 && Number(p.water_level_m)<=100);
  if(s.truncated || !valid.length) {box.append(node('p',s.truncated?'ข้อมูลเกินขอบเขตที่รองรับ ยังไม่แสดงกราฟ':'ยังไม่มีข้อมูลระดับน้ำที่ใช้สร้างกราฟได้'));return box;}
  const first=Date.parse(points[0].observed_at),last=Date.parse(points.at(-1).observed_at);
  const axisEnd=Date.parse(bounds.end_at),axisStart=Date.parse(bounds.start_at);
  if(!Number.isFinite(axisStart)||!Number.isFinite(axisEnd)||axisEnd<=axisStart){box.append(node('p','ไม่พบช่วงเวลาของกราฟจาก API'));return box;}
  box.append(node('p',`${valid.length} จุดใช้แสดง / ${points.length} จุดทั้งหมด · มีข้อมูล ${number((last-first)/3600000,1)} ชั่วโมง`,'coverage'));
  box.append(node('p',`${time(points[0].observed_at)} ถึง ${time(points.at(-1).observed_at)}`,'coverage'));
  if(last-first<(historyPeriod==='7d'?168:24)*3600000) box.append(node('p','แสดงแกนเวลาครบช่วงที่เลือก · ช่วงที่ไม่มีข้อมูลจะเว้นว่าง ไม่เติมค่าคาดเดา','partial-history'));
  const values=valid.map(p=>Number(p.water_level_m));
  let min=Math.min(...values),max=Math.max(...values); const pad=Math.max(.02,(max-min)*.15);min-=pad;max+=pad;
  const x=t=>55+(t-axisStart)/(axisEnd-axisStart)*280, y=v=>150-(v-min)/(max-min)*120;
  const svg=svgNode('svg',{viewBox:'0 0 360 206',role:'img','aria-label':`กราฟระดับน้ำ ${s.station_code} ${valid.length} จุด ระหว่าง ${time(points[0].observed_at)} และ ${time(points.at(-1).observed_at)}`});
  for(let i=0;i<3;i++){const v=min+(max-min)*i/2;svg.append(svgNode('line',{x1:55,x2:335,y1:y(v),y2:y(v),stroke:'#dce5ed'}),svgNode('text',{x:49,y:y(v)+4,'text-anchor':'end','font-size':14,fill:'#526174'},number(v,2)));}
  svg.append(svgNode('text',{x:55,y:15,'font-size':14,fill:'#526174'},'ระดับน้ำ (ม.)'));
  let previous=null,gaps=0;
  for(const p of points){
    const accepted=valid.includes(p), t=Date.parse(p.observed_at);
    if(!accepted){previous=null;continue;}
    if(previous){const dt=t-Date.parse(previous.observed_at);if(dt<=90*60000 && p.vertical_datum_id===previous.vertical_datum_id) svg.append(svgNode('line',{x1:x(Date.parse(previous.observed_at)),y1:y(Number(previous.water_level_m)),x2:x(t),y2:y(Number(p.water_level_m)),stroke:'#145ca4','stroke-width':2}));else gaps++;}
    const dot=svgNode('circle',{cx:x(t),cy:y(Number(p.water_level_m)),r:4,fill:p.qc_status==='STALE'?'#73869b':p.qc_status==='DELAYED'?'#b87710':'#145ca4'});dot.append(svgNode('title',{},`${time(p.observed_at)} · ${number(p.water_level_m)} ม. · QC ${p.qc_status}`));svg.append(dot);previous=p;
  }
  const short=v=>new Date(v).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
  svg.append(svgNode('text',{x:55,y:186,'font-size':14,fill:'#526174'},short(axisStart)),svgNode('text',{x:335,y:186,'text-anchor':'end','font-size':14,fill:'#526174'},short(axisEnd)));box.append(svg);
  box.append(node('p',`สีเทา: ประวัติ QC STALE (เก่า แต่ผ่านการตรวจช่วงค่า) · สีทอง: QC DELAYED · ${gaps?'เว้นเส้น '+gaps+' ช่วงที่ห่างเกิน 90 นาทีหรือฐานระดับเปลี่ยน':'ไม่เติมค่าระหว่างจุดตรวจวัด'} · แกนตั้งแต่ละสถานีต่างกัน`,'coverage'));
  const details=node('details'),summary=node('summary','ดูค่าที่ตรวจวัดจริง');details.append(summary);
  const table=node('table'),head=node('tr');for(const title of ['เวลาไทย','ระดับน้ำ (ม.)','QC'])head.append(node('th',title));const thead=node('thead');thead.append(head);table.append(thead);const tbody=node('tbody');
  for(const p of points){const r=node('tr');r.append(node('td',time(p.observed_at)),node('td',number(p.water_level_m)),node('td',p.qc_status||'UNKNOWN'));tbody.append(r);}table.append(tbody);details.append(table);box.append(details);return box;
}
async function refreshHistory(){
  const request=++historyRequest; if(historyController)historyController.abort();historyController=new AbortController();const current=historyController;
  const timeout=setTimeout(()=>current.abort(),20000);historyStatus.textContent='กำลังโหลดประวัติจาก WIS…';
  try{const res=await fetch(API_URL+'?history='+historyPeriod,{cache:'no-store',signal:current.signal});if(!res.ok)throw new Error('HTTP '+res.status);const data=await res.json();if(!Array.isArray(data.stations))throw new Error('รูปแบบข้อมูลไม่ถูกต้อง');if(request!==historyRequest)return;
    chartRoot.replaceChildren(...ORDER.map(code=>historyCard(data.stations.find(s=>s.station_code===code)||{station_code:code,name_th:'ไม่มีข้อมูล',points:[]},data)));
    historyStatus.textContent=`ช่วงที่ขอ: ${historyPeriod==='7d'?'7 วัน':'24 ชั่วโมง'} · รับประวัติ ${time(data.generated_at)} · ข้อมูลจากฐาน WIS`;historyStatus.className='';
  }catch(e){if(request!==historyRequest)return;chartRoot.replaceChildren();historyStatus.textContent='โหลดประวัติไม่สำเร็จ · '+(e.name==='AbortError'?'หมดเวลารอ':e.message)+' · ข้อมูลล่าสุดด้านบนยังใช้งานแยกกันได้';historyStatus.className='error';}finally{clearTimeout(timeout);}
}
for(const b of document.querySelectorAll('[data-period]'))b.addEventListener('click',()=>{historyPeriod=b.dataset.period;for(const other of document.querySelectorAll('[data-period]'))other.setAttribute('aria-pressed',String(other===b));refreshHistory();});
refreshHistory();
setInterval(()=>{if(!document.hidden)refreshHistory();},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshHistory();});
document.getElementById('refresh').addEventListener('click',refreshHistory);
