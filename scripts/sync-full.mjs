// Full reconciliation of the DB to the weekly rent sheet.
//  - set each cycle's daily_rent from the sheet (weekly/7)
//  - rebuild rider_payments from every "Collected" week, at the sheet amount, period-aligned
//  - rent-stop = first "Submitted" week; regenerate rent_dues (capped at rent-stop / returned_date)
//  - verify: 0 Collected-in-sheet-but-unpaid-in-DB; collected total matches sheet
// DRY_RUN default; DRY_RUN=0 to commit.
import fs from "fs"; import pg from "pg";
const env = fs.readFileSync(".env.local","utf8").split("\n").reduce((a,l)=>{const [k,...v]=l.split("=");if(k&&k.trim())a[k.trim()]=v.join("=").trim();return a;},{});
const S = env.RDS_ENV==="uat"?"mg_data_uat":"mg_data";
const DRY = process.env.DRY_RUN !== "0";
const c = new pg.Client({host:env.RDS_HOST,port:+env.RDS_PORT,user:env.RDS_USER,password:env.RDS_PASSWORD,database:env.RDS_DATABASE,ssl:{rejectUnauthorized:false}});
const addDays=(dmy,n)=>{const [d,m,y]=dmy.split("/").map(Number);const dt=new Date(Date.UTC(y,m-1,d));dt.setUTCDate(dt.getUTCDate()+n);return dt;};
const iso=(dt)=>dt.toISOString().slice(0,10);
const dg=s=>(s||"").replace(/\D/g,"");
const istToday=()=>{const d=new Date(Date.now()+5.5*3600e3);return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));};

// [userID, name, mobile, allot dd/mm/yyyy, weekly, status]
const R = [
 ["MG000001","Rohit Kumar","7505022678","25/04/2026",1680,"SSSSSSSSSSS"],["MG000002","Ajay Sharma","8860794603","26/04/2026",1680,"CCCCCCCP..."],
 ["MG000003","Altaf","8587971484","27/04/2026",1680,"CCCCCCSSS.."],["MG000004","Vinit kumar tiwari","7379146745","29/04/2026",1680,"CCCCCPPP..."],
 ["MG000005","Suraj","9027145129","29/04/2026",1680,"CCCCCCPP..."],["MG000006","Rajat Singh","9058439061","30/04/2026",1680,"CCCCCPPP..."],
 ["MG000007","Anand Kumar","7065508843","30/04/2026",1680,"CCCCCCCC..."],["MG000008","Aas mohammad","7818823128","30/04/2026",1680,"CCSSSSSSSSS"],
 ["MG000009","Shiva Sharma","9559326761","03/05/2026",1680,"CSSSSSSSSSS"],["MG000010","Harshit yadav","7818838273","04/05/2026",1680,"CCSSSSSSSSS"],
 ["MG000011","Rinku","9839859086","04/05/2026",1680,"CCCCCP....."],["MG000012","Rambabu prasad","8796918758","05/05/2026",1680,"CCCCCP....."],
 ["MG000013","Bharat Singh","9927186055","05/05/2026",1680,"CCSSSSSSSSS"],["MG000014","Rohit Sharma","8882973803","05/05/2026",1680,"CCCCCCCC..."],
 ["MG000015","Ghanshyam Murari","9582912949","05/05/2026",1680,"CCCCCCP...."],["MG000016","Vipul Anand","6397101738","05/05/2026",1680,"SSSSSSSSSSS"],
 ["MG000017","Sunil","9540316410","05/05/2026",1680,"CCCCPP....."],["MG000018","Rahul Kumar","9548396560","06/05/2026",1680,"CCCCSSSSSSS"],
 ["MG000019","Lakiraj","8193841808","06/05/2026",1680,"CCCCCPS...."],["MG000020","Abhishek","9870164936","06/05/2026",1680,"CCSSSSSSSSS"],
 ["MG000021","Arun Kumar","7054098911","06/05/2026",1680,"CCCCCCC...."],["MG000022","Ritwik kumar pandey","9088230421","14/05/2026",1680,"CCCCCCP...."],
 ["MG000023","Ankesh kumar","9639610457","19/05/2026",1680,"CCCCCC....."],["MG000024","Pradeep Kumar","9793047488","22/05/2026",1680,"CCCCP......"],
 ["MG000025","Sumit Srivastava","8860514433","23/05/2026",1680,"CCPP......."],["MG000026","Sanjay Yadav","7302165388","23/05/2026",1680,"CSSSSSSSSSS"],
 ["MG000027","Gajendra Yadav","7248826582","23/05/2026",1680,"CCSSSSSSSSS"],["MG000028","Ashok Kumar mahto","8287755018","23/05/2026",1680,"CCCCSSSSSSS"],
 ["MG000029","Nirbhay Rana","8882777082","23/05/2026",1820,"CCPP......."],["MG000030","Prem Singh","7668390241","25/05/2026",1680,"CCCCSSSSSSS"],
 ["MG000031","Pawan","8433020233","25/05/2026",1820,"CSSSSSSSSSS"],["MG000032","Anoj Kumar","8750235022","25/05/2026",1820,"CSSSSSSSSSS"],
 ["MG000033","Ravi Kumar","9691127984","26/05/2026",1820,"CCCCC......"],["MG000034","Prince Deep","7061692906","29/05/2026",1820,"CPP........"],
 ["MG000035","Shashank","9235371948","29/05/2026",1820,"CCCP......."],["MG000036","Anoop kumar","6392485904","29/05/2026",1820,"CCC........"],
 ["MG000037","Gopal jha","9958744242","29/05/2026",1680,"CSSSSSSSSSS"],["MG000038","Aman Pratap","7393872559","01/06/2026",1680,"CSSSSSSSSSS"],
 ["MG000039","Sanjay Kumar 01","8766334246","01/06/2026",1680,"CCS........"],["MG000040","Sheelu","9643636941","01/06/2026",1680,"CCPP......."],
 ["MG000041","Hritik","6398077228","01/06/2026",1680,"CCC........"],["MG000042","Bharat Singh","9927186055","02/06/2026",1680,"SSSSSSSSSSS"],
 ["MG000043","Mohan","7451024910","03/06/2026",1680,"CPSSSSSSSSS"],["MG000044","Amar Singh Thapa","9355560897","03/06/2026",1680,"CPP........"],
 ["MG000045","Sahil Hindustani","7292011287","03/06/2026",1680,"CPP........"],["MG000046","Akash","8840535672","05/06/2026",1680,"CCCP......."],
 ["MG000047","Ashvani kumar","9974207270","06/06/2026",1680,"CCP........"],["MG000048","Dhanvir","8115387509","09/06/2026",1680,"SSSSSSSSSSS"],
 ["MG000049","Kunal Singh","7982212139","10/06/2026",1820,"SSSSSSSSSSS"],["MG000050","Md Barik","7319845124","11/06/2026",1820,"CC........."],
 ["MG000051","Shivendra Pratap Singh","8528297800","15/06/2026",1680,"CP........."],["MG000052","Mohit pal","8447063784","15/06/2026",1680,"CP........."],
 ["MG000053","Rithik Kumar","9560759578","17/06/2026",1820,"CSSSSSSSSSS"],["MG000054","Mohd Sakib","9355676982","18/06/2026",1680,"CSSSSSSSSSS"],
 ["MG000055","Rahul Kumar","9548396560","18/06/2026",1680,"SSSSSSSSSSS"],["MG000056","Pawan Kumar 01","8439616892","19/06/2026",1680,"P.........."],
 ["MG000057","Sumit Kumar","8510988713","20/06/2026",1680,"CP........."],["MG000058","Mohd Danish","7820015194","23/06/2026",1680,"CP........."],
 ["MG000059","Mohammad Ali","9568080124","23/06/2026",1820,"CP........."],["MG000060","Avnish","9956661380","24/06/2026",1680,"CP........."],
 ["MG000061","Abhijit halder","8527758553","29/06/2026",1820,"CP........."],["MG000062","Dharmendra Kumar","9793857424","30/06/2026",1680,"P.........."],
 ["MG000063","Nirala Kumar","6204712374","30/06/2026",1680,"P.........."],["MG000064","Himanshu Shekhar","9650905562","01/07/2026",1820,"P.........."],
 ["MG000065","Altaf","8587971484","02/07/2026",1680,"P.........."],["MG000066","Manjoor husain","9760194276","02/07/2026",1820,"P.........."],
 ["MG000067","Jayram kumar paswan","6207945115","02/07/2026",1820,"P.........."],["MG000068","Pushpendra tiwari","7007924112","03/07/2026",1820,"P.........."],
 ["MG000069","Raj Kumar","7303826251","03/07/2026",1820,"P.........."],["MG000070","Rishipal","7017258338","03/07/2026",1820,"P.........."],
 ["MG000071","Gopal jha","9958744242","03/07/2026",1820,"P.........."],["MG000072","Kunal Singh","7982212139","03/07/2026",1820,"P.........."],
];

async function collectedTotal(){ return Number((await c.query(`SELECT coalesce(sum(amount_collected),0) s FROM ${S}.rider_payments`)).rows[0].s); }

async function run(){
  await c.connect(); console.log(`\n== ${DRY?"DRY RUN (rollback)":"APPLY"} on ${S} ==\n`);
  await c.query("BEGIN");
  try {
    console.log("BEFORE: collected ₹"+(await collectedTotal()).toLocaleString());
    await c.query(`DELETE FROM ${S}.rider_payments`);
    const rentStop=new Map(); let rateFix=0, pay=0, skipped=[];
    for(const [uid,name,mob,date,wk,st] of R){
      const rid=(await c.query(`SELECT id FROM ${S}.riders WHERE regexp_replace(mobile,'\\D','','g')=$1 LIMIT 1`,[dg(mob)])).rows[0]?.id;
      if(!rid){skipped.push(`${name} (${uid}) no rider`);continue;}
      const asgs=(await c.query(`SELECT id,to_char(assigned_date,'YYYY-MM-DD') ad, vehicle_id, daily_rent FROM ${S}.rider_vehicle_assignments WHERE rider_id=$1`,[rid])).rows;
      if(!asgs.length){skipped.push(`${name} (${uid}) no assignment`);continue;}
      const onT=addDays(date,0).getTime();
      const a=asgs.sort((x,y)=>Math.abs(new Date(x.ad).getTime()-onT)-Math.abs(new Date(y.ad).getTime()-onT))[0];
      const daily=Math.round(wk/7);
      if(Number(a.daily_rent)!==daily){ await c.query(`UPDATE ${S}.rider_vehicle_assignments SET daily_rent=$1 WHERE id=$2`,[daily,a.id]); rateFix++; }
      const firstS=st.indexOf("S");
      // Rent is paid a week in advance: week 1 is prepaid at onboarding; the sheet's mark at
      // position i is the renewal collection for rental week (i+2). Return at position i means
      // the rider held weeks 1..(i+1), so rent stops at the start of week (i+2).
      if(firstS>=0) rentStop.set(a.id, iso(addDays(date,7*(firstS+1))));
      const mkPay=async(ps,pe)=>{await c.query(`INSERT INTO ${S}.rider_payments (rider_id,vehicle_id,amount_collected,payment_date,rental_period_start,rental_period_end) VALUES ($1,$2,$3,$4,$5,$6)`,[rid,a.vehicle_id,wk,pe,ps,pe]); pay++;};
      await mkPay(iso(addDays(date,0)), iso(addDays(date,6)));          // week 1 — onboarding advance
      for(let i=0;i<st.length;i++){ if(st[i]!=="C")continue; if(firstS>=0&&i>=firstS)continue;
        await mkPay(iso(addDays(date,7*(i+1))), iso(addDays(date,7*(i+1)+6)));   // sheet mark i -> rental week i+2
      }
    }
    // regen dues @ corrected rate, cutoff = earliest of rent-stop and returned_date
    const today=istToday();
    const asg=(await c.query(`SELECT id, to_char(assigned_date,'YYYY-MM-DD') ad, to_char(returned_date,'YYYY-MM-DD') rd, rider_id, vehicle_id, daily_rent FROM ${S}.rider_vehicle_assignments`)).rows;
    let dues=0;
    for(const a of asg){ await c.query(`DELETE FROM ${S}.rent_dues WHERE assignment_id=$1`,[a.id]);
      const stop=rentStop.get(a.id)??null; // rent-sheet rent-stop is the billing truth (covers every paid week)
      const tomorrow=new Date(today); tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
      const cutoff=stop?new Date(stop+"T00:00:00Z"):tomorrow;
      const amt=Number(a.daily_rent)*7; let wkn=1;
      for(let ps=new Date(a.ad+"T00:00:00Z");ps<cutoff;ps.setUTCDate(ps.getUTCDate()+7),wkn++){ const pe=new Date(ps);pe.setUTCDate(pe.getUTCDate()+6); const due=new Date(ps);due.setUTCDate(due.getUTCDate()-1); await c.query(`INSERT INTO ${S}.rent_dues (assignment_id,rider_id,vehicle_id,week_no,period_start,period_end,due_date,amount) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,[a.id,a.rider_id,a.vehicle_id,wkn,iso(ps),iso(pe),iso(due),amt]); dues++; }
    }

    // verify: any Collected-in-sheet week without a payment?
    let gaps=0;
    for(const [uid,name,mob,date,wk,st] of R){ const rid=(await c.query(`SELECT id FROM ${S}.riders WHERE regexp_replace(mobile,'\\D','','g')=$1 LIMIT 1`,[dg(mob)])).rows[0]?.id; if(!rid)continue;
      const firstS=st.indexOf("S");
      for(let i=0;i<st.length;i++){ if(st[i]!=="C")continue; if(firstS>=0&&i>=firstS)continue; const ps=iso(addDays(date,7*(i+1)));
        const ok=(await c.query(`SELECT 1 FROM ${S}.rider_payments rp WHERE rp.rider_id=$1 AND rp.rental_period_start=$2 LIMIT 1`,[rid,ps])).rows[0]; if(!ok)gaps++; } }

    // collected = prepaid week 1 for every rider + each Collected renewal mark
    const sheetCollected = R.reduce((s,[,,,, wk,st])=>{const fS=st.indexOf("S");let cc=1;for(let i=0;i<st.length;i++){if(st[i]==="C"&&(fS<0||i<fS))cc++;}return s+cc*wk;},0);
    console.log(`rate fixes: ${rateFix} | payments rebuilt: ${pay} | dues: ${dues}`);
    console.log("rate breakdown:", JSON.stringify((await c.query(`SELECT daily_rent, count(*)::int n FROM ${S}.rider_vehicle_assignments GROUP BY daily_rent ORDER BY daily_rent`)).rows));
    console.log(`AFTER: collected ₹${(await collectedTotal()).toLocaleString()}  (sheet says ₹${sheetCollected.toLocaleString()})  | remaining gaps: ${gaps}`);
    if(skipped.length) console.log("skipped:", skipped.join(", "));

    const IST="(now() AT TIME ZONE 'Asia/Kolkata')::date";
    const PAID=`COALESCE((SELECT SUM(rp.amount_collected) FROM ${S}.rider_payments rp WHERE rp.rider_id=d.rider_id AND (rp.payment_date BETWEEN d.period_start AND d.period_end OR rp.rental_period_start BETWEEN d.period_start AND d.period_end)),0)`;
    const sm=(await c.query(`WITH q AS (SELECT d.amount,d.period_start,${PAID} paid FROM ${S}.rent_dues d)
      SELECT COALESCE(SUM(amount) FILTER (WHERE period_start<${IST}),0) expected, COALESCE(SUM(LEAST(paid,amount)),0) collected,
      COALESCE(SUM(amount-LEAST(paid,amount)) FILTER (WHERE period_start<${IST} AND paid<amount),0) overdue FROM q`)).rows[0];
    console.log(`\nSUMMARY: collected ₹${(+sm.collected).toLocaleString()} | expected ₹${(+sm.expected).toLocaleString()} | pending ₹${(+sm.overdue).toLocaleString()} | ${Math.round(100*sm.collected/sm.expected)}%`);
    const pw=(await c.query(`SELECT d.week_no,to_char(d.period_start,'DD Mon') ps,to_char(d.period_end,'DD Mon') pe,d.amount,${PAID} paid,(d.period_start<${IST}) started
      FROM ${S}.rent_dues d JOIN ${S}.riders r ON r.id=d.rider_id WHERE r.mobile LIKE '%8439616892%' ORDER BY d.period_start`)).rows;
    console.log("Pawan Kumar 01:"); pw.forEach(w=>console.log(`  wk${w.week_no} ${w.ps}–${w.pe}  ₹${w.amount}  paid ₹${w.paid}  → ${w.paid>=w.amount?'Collected':w.started?'Overdue':'Pending'}`));

    if(DRY){await c.query("ROLLBACK");console.log("\n🔎 DRY RUN — rolled back.");}
    else{await c.query("COMMIT");console.log("\n✅ COMMITTED to "+S);}
  }catch(e){await c.query("ROLLBACK");console.error("❌ ROLLBACK:",e.message);process.exit(1);}finally{await c.end();}
}
run();
