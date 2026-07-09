// Reconcile fleet state to the Allotment form + status model.
//  1. For each allotment row with no matching DB assignment, create it (active if it's the
//     rider's latest allotment and the vehicle wasn't submitted; else returned).
//  2. Migrate legacy vehicle status 'available' -> 'ready_to_deploy'.
//  3. Vehicle 'assigned' iff it has an active assignment.
//  4. Rider invariant: active iff holds an active assignment ('pending' left alone).
// DRY_RUN default; DRY_RUN=0 to commit.
import fs from "fs"; import pg from "pg";
const env=fs.readFileSync(".env.local","utf8").split("\n").reduce((a,l)=>{const[k,...v]=l.split("=");if(k&&k.trim())a[k.trim()]=v.join("=").trim();return a;},{});
const S=env.RDS_ENV==="uat"?"mg_data_uat":"mg_data";
const DRY=process.env.DRY_RUN!=="0";
const c=new pg.Client({host:env.RDS_HOST,port:+env.RDS_PORT,user:env.RDS_USER,password:env.RDS_PASSWORD,database:env.RDS_DATABASE,ssl:{rejectUnauthorized:false}});
const dg=s=>(s||"").replace(/\D/g,"");
const iso=dmy=>{const[d,m,y]=dmy.split("/");return `${y}-${m}-${d}`;};
const HUB="fc9f895e-92f4-4b8a-8630-63aea595f72b";

// vehicles submitted (mobile|ev) — from the Vehicle Submission form
const SUBMITTED=new Set(["6397101738|MG0426N0019","9559326761|MG0426N0012","7818823128|MG0426N0027","9927186055|MG0426N0028","9870164936|MG0426N0018","8433020233|MG0426N0036","9927186055|MG0426N0049","9548396560|MG0426N0023","7302165388|MG0426N0033","7818838273|MG0426N0013","7393872559|MG0426N0044","7982212139|MG0426N0036","8587971484|MG0426N0020","9958744242|MG0426N0041","8115387509|MG0426N0049","8766334246|MG0426N0045","9548396560|MG0426N0020","8750235022|MG0426N0039","8287755018|MG0426N0034","8193841808|MG0426N0022","7248826582|MG0426N0031","9560759578|MG0426N0036","7668390241|MG0426N0028","7451024910|MG0426N0050","7319845124|MG0426N0033","9355676982|MG0426N0041","9650905562|MG0426N0031","9568080124|MG0426N0039"]);

const rows=fs.readFileSync("scripts/allotments.csv","utf8").split("\n").slice(1).filter(l=>l.trim()).map(l=>{const[allot_date,name,mobile,ev,oem]=l.split(",");return{date:allot_date.trim(),name:name.trim(),mobile:dg(mobile),ev:ev.trim(),oem:oem.trim()};});
// latest allotment date per rider
const latest={}; for(const r of rows){ if(!latest[r.mobile]||iso(r.date)>iso(latest[r.mobile])) latest[r.mobile]=r.date; }

async function run(){
  await c.connect(); console.log(`\n== ${DRY?"DRY RUN":"APPLY"} on ${S} ==  (${rows.length} allotment rows)\n`);
  await c.query("BEGIN");
  try{
    const created=[], missingVeh=[], missingRider=[];
    for(const r of rows){
      const rid=(await c.query(`SELECT id FROM ${S}.riders WHERE regexp_replace(mobile,'\\D','','g')=$1 LIMIT 1`,[r.mobile])).rows[0]?.id;
      const vid=(await c.query(`SELECT id FROM ${S}.vehicles WHERE ev_number=$1`,[r.ev])).rows[0]?.id;
      if(!rid){missingRider.push(`${r.name} (${r.mobile})`);continue;}
      if(!vid){missingVeh.push(`${r.ev}`);continue;}
      const exists=(await c.query(`SELECT id FROM ${S}.rider_vehicle_assignments WHERE rider_id=$1 AND vehicle_id=$2 LIMIT 1`,[rid,vid])).rows[0];
      if(exists) continue;
      // missing -> create. active if it's the rider's latest allotment and not submitted.
      const isLatest = r.date===latest[r.mobile];
      const submitted = SUBMITTED.has(`${r.mobile}|${r.ev}`);
      const status = (isLatest && !submitted) ? "active" : "returned";
      // inherit the rider's actual rate (rent-sheet driven) from an existing assignment; else OEM default
      const inherited=(await c.query(`SELECT daily_rent FROM ${S}.rider_vehicle_assignments WHERE rider_id=$1 AND daily_rent IS NOT NULL ORDER BY assigned_date DESC LIMIT 1`,[rid])).rows[0]?.daily_rent;
      const rate = inherited ?? (r.oem==="NXTE" ? 260 : 240);
      // if creating an ACTIVE one, close any other active assignment for this rider + free its vehicle
      if(status==="active"){
        const others=(await c.query(`SELECT id,vehicle_id FROM ${S}.rider_vehicle_assignments WHERE rider_id=$1 AND status='active'`,[rid])).rows;
        for(const o of others){ await c.query(`UPDATE ${S}.rider_vehicle_assignments SET status='returned', returned_date=CURRENT_DATE WHERE id=$1`,[o.id]); if(o.vehicle_id!==vid) await c.query(`UPDATE ${S}.vehicles SET status='returned' WHERE id=$1`,[o.vehicle_id]); }
      }
      await c.query(`INSERT INTO ${S}.rider_vehicle_assignments (rider_id,vehicle_id,hub_id,assigned_date,status,daily_rent,returned_date,allotted_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'Reconcile')`,[rid,vid,HUB,iso(r.date),status,rate, status==="returned"?iso(r.date):null]);
      created.push(`${r.name} -> ${r.ev} @ ${r.date} [${status}]`);
    }

    // 2. legacy 'available' -> 'ready_to_deploy'
    const avail=(await c.query(`UPDATE ${S}.vehicles SET status='ready_to_deploy' WHERE status='available' RETURNING ev_number`)).rows.map(x=>x.ev_number);
    // 3. vehicle 'assigned' iff active assignment
    const vFixed=(await c.query(`UPDATE ${S}.vehicles v SET status='assigned' WHERE EXISTS (SELECT 1 FROM ${S}.rider_vehicle_assignments a WHERE a.vehicle_id=v.id AND a.status='active') AND v.status<>'assigned' RETURNING ev_number`)).rows.map(x=>x.ev_number);
    // 4. rider invariant
    const rAct=(await c.query(`UPDATE ${S}.riders r SET status='active' WHERE status='inactive' AND EXISTS (SELECT 1 FROM ${S}.rider_vehicle_assignments a WHERE a.rider_id=r.id AND a.status='active') RETURNING rider_code`)).rows.map(x=>x.rider_code);
    const rIn=(await c.query(`UPDATE ${S}.riders r SET status='inactive' WHERE status='active' AND NOT EXISTS (SELECT 1 FROM ${S}.rider_vehicle_assignments a WHERE a.rider_id=r.id AND a.status='active') RETURNING rider_code`)).rows.map(x=>x.rider_code);

    console.log(`assignments CREATED (${created.length}):`); created.forEach(x=>console.log("   "+x));
    if(missingRider.length) console.log("no rider for:", missingRider.join(", "));
    if(missingVeh.length) console.log("no vehicle for:", missingVeh.join(", "));
    console.log(`\navailable->ready_to_deploy: ${avail.join(", ")||"none"}`);
    console.log(`vehicle ->assigned (had active assignment): ${vFixed.join(", ")||"none"}`);
    console.log(`rider inactive->active: ${rAct.join(", ")||"none"} | active->inactive: ${rIn.join(", ")||"none"}`);
    const n=async(q)=>(await c.query(q)).rows[0].n;
    console.log(`\nvehicle status:`, JSON.stringify((await c.query(`SELECT status,count(*)::int n FROM ${S}.vehicles GROUP BY status ORDER BY n DESC`)).rows));
    console.log(`AFTER: active riders=${await n(`SELECT count(*)::int n FROM ${S}.riders WHERE status='active'`)} | deployed=${await n(`SELECT count(*)::int n FROM ${S}.vehicles WHERE status='assigned'`)} | active assignments=${await n(`SELECT count(*)::int n FROM ${S}.rider_vehicle_assignments WHERE status='active'`)} | ready_to_deploy=${await n(`SELECT count(*)::int n FROM ${S}.vehicles WHERE status='ready_to_deploy'`)}`);

    if(DRY){await c.query("ROLLBACK");console.log("\n🔎 DRY RUN — rolled back.");}
    else{await c.query("COMMIT");console.log("\n✅ COMMITTED to "+S);}
  }catch(e){await c.query("ROLLBACK");console.error("❌ ROLLBACK:",e.message);process.exit(1);}finally{await c.end();}
}
run();
