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
  const x=t=>55+(t-axisStart)/(axisEnd-axisStart)*365, y=v=>140-(v-min)/(max-min)*115;
  const svg=svgNode('svg',{viewBox:'0 0 450 190',role:'img','aria-label':`กราฟระดับน้ำ ${s.station_code} ${valid.length} จุด ระหว่าง ${time(points[0].observed_at)} และ ${time(points.at(-1).observed_at)}`});
  for(let i=0;i<3;i++){const v=min+(max-min)*i/2;svg.append(svgNode('line',{x1:55,x2:420,y1:y(v),y2:y(v),stroke:'#dce5ed'}),svgNode('text',{x:49,y:y(v)+4,'text-anchor':'end','font-size':12,fill:'#526174'},number(v,2)));}
  svg.append(svgNode('text',{x:55,y:15,'font-size':12,fill:'#526174'},'ระดับน้ำ (ม.) · แกนตั้งปรับตามสถานี'));
  let previous=null,gaps=0;
  for(const p of points){
    const accepted=valid.includes(p), t=Date.parse(p.observed_at);
    if(!accepted){previous=null;continue;}
    if(previous){const dt=t-Date.parse(previous.observed_at);if(dt<=90*60000 && p.vertical_datum_id===previous.vertical_datum_id) svg.append(svgNode('line',{x1:x(Date.parse(previous.observed_at)),y1:y(Number(previous.water_level_m)),x2:x(t),y2:y(Number(p.water_level_m)),stroke:'#145ca4','stroke-width':2}));else gaps++;}
    const dot=svgNode('circle',{cx:x(t),cy:y(Number(p.water_level_m)),r:4,fill:p.qc_status==='STALE'?'#73869b':p.qc_status==='DELAYED'?'#b87710':'#145ca4'});dot.append(svgNode('title',{},`${time(p.observed_at)} · ${number(p.water_level_m)} ม. · QC ${p.qc_status}`));svg.append(dot);previous=p;
  }
  const short=v=>new Date(v).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
  svg.append(svgNode('text',{x:55,y:166,'font-size':12,fill:'#526174'},short(axisStart)),svgNode('text',{x:420,y:166,'text-anchor':'end','font-size':12,fill:'#526174'},short(axisEnd)));box.append(svg);
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
