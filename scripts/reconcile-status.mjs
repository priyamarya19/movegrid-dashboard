// Reconcile rider/vehicle status to the invariant: a rider is 'active' iff they hold an
// active vehicle assignment; a vehicle is 'assigned' iff it has an active assignment.
// 'pending' riders (new, never allotted) are left untouched. DRY_RUN default.
import fs from "fs"; import pg from "pg";
const env=fs.readFileSync(".env.local","utf8").split("\n").reduce((a,l)=>{const[k,...v]=l.split("=");if(k&&k.trim())a[k.trim()]=v.join("=").trim();return a;},{});
const S=env.RDS_ENV==="uat"?"mg_data_uat":"mg_data";
const DRY=process.env.DRY_RUN!=="0";
const c=new pg.Client({host:env.RDS_HOST,port:+env.RDS_PORT,user:env.RDS_USER,password:env.RDS_PASSWORD,database:env.RDS_DATABASE,ssl:{rejectUnauthorized:false}});
const HAS_ACTIVE=`EXISTS (SELECT 1 FROM ${S}.rider_vehicle_assignments a WHERE a.rider_id=r.id AND a.status='active')`;

async function run(){
  await c.connect(); console.log(`\n== ${DRY?"DRY RUN":"APPLY"} on ${S} ==\n`);
  await c.query("BEGIN");
  try{
    // 1. inactive rider holding a vehicle -> active
    const toActive=(await c.query(`SELECT r.id,r.name,r.rider_code FROM ${S}.riders r WHERE r.status='inactive' AND ${HAS_ACTIVE}`)).rows;
    for(const r of toActive) await c.query(`UPDATE ${S}.riders SET status='active' WHERE id=$1`,[r.id]);
    console.log(`riders inactive->active (${toActive.length}):`); toActive.forEach(r=>console.log(`   ${r.name.trim()} (${r.rider_code})`));

    // 2. active rider with NO vehicle -> inactive (leave 'pending' alone)
    const toInactive=(await c.query(`SELECT r.id,r.name,r.rider_code FROM ${S}.riders r WHERE r.status='active' AND NOT ${HAS_ACTIVE}`)).rows;
    for(const r of toInactive) await c.query(`UPDATE ${S}.riders SET status='inactive' WHERE id=$1`,[r.id]);
    console.log(`riders active->inactive (${toInactive.length}):`); toInactive.forEach(r=>console.log(`   ${r.name.trim()} (${r.rider_code})`));

    // 3. vehicle 'assigned' with no active assignment -> returned
    const orphan=(await c.query(`SELECT v.id,v.ev_number FROM ${S}.vehicles v WHERE v.status='assigned' AND NOT EXISTS (SELECT 1 FROM ${S}.rider_vehicle_assignments a WHERE a.vehicle_id=v.id AND a.status='active')`)).rows;
    for(const v of orphan) await c.query(`UPDATE ${S}.vehicles SET status='returned' WHERE id=$1`,[v.id]);
    console.log(`vehicles assigned->returned (${orphan.length}):`); orphan.forEach(v=>console.log(`   ${v.ev_number}`));

    const n=async(q)=>(await c.query(q)).rows[0].n;
    console.log(`\nAFTER: active riders=${await n(`SELECT count(*)::int n FROM ${S}.riders WHERE status='active'`)} | deployed vehicles=${await n(`SELECT count(*)::int n FROM ${S}.vehicles WHERE status='assigned'`)} | active assignments=${await n(`SELECT count(*)::int n FROM ${S}.rider_vehicle_assignments WHERE status='active'`)} | pending=${await n(`SELECT count(*)::int n FROM ${S}.riders WHERE status='pending'`)}`);

    if(DRY){await c.query("ROLLBACK");console.log("\n🔎 DRY RUN — rolled back.");}
    else{await c.query("COMMIT");console.log("\n✅ COMMITTED to "+S);}
  }catch(e){await c.query("ROLLBACK");console.error("❌ ROLLBACK:",e.message);process.exit(1);}finally{await c.end();}
}
run();
