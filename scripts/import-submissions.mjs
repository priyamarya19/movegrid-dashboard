// Create rider_penalties + import Vehicle Submission form data.
//  - return metadata (remarks/condition/rent_cleared/returned_by/exact date) -> onto RETURNED assignments
//  - penalties (full string) -> rider_penalties, linked to the submitted vehicle + assignment + rider
// Active-assignment matches (exchange/re-allotment conflicts) are reported, not overwritten.
// DRY_RUN default; DRY_RUN=0 to commit.
import fs from "fs"; import pg from "pg";
const env=fs.readFileSync(".env.local","utf8").split("\n").reduce((a,l)=>{const[k,...v]=l.split("=");if(k&&k.trim())a[k.trim()]=v.join("=").trim();return a;},{});
const S=env.RDS_ENV==="uat"?"mg_data_uat":"mg_data";
const DRY=process.env.DRY_RUN!=="0";
const c=new pg.Client({host:env.RDS_HOST,port:+env.RDS_PORT,user:env.RDS_USER,password:env.RDS_PASSWORD,database:env.RDS_DATABASE,ssl:{rejectUnauthorized:false}});
const dg=s=>(s||"").replace(/\D/g,"");
const iso=dmy=>{const[d,m,y]=dmy.split("/");return `${y}-${m}-${d}`;};
const isZero=s=>{const t=(s||"").trim().toLowerCase();return t===""||/^0+$/.test(t)||t==="o"||t==="no";};
const penAmt=s=>{ if(isZero(s))return 0; if(s.includes("=")){const n=parseInt(s.split("=").pop().replace(/\D/g,""));return isNaN(n)?null:n;} const nums=(s.match(/\d+/g)||[]).map(Number); return nums.length?nums.reduce((a,b)=>a+b,0):null; };
const rc=s=>{const t=(s||"").trim().toLowerCase();return t==="yes"?true:t==="no"?false:null;};

// [name, mobile, allotDate, ev, rentPaid, penalty, condition, subDate, remarks, by]
const R=[
["Vipul Anand","6397101738","05/05/2026","MG0426N0019","No","00","Same as allotted","14/05/2026","Rent issue","Ajay"],
["Shiva Sharma","9559326761","03/05/2026","MG0426N0012","No","510","Same as allotted","19/05/2026","Mother's health is ruined, he has gone home, then he will take the scooter again.","Amit"],
["Aas mohammad","7818823128","30/04/2026","MG0426N0027","Yes","200","Same as allotted","22/05/2026","New Bike purchase","Amit"],
["Bharat Singh","9927186055","05/05/2026","MG0426N0028","Yes","Brake Lever, mirror LH","Any other issue","25/05/2026","Ghar se wapas aa kr lega","Amit"],
["Abhishek","9870164936","06/05/2026","MG0426N0018","Yes","2500","Any other issue","30/05/2026","head cover, meter cover, foot board, rear body parts LH, lower side strip RH, T band","Amit"],
["Pawan","8433020233","25/05/2026","MG0426N0036","Yes","0","Same as allotted, Branding issue","09/06/2026","Battery box welding","Amit"],
["Bharat Singh","9927186055","02/06/2026","MG0426N0049","Yes","O","Same as allotted","09/06/2026","Ghar gaya aayega to lega","Amit"],
["Rahul Kumar","9548396560","06/05/2026","MG0426N0023","Yes","200","Same as allotted","11/06/2026","Ghar gaya hai wapas aake lega scooty","Amit"],
["Sanjay Yadav","7302165388","23/05/2026","MG0426N0033","No","920","Same as allotted","11/06/2026","Hard recovery","Amit"],
["Harshit yadav","7818838273","04/05/2026","MG0426N0013","No","3220+2030=5250","Any other issue","11/06/2026","Meter cover, key with lock, rear Mudguard, front Mudguard, meter","Amit"],
["Aman Pratap","7393872559","01/06/2026","MG0426N0044","Yes","1200","Same as allotted, Any other issue","15/06/2026","Head light mirror and extra battery swap charges","Amit"],
["Kunal Singh","7982212139","10/06/2026","MG0426N0036","Yes","1650","Same as allotted, Any other issue","16/06/2026","Front fender, handle T band, rear brake cable","Amit"],
["Altaf","8587971484","27/04/2026","MG0426N0020","Yes","800","Branding issue, Any other issue","17/06/2026","Front mudguard, handle T band, MCB","Amit"],
["Gopal jha","9958744242","29/05/2026","MG0426N0041","Yes","0","Same as allotted, Branding issue","17/06/2026","No","Amit"],
["Dhanvir","8115387509","09/06/2026","MG0426N0049","Yes","0","Same as allotted","19/06/2026","2 day rent pending","Amit"],
["Sanjay Kumar 01","8766334246","01/06/2026","MG0426N0045","Yes","0","Same as allotted","22/06/2026","0","Amit"],
["Rahul Kumar","9548396560","18/06/2026","MG0426N0020","Yes","0","Same as allotted","19/06/2026","No","Amit"],
["Anoj Kumar","8750235022","25/05/2026","MG0426N0039","No","250+1680","Same as allotted, Branding issue","23/06/2026","Recovery","Amit"],
["Ashok Kumar mahto","8287755018","23/05/2026","MG0426N0034","Yes","450","Any other issue","24/06/2026","Handle T nut broken","Amit"],
["Lakiraj","8193841808","06/05/2026","MG0426N0022","No","6380","Any other issue","26/06/2026","Front fender, tool box, foot board, side strip RH, rear side panel RH, head cover, meter cover, handle T band","Amit"],
["Gajendra Yadav","7248826582","23/05/2026","MG0426N0031","No","3320","Any other issue","26/06/2026","Battery box damage, rear inner cover, front fender, handle T band","Amit"],
["Rithik Kumar","9560759578","17/06/2026","MG0426N0036","Yes","0","Same as allotted","27/06/2026","No","Amit"],
["Prem Singh","7668390241","25/05/2026","MG0426N0028","Yes"," ","Same as allotted, Any other issue","27/06/2026","Front mudguard","Amit"],
["Mohan","7451024910","03/06/2026","MG0426N0050","No","No","Same as allotted","29/06/2026","1 week Rent pending","Amit"],
["Md Barik","7319845124","11/06/2026","MG0426N0033","Yes","350","Controller issue","30/06/2026","Controller not working","Amit"],
["Mohd Sakib","9355676982","18/06/2026","MG0426N0041","Yes","00","Same as allotted","02/07/2026","damage amount received","Ajay"],
["Himanshu Shekhar","9650905562","01/07/2026","MG0426N0031","Yes","00","Any other issue","04/07/2026","chassis damage","Ajay"],
["Mohammad Ali","9568080124","23/06/2026","MG0426N0039","No","2500+300=2800","Any other issue","07/07/2026","Main dask, Head light mirror, Head light decoration, tool box","Amit"],
];

async function run(){
  await c.connect(); console.log(`\n== ${DRY?"DRY RUN":"APPLY"} on ${S} ==  (${R.length} submission rows)\n`);
  await c.query("BEGIN");
  try{
    await c.query(`CREATE TABLE IF NOT EXISTS ${S}.rider_penalties (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      rider_id uuid NOT NULL REFERENCES ${S}.riders(id) ON DELETE CASCADE,
      vehicle_id uuid REFERENCES ${S}.vehicles(id),
      assignment_id uuid REFERENCES ${S}.rider_vehicle_assignments(id),
      amount numeric, detail text,
      status text NOT NULL DEFAULT 'pending',
      created_by text, created_at timestamptz DEFAULT now())`);
    console.log("✓ rider_penalties table ready");
    // fresh backfill: clear prior imported penalties so re-runs are idempotent
    await c.query(`DELETE FROM ${S}.rider_penalties WHERE created_by IN ('Amit','Ajay')`);

    let meta=0, pen=0; const conflicts=[], unmatched=[];
    for(const [name,mob,allot,ev,rentPaid,penalty,cond,sub,remarks,by] of R){
      const vid=(await c.query(`SELECT id FROM ${S}.vehicles WHERE ev_number=$1`,[ev])).rows[0]?.id;
      let rid=(await c.query(`SELECT id FROM ${S}.riders WHERE regexp_replace(mobile,'\\D','','g')=$1`,[dg(mob)])).rows[0]?.id;
      // match the assignment by rider+vehicle nearest the allot date; fall back to vehicle+date if mobile typo
      let a;
      if(rid&&vid) a=(await c.query(`SELECT id,status,to_char(assigned_date,'YYYY-MM-DD') ad FROM ${S}.rider_vehicle_assignments WHERE rider_id=$1 AND vehicle_id=$2 ORDER BY abs(assigned_date-$3::date) LIMIT 1`,[rid,vid,iso(allot)])).rows[0];
      if(!a&&vid){ a=(await c.query(`SELECT id,rider_id,status,to_char(assigned_date,'YYYY-MM-DD') ad FROM ${S}.rider_vehicle_assignments WHERE vehicle_id=$1 ORDER BY abs(assigned_date-$2::date) LIMIT 1`,[vid,iso(allot)])).rows[0]; if(a) rid=a.rider_id; }
      if(!a){ unmatched.push(`${name} (${mob}) ${ev} @ ${allot}`); continue; }

      // return metadata — only onto already-returned assignments (don't flip active/exchange rows)
      if(a.status==="returned"){
        const condArr = cond ? cond.split(",").map(s=>s.trim()).filter(Boolean) : null;
        await c.query(`UPDATE ${S}.rider_vehicle_assignments SET return_remarks=$1, condition_on_return=$2, rent_cleared=$3, returned_by=$4, returned_date=$5 WHERE id=$6`,
          [remarks||null, condArr, rc(rentPaid), by, iso(sub), a.id]); meta++;
      } else conflicts.push(`${name} ${ev}: submission says returned ${sub}, but DB assignment is '${a.status}' (likely exchange/re-allotment) — metadata skipped`);

      // penalty -> rider_penalties (skip pure-zero)
      if(!isZero(penalty) && penalty.trim()!==""){
        await c.query(`INSERT INTO ${S}.rider_penalties (rider_id,vehicle_id,assignment_id,amount,detail,status,created_by,created_at)
          VALUES ($1,$2,$3,$4,$5,'pending',$6,$7)`,[rid,vid,a.id,penAmt(penalty),penalty.trim(),by,iso(sub)]); pen++;
      }
    }
    console.log(`return-metadata set: ${meta} | penalties inserted: ${pen}`);
    const tot=(await c.query(`SELECT count(*)::int n, coalesce(sum(amount),0) s FROM ${S}.rider_penalties`)).rows[0];
    console.log(`rider_penalties: ${tot.n} rows, ₹${Number(tot.s).toLocaleString()} numeric total`);
    const sample=(await c.query(`SELECT r.name, p.detail, p.amount FROM ${S}.rider_penalties p JOIN ${S}.riders r ON r.id=p.rider_id ORDER BY p.amount DESC NULLS LAST LIMIT 6`)).rows;
    console.log("top penalties:"); sample.forEach(x=>console.log(`   ${x.name.trim()}: "${x.detail}" ${x.amount?`(₹${x.amount})`:"(text)"}`));
    if(conflicts.length){ console.log(`\n⚠️ status conflicts (metadata skipped, penalty still recorded): ${conflicts.length}`); conflicts.forEach(x=>console.log("   "+x)); }
    if(unmatched.length){ console.log(`\n⛔ unmatched submission rows: ${unmatched.length}`); unmatched.forEach(x=>console.log("   "+x)); }

    if(DRY){await c.query("ROLLBACK");console.log("\n🔎 DRY RUN — rolled back.");}
    else{await c.query("COMMIT");console.log("\n✅ COMMITTED to "+S);}
  }catch(e){await c.query("ROLLBACK");console.error("❌ ROLLBACK:",e.message);process.exit(1);}finally{await c.end();}
}
run();
