// Onboard the 3 riders the rent sheet references but the DB is missing:
// Sumit Singh 01 (rider exists, no vehicle), Vivek + Karan (new). Source: KYC + Allotment forms.
// Creates 3 NXTE vehicles + 2 riders + 3 assignments. DRY_RUN default; DRY_RUN=0 to commit.
import fs from "fs"; import pg from "pg";
const env=fs.readFileSync(".env.local","utf8").split("\n").reduce((a,l)=>{const[k,...v]=l.split("=");if(k&&k.trim())a[k.trim()]=v.join("=").trim();return a;},{});
const S=env.RDS_ENV==="uat"?"mg_data_uat":"mg_data";
const DRY=process.env.DRY_RUN!=="0";
const c=new pg.Client({host:env.RDS_HOST,port:+env.RDS_PORT,user:env.RDS_USER,password:env.RDS_PASSWORD,database:env.RDS_DATABASE,ssl:{rejectUnauthorized:false}});
const dg=s=>(s||"").replace(/\D/g,"");
const NXTE="9b5ed602-97ff-4556-8167-373e020778b0", HUB="fc9f895e-92f4-4b8a-8630-63aea595f72b";

const vehicles=[
 {ev:"MG0426N0057",ch:"NXTMOB202511V6217",mo:"48V1000W2025010154",co:"NXT604872VC040133",bat:"ML3AJCLNDA00109",imei:null},
 {ev:"MG0426N0062",ch:"NXTMOB202511V6189",mo:"NXTBA202511M6159",co:"NXTE-C3",bat:"ML3AJRHODA00663",imei:null},
 {ev:"MG0426N0052",ch:"NXTMOB202511V6274",mo:"NXTBA202511M6542",co:"ADCSYSL250823988",bat:"ML3AJ8AODA00770",imei:"866221070721209"},
];
// new riders (Sumit Singh 01 already exists — only needs a vehicle+assignment)
const newRiders=[
 {name:"Vivek",mob:"8376046069",addr:"Gali number 7 Mohanlal ke dukhan Parthala sector 122 Noida",map:"https://maps.app.goo.gl/hDYGMb227JraUGJD7?g_st=ac",
  frn:"Neelam (mother)",frm:"9654887160",lrn:"Suresh",lrm:"7458086652",
  af:"https://drive.google.com/open?id=1prdvlH2jJ_DW4AzyuNgug_co4hMLpu-O",ab:"https://drive.google.com/open?id=1Ruuw2dlv_WP9uVhVT0smEEQ2wRHUkL4D",
  pan:"https://drive.google.com/open?id=16fWvqZLWVpsZBhNsDaXaLmUidZx3YD4Z",bank:"https://drive.google.com/open?id=1rMVSmpLmL5lXTNQeLvi1OrFBwJ0ZLEov",
  faad:"https://drive.google.com/open?id=1zomhp2__Xuu9kjdGpJ0ViiIzH_PX7huR"},
 {name:"Karan",mob:"7834801278",addr:"Chhajarsi Sector 63 Noida",map:"https://maps.google.com/maps?q=JCF2%2BJ86",
  frn:"Aram Singh",frm:"8057745682",lrn:"Rinku (bhai)",lrm:"9354323049",
  af:"https://drive.google.com/open?id=1ahrHUF73TUiQiQFBJU44k4NuAhUqvkEQ",ab:"https://drive.google.com/open?id=1cQ2-qav25IIdLgtrZk8lRCZfbSIbMXtR",
  pan:"https://drive.google.com/open?id=1hVMHm81xkl5Vm0xdYDtAlEsD-Fk8W4e3",bank:"https://drive.google.com/open?id=1pZw9W9dpyW-14zICcXTBev4QT4tFmgCA",
  faad:"https://drive.google.com/open?id=1tcG9afFKBtZlB9y8hx7dIMt7SVdGd6bQ"},
];
const assignments=[
 {mob:"7835935604",ev:"MG0426N0057",date:"2026-07-06",by:"Amit",amt:3320},
 {mob:"8376046069",ev:"MG0426N0062",date:"2026-07-07",by:"Amit",amt:3320},
 {mob:"7834801278",ev:"MG0426N0052",date:"2026-07-07",by:"Amit",amt:3320},
];

async function run(){
  await c.connect(); console.log(`\n== ${DRY?"DRY RUN":"APPLY"} on ${S} ==\n`);
  await c.query("BEGIN");
  try{
    let vAdd=0,rAdd=0,aAdd=0;
    for(const v of vehicles){
      const ex=(await c.query(`SELECT id FROM ${S}.vehicles WHERE ev_number=$1`,[v.ev])).rows[0];
      if(ex){console.log(`vehicle ${v.ev} exists — skip`);continue;}
      await c.query(`INSERT INTO ${S}.vehicles (ev_number,chassis_number,motor_number,controller_number,battery_number,battery_partner,iot_imei,iot_partner,model_id,hub_id,status)
        VALUES ($1,$2,$3,$4,$5,'Mooving',$6,'Fixx ev/Loconav',$7,$8,'assigned')`,[v.ev,v.ch,v.mo,v.co,v.bat,v.imei,NXTE,HUB]); vAdd++;
    }
    let next=(await c.query(`SELECT COALESCE(MAX(CAST(SUBSTRING(rider_code FROM 3) AS INT)),0) m FROM ${S}.riders`)).rows[0].m;
    for(const r of newRiders){
      const ex=(await c.query(`SELECT id FROM ${S}.riders WHERE regexp_replace(mobile,'\\D','','g')=$1`,[dg(r.mob)])).rows[0];
      if(ex){console.log(`rider ${r.name} exists — skip`);continue;}
      const code="MG"+String(++next).padStart(6,"0");
      await c.query(`INSERT INTO ${S}.riders (rider_code,name,mobile,current_address,address_map_link,family_ref_name,family_ref_mobile,local_ref_name,local_ref_mobile,
        aadhaar_front_url,aadhaar_back_url,pan_image_url,bank_doc_url,family_ref_aadhaar_url,rental_mode,business_type,assigned_hub_id,status,created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'weekly','rental',$15,'active','Ajay')`,
        [code,r.name,r.mob,r.addr,r.map,r.frn,r.frm,r.lrn,r.lrm,r.af,r.ab,r.pan,r.bank,r.faad,HUB]); rAdd++;
      console.log(`  rider ${r.name} -> ${code}`);
    }
    for(const a of assignments){
      const rid=(await c.query(`SELECT id FROM ${S}.riders WHERE regexp_replace(mobile,'\\D','','g')=$1`,[dg(a.mob)])).rows[0]?.id;
      const vid=(await c.query(`SELECT id FROM ${S}.vehicles WHERE ev_number=$1`,[a.ev])).rows[0]?.id;
      if(!rid||!vid){console.log(`⚠️ assignment ${a.mob}/${a.ev}: rid=${!!rid} vid=${!!vid} — skip`);continue;}
      const dup=(await c.query(`SELECT id FROM ${S}.rider_vehicle_assignments WHERE rider_id=$1 AND vehicle_id=$2 AND assigned_date=$3`,[rid,vid,a.date])).rows[0];
      if(dup){console.log(`assignment ${a.mob}/${a.ev} exists — skip`);continue;}
      await c.query(`INSERT INTO ${S}.rider_vehicle_assignments (rider_id,vehicle_id,hub_id,assigned_date,status,daily_rent,amount_collected,allotted_by)
        VALUES ($1,$2,$3,$4,'active',260,$5,$6)`,[rid,vid,HUB,a.date,a.amt,a.by]); aAdd++;
      await c.query(`UPDATE ${S}.vehicles SET status='assigned' WHERE id=$1`,[vid]);
      await c.query(`UPDATE ${S}.riders SET status='active' WHERE id=$1`,[rid]);
    }
    console.log(`\nvehicles added: ${vAdd} | riders added: ${rAdd} | assignments added: ${aAdd}`);
    console.log("totals now:", JSON.stringify((await c.query(`SELECT (SELECT count(*)::int FROM ${S}.vehicles) v,(SELECT count(*)::int FROM ${S}.riders) r,(SELECT count(*)::int FROM ${S}.rider_vehicle_assignments) a`)).rows[0]));
    const chk=(await c.query(`SELECT r.name,r.rider_code,v.ev_number,to_char(a.assigned_date,'YYYY-MM-DD') d,a.daily_rent FROM ${S}.rider_vehicle_assignments a JOIN ${S}.riders r ON r.id=a.rider_id JOIN ${S}.vehicles v ON v.id=a.vehicle_id WHERE a.assigned_date>='2026-07-06' ORDER BY a.assigned_date`)).rows;
    console.log("July-06+ assignments:"); chk.forEach(x=>console.log(`  ${x.name.trim()} (${x.rider_code}) → ${x.ev_number} @ ${x.d} ₹${x.daily_rent}/day`));
    if(DRY){await c.query("ROLLBACK");console.log("\n🔎 DRY RUN — rolled back.");}
    else{await c.query("COMMIT");console.log("\n✅ COMMITTED to "+S);}
  }catch(e){await c.query("ROLLBACK");console.error("❌ ROLLBACK:",e.message);process.exit(1);}finally{await c.end();}
}
run();
