// CSV-driven rent sync (supersedes the hard-coded R in sync-full.mjs).
// Reads scripts/rent-jul.csv (columns: Sr,UserID,allot,name,mobile,,weekly, then [date,status]×11),
// validates the one-week-in-advance model against the explicit dates, then dry-runs the sync
// and diffs against the current DB. DRY_RUN default; DRY_RUN=0 to commit.
import fs from "fs"; import pg from "pg";
const env = fs.readFileSync(".env.local","utf8").split("\n").reduce((a,l)=>{const [k,...v]=l.split("=");if(k&&k.trim())a[k.trim()]=v.join("=").trim();return a;},{});
const S = env.RDS_ENV==="uat"?"mg_data_uat":"mg_data";
const DRY = process.env.DRY_RUN !== "0";
const c = new pg.Client({host:env.RDS_HOST,port:+env.RDS_PORT,user:env.RDS_USER,password:env.RDS_PASSWORD,database:env.RDS_DATABASE,ssl:{rejectUnauthorized:false}});
const parseDMY=(s)=>{const [d,m,y]=s.split("/").map(Number);return new Date(Date.UTC(y,m-1,d));};
const addDays=(dt,n)=>{const x=new Date(dt);x.setUTCDate(x.getUTCDate()+n);return x;};
const iso=(dt)=>dt.toISOString().slice(0,10);
const dg=s=>(s||"").replace(/\D/g,"");
const istToday=()=>{const d=new Date(Date.now()+5.5*3600e3);return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));};
const STA={Collected:"C",Submitted:"S",Pending:"P","":"."};

// ---- parse CSV ----
const lines = fs.readFileSync("scripts/rent-jul.csv","utf8").split("\n").slice(1).filter(l=>l.trim());
const rows=[]; const dateErrors=[];
for(const line of lines){
  const f=line.split(",");
  const uid=f[1]?.trim(), allotS=f[2]?.trim(), name=f[3]?.trim(), mobile=dg(f[4]), weekly=+f[6];
  if(!mobile||!allotS) continue;
  const allot=parseDMY(allotS);
  const st=[]; const dates=[];
  for(let w=0;w<11;w++){ const dS=f[7+2*w]?.trim(); const s=(f[8+2*w]??"").trim(); st.push(STA[s] ?? "?"); dates.push(dS);
    if(dS){ const exp=iso(addDays(allot,6+7*w)); const got=iso(parseDMY(dS)); if(exp!==got) dateErrors.push(`${name} wk${w+1}: sheet ${got} vs model ${exp}`);} }
  // trim trailing dots
  let str=st.join("");
  rows.push({uid,name,mobile,allot,allotS,weekly,str});
}

async function run(){
  await c.connect();
  console.log(`\n== CSV sync ${DRY?"DRY RUN":"APPLY"} on ${S} ==  (${rows.length} sheet rows, today=${iso(istToday())})\n`);

  // model validation
  if(dateErrors.length){ console.log("⚠️  DATE MISALIGNMENTS (sheet week date != allot+6+7·w):"); dateErrors.forEach(e=>console.log("   "+e)); }
  else console.log("✅ Model check: every week's date == allot + 6 + 7·(week-1). One-week-in-advance model holds for all rows.");

  // snapshot current payments  (rider_id -> Set period_start), and rider lookup
  const ridMap=new Map(); // mobile -> {id,code,name}
  for(const r of (await c.query(`SELECT id,rider_code,name,regexp_replace(mobile,'\\D','','g') m FROM ${S}.riders`)).rows) ridMap.set(r.m,{id:r.id,code:r.rider_code,name:r.name});
  const curPay=new Map(); // rider_id -> Set(period_start)
  for(const p of (await c.query(`SELECT rider_id, to_char(rental_period_start,'YYYY-MM-DD') ps FROM ${S}.rider_payments`)).rows){ if(!curPay.has(p.rider_id))curPay.set(p.rider_id,new Set()); curPay.get(p.rider_id).add(p.ps); }

  await c.query("BEGIN");
  const beforeCollected=Number((await c.query(`SELECT coalesce(sum(amount_collected),0) s FROM ${S}.rider_payments`)).rows[0].s);
  await c.query(`DELETE FROM ${S}.rider_payments`);
  const rentStop=new Map(); const newPay=new Map(); const skipped=[]; let rateFix=0, pay=0;
  for(const r of rows){
    const rid=ridMap.get(r.mobile)?.id;
    if(!rid){skipped.push(`${r.name} (${r.uid}, ${r.mobile}) — NO RIDER in DB`);continue;}
    const asgs=(await c.query(`SELECT id,to_char(assigned_date,'YYYY-MM-DD') ad,vehicle_id,daily_rent FROM ${S}.rider_vehicle_assignments WHERE rider_id=$1`,[rid])).rows;
    if(!asgs.length){skipped.push(`${r.name} (${r.uid}) — rider exists but NO ASSIGNMENT (needs vehicle allotment)`);continue;}
    const onT=r.allot.getTime();
    const a=asgs.sort((x,y)=>Math.abs(new Date(x.ad).getTime()-onT)-Math.abs(new Date(y.ad).getTime()-onT))[0];
    const gap=Math.abs(new Date(a.ad).getTime()-onT)/86400e3;
    if(gap>3){skipped.push(`${r.name} (${r.uid}) allot ${r.allotS} — nearest DB assignment ${a.ad} is ${gap}d off (likely NEW allotment; needs vehicle)`);continue;}
    const daily=Math.round(r.weekly/7);
    if(Number(a.daily_rent)!==daily){await c.query(`UPDATE ${S}.rider_vehicle_assignments SET daily_rent=$1 WHERE id=$2`,[daily,a.id]);rateFix++;}
    const firstS=r.str.indexOf("S");
    if(firstS>=0) rentStop.set(a.id, iso(addDays(r.allot,7*(firstS+1))));
    if(!newPay.has(rid))newPay.set(rid,new Set());
    const mk=async(ps,pe)=>{await c.query(`INSERT INTO ${S}.rider_payments (rider_id,vehicle_id,amount_collected,payment_date,rental_period_start,rental_period_end) VALUES ($1,$2,$3,$4,$5,$6)`,[rid,a.vehicle_id,r.weekly,pe,ps,pe]);pay++;newPay.get(rid).add(ps);};
    await mk(iso(r.allot),iso(addDays(r.allot,6)));                       // week 1 onboarding advance
    for(let i=0;i<r.str.length;i++){ if(r.str[i]!=="C")continue; if(firstS>=0&&i>=firstS)continue; await mk(iso(addDays(r.allot,7*(i+1))),iso(addDays(r.allot,7*(i+1)+6))); }
  }
  // regen dues
  const today=istToday(); const tomorrow=addDays(today,1);
  const asg=(await c.query(`SELECT id,to_char(assigned_date,'YYYY-MM-DD') ad,rider_id,vehicle_id,daily_rent FROM ${S}.rider_vehicle_assignments`)).rows;
  let dues=0;
  for(const a of asg){ await c.query(`DELETE FROM ${S}.rent_dues WHERE assignment_id=$1`,[a.id]);
    const stop=rentStop.get(a.id)??null; const cutoff=stop?new Date(stop+"T00:00:00Z"):tomorrow;
    const amt=Number(a.daily_rent)*7; let wkn=1;
    for(let ps=new Date(a.ad+"T00:00:00Z");ps<cutoff;ps.setUTCDate(ps.getUTCDate()+7),wkn++){const pe=new Date(ps);pe.setUTCDate(pe.getUTCDate()+6);const due=new Date(ps);due.setUTCDate(due.getUTCDate()-1);await c.query(`INSERT INTO ${S}.rent_dues (assignment_id,rider_id,vehicle_id,week_no,period_start,period_end,due_date,amount) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,[a.id,a.rider_id,a.vehicle_id,wkn,iso(ps),iso(pe),iso(due),amt]);dues++;} }

  // totals
  const IST=`(now() AT TIME ZONE 'Asia/Kolkata')::date`;
  const PAID=`COALESCE((SELECT SUM(rp.amount_collected) FROM ${S}.rider_payments rp WHERE rp.rider_id=d.rider_id AND (rp.payment_date BETWEEN d.period_start AND d.period_end OR rp.rental_period_start BETWEEN d.period_start AND d.period_end)),0)`;
  const t=(await c.query(`WITH q AS (SELECT d.amount,d.period_start,${PAID} paid FROM ${S}.rent_dues d)
     SELECT coalesce(sum(amount) FILTER (WHERE period_start<${IST}),0) expected,
            coalesce(sum(least(paid,amount)),0) collected,
            coalesce(sum(amount-least(paid,amount)) FILTER (WHERE period_start<${IST} AND paid<amount),0) pending_before,
            coalesce(sum(amount-least(paid,amount)) FILTER (WHERE period_start=${IST} AND paid<amount),0) pending_today
     FROM q`)).rows[0];

  // per-rider payment diff vs snapshot
  const changes=[];
  const allRids=new Set([...curPay.keys(),...newPay.keys()]);
  for(const rid of allRids){ const before=curPay.get(rid)??new Set(); const after=newPay.get(rid)??new Set();
    const added=[...after].filter(x=>!before.has(x)); const removed=[...before].filter(x=>!after.has(x));
    if(added.length||removed.length){ const who=[...ridMap.values()].find(v=>v.id===rid); changes.push({name:who?.name?.trim()??rid, code:who?.code, add:added.length, rem:removed.length}); } }

  console.log(`\nrate fixes: ${rateFix} | payments rebuilt: ${pay} | dues: ${dues}`);
  console.log(`collected: ₹${beforeCollected.toLocaleString()}  ->  ₹${Number(t.collected).toLocaleString()}`);
  console.log(`expected(to date): ₹${Number(t.expected).toLocaleString()} | pending(due<06 Jul): ₹${Number(t.pending_before).toLocaleString()} | pending(due today): ₹${Number(t.pending_today).toLocaleString()}`);
  if(changes.length){ console.log(`\nRIDERS WITH PAYMENT CHANGES vs current DB (${changes.length}):`); changes.sort((a,b)=>b.add-a.add).forEach(x=>console.log(`  ${x.name} (${x.code}): +${x.add} paid${x.rem?`, -${x.rem} removed`:""}`)); }
  else console.log("\nNo payment changes vs current DB.");
  if(skipped.length){ console.log(`\n⛔ NOT SYNCED — need attention (${skipped.length}):`); skipped.forEach(s=>console.log("   "+s)); }

  if(DRY){await c.query("ROLLBACK");console.log("\n🔎 DRY RUN — rolled back. Nothing written.");}
  else{await c.query("COMMIT");console.log("\n✅ COMMITTED to "+S);}
  await c.end();
}
run().catch(e=>{console.error("❌",e.message);process.exit(1);});
