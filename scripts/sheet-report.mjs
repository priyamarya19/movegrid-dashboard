import fs from "fs";
import pg from "pg";
const _env = fs.readFileSync(".env.local","utf8").split("\n").reduce((a,l)=>{const [k,...v]=l.split("=");if(k&&k.trim())a[k.trim()]=v.join("=").trim();return a;},{});
const _S = _env.RDS_ENV==="uat"?"mg_data_uat":"mg_data";
// [userID, name, mobile, allot dd/mm/yyyy, weekly, status]  C=Collected S=Submitted(returned) P=Pending .=blank
const R = [
 ["MG000001","Rohit Kumar","7505022678","25/04/2026",1680,"SSSSSSSSSSS"],
 ["MG000002","Ajay Sharma","8860794603","26/04/2026",1680,"CCCCCCCP..."],
 ["MG000003","Altaf","8587971484","27/04/2026",1680,"CCCCCCSSS.."],
 ["MG000004","Vinit kumar tiwari","7379146745","29/04/2026",1680,"CCCCCPPP..."],
 ["MG000005","Suraj","9027145129","29/04/2026",1680,"CCCCCCPP..."],
 ["MG000006","Rajat Singh","9058439061","30/04/2026",1680,"CCCCCPPP..."],
 ["MG000007","Anand Kumar","7065508843","30/04/2026",1680,"CCCCCCCC..."],
 ["MG000008","Aas mohammad","7818823128","30/04/2026",1680,"CCSSSSSSSSS"],
 ["MG000009","Shiva Sharma","9559326761","03/05/2026",1680,"CSSSSSSSSSS"],
 ["MG000010","Harshit yadav","7818838273","04/05/2026",1680,"CCSSSSSSSSS"],
 ["MG000011","Rinku","9839859086","04/05/2026",1680,"CCCCCP....."],
 ["MG000012","Rambabu prasad","8796918758","05/05/2026",1680,"CCCCCP....."],
 ["MG000013","Bharat Singh","9927186055","05/05/2026",1680,"CCSSSSSSSSS"],
 ["MG000014","Rohit Sharma","8882973803","05/05/2026",1680,"CCCCCCCC..."],
 ["MG000015","Ghanshyam Murari","9582912949","05/05/2026",1680,"CCCCCCP...."],
 ["MG000016","Vipul Anand","6397101738","05/05/2026",1680,"SSSSSSSSSSS"],
 ["MG000017","Sunil","9540316410","05/05/2026",1680,"CCCCPP....."],
 ["MG000018","Rahul Kumar","9548396560","06/05/2026",1680,"CCCCSSSSSSS"],
 ["MG000019","Lakiraj","8193841808","06/05/2026",1680,"CCCCCPS...."],
 ["MG000020","Abhishek","9870164936","06/05/2026",1680,"CCSSSSSSSSS"],
 ["MG000021","Arun Kumar","7054098911","06/05/2026",1680,"CCCCCCC...."],
 ["MG000022","Ritwik kumar pandey","9088230421","14/05/2026",1680,"CCCCCCP...."],
 ["MG000023","Ankesh kumar","9639610457","19/05/2026",1680,"CCCCCC....."],
 ["MG000024","Pradeep Kumar","9793047488","22/05/2026",1680,"CCCCP......"],
 ["MG000025","Sumit Srivastava","8860514433","23/05/2026",1680,"CCPP......."],
 ["MG000026","Sanjay Yadav","7302165388","23/05/2026",1680,"CSSSSSSSSSS"],
 ["MG000027","Gajendra Yadav","7248826582","23/05/2026",1680,"CCSSSSSSSSS"],
 ["MG000028","Ashok Kumar mahto","8287755018","23/05/2026",1680,"CCCCSSSSSSS"],
 ["MG000029","Nirbhay Rana","8882777082","23/05/2026",1820,"CCPP......."],
 ["MG000030","Prem Singh","7668390241","25/05/2026",1680,"CCCCSSSSSSS"],
 ["MG000031","Pawan","8433020233","25/05/2026",1820,"CSSSSSSSSSS"],
 ["MG000032","Anoj Kumar","8750235022","25/05/2026",1820,"CSSSSSSSSSS"],
 ["MG000033","Ravi Kumar","9691127984","26/05/2026",1820,"CCCCC......"],
 ["MG000034","Prince Deep","7061692906","29/05/2026",1820,"CPP........"],
 ["MG000035","Shashank","9235371948","29/05/2026",1820,"CCCP......."],
 ["MG000036","Anoop kumar","6392485904","29/05/2026",1820,"CCC........"],
 ["MG000037","Gopal jha","9958744242","29/05/2026",1680,"CSSSSSSSSSS"],
 ["MG000038","Aman Pratap","7393872559","01/06/2026",1680,"CSSSSSSSSSS"],
 ["MG000039","Sanjay Kumar 01","8766334246","01/06/2026",1680,"CCS........"],
 ["MG000040","Sheelu","9643636941","01/06/2026",1680,"CCPP......."],
 ["MG000041","Hritik","6398077228","01/06/2026",1680,"CCC........"],
 ["MG000042","Bharat Singh","9927186055","02/06/2026",1680,"SSSSSSSSSSS"],
 ["MG000043","Mohan","7451024910","03/06/2026",1680,"CPSSSSSSSSS"],
 ["MG000044","Amar Singh Thapa","9355560897","03/06/2026",1680,"CPP........"],
 ["MG000045","Sahil Hindustani","7292011287","03/06/2026",1680,"CPP........"],
 ["MG000046","Akash","8840535672","05/06/2026",1680,"CCCP......."],
 ["MG000047","Ashvani kumar","9974207270","06/06/2026",1680,"CCP........"],
 ["MG000048","Dhanvir","8115387509","09/06/2026",1680,"SSSSSSSSSSS"],
 ["MG000049","Kunal Singh","7982212139","10/06/2026",1820,"SSSSSSSSSSS"],
 ["MG000050","Md Barik","7319845124","11/06/2026",1820,"CC........."],
 ["MG000051","Shivendra Pratap Singh","8528297800","15/06/2026",1680,"CP........."],
 ["MG000052","Mohit pal","8447063784","15/06/2026",1680,"CP........."],
 ["MG000053","Rithik Kumar","9560759578","17/06/2026",1820,"CSSSSSSSSSS"],
 ["MG000054","Mohd Sakib","9355676982","18/06/2026",1680,"CSSSSSSSSSS"],
 ["MG000055","Rahul Kumar","9548396560","18/06/2026",1680,"SSSSSSSSSSS"],
 ["MG000056","Pawan Kumar 01","8439616892","19/06/2026",1680,"P.........."],
 ["MG000057","Sumit Kumar","8510988713","20/06/2026",1680,"CP........."],
 ["MG000058","Mohd Danish","7820015194","23/06/2026",1680,"CP........."],
 ["MG000059","Mohammad Ali","9568080124","23/06/2026",1820,"CP........."],
 ["MG000060","Avnish","9956661380","24/06/2026",1680,"CP........."],
 ["MG000061","Abhijit halder","8527758553","29/06/2026",1820,"CP........."],
 ["MG000062","Dharmendra Kumar","9793857424","30/06/2026",1680,"P.........."],
 ["MG000063","Nirala Kumar","6204712374","30/06/2026",1680,"P.........."],
 ["MG000064","Himanshu Shekhar","9650905562","01/07/2026",1820,"P.........."],
 ["MG000065","Altaf","8587971484","02/07/2026",1680,"P.........."],
 ["MG000066","Manjoor husain","9760194276","02/07/2026",1820,"P.........."],
 ["MG000067","Jayram kumar paswan","6207945115","02/07/2026",1820,"P.........."],
 ["MG000068","Pushpendra tiwari","7007924112","03/07/2026",1820,"P.........."],
 ["MG000069","Raj Kumar","7303826251","03/07/2026",1820,"P.........."],
 ["MG000070","Rishipal","7017258338","03/07/2026",1820,"P.........."],
 ["MG000071","Gopal jha","9958744242","03/07/2026",1820,"P.........."],
 ["MG000072","Kunal Singh","7982212139","03/07/2026",1820,"P.........."],
 ["MG000073","Sumit Singh 01","7835935604","06/07/2026",0,"..........."],
];

const addDays=(dmy,n)=>{const [d,m,y]=dmy.split("/").map(Number);const dt=new Date(Date.UTC(y,m-1,d));dt.setUTCDate(dt.getUTCDate()+n);return dt;};
const fmt=(dt)=>dt.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"});
const count=(s,ch)=>[...s].filter(c=>c===ch).length;
const mobCount={}; R.forEach(r=>mobCount[r[2]]=(mobCount[r[2]]||0)+1);

// pending rule: count every week (Pending OR still-blank) whose week has STARTED on/before
// today (incl. the current week starting today); exclude weeks starting tomorrow onward.
const ist=new Date(Date.now()+5.5*3600e3);
const cutoff=new Date(Date.UTC(ist.getUTCFullYear(),ist.getUTCMonth(),ist.getUTCDate())); cutoff.setUTCDate(cutoff.getUTCDate()-1); // count weeks starting on/before yesterday (06/07); skip weeks starting today (07/07)+

const rows = R.map(([uid,name,mob,date,wk,st])=>{
  const firstS=st.indexOf("S");
  const lastDue = firstS>=0 ? firstS : 11;   // weeks before return (rent stops at Submitted)
  let dueWeeks=0, collectedInDue=0;
  for(let k=0;k<lastDue && k<11;k++){
    // week start = allot + 7k; count if it has started on/before today, skip if it starts tomorrow+
    if(addDays(date,7*k) > cutoff) continue;
    dueWeeks++;
    if(st[k]==="C") collectedInDue++;
  }
  const c=count(st,"C");
  const pendingWeeks = dueWeeks - collectedInDue;
  return {uid,name,mob,date,wk,st,
    status: firstS>=0?"Submitted":"Active",
    submitted: firstS>=0? fmt(addDays(date,7*firstS+6)) : "",
    weeks: dueWeeks, paid:c*wk, pending:pendingWeeks*wk, reallot: mobCount[mob]>1?"Yes":""};
}).sort((a,b)=>b.pending-a.pending);

const head=["Name","Rider ID","Mobile","Allotted","Status","Submitted On","Weeks","Rent Paid","Pending","Re-allotted"];
fs.writeFileSync("sheet-rent-report.csv",[head.join(",")].concat(rows.map(r=>[`"${r.name}"`,r.uid,r.mob,r.date,r.status,r.submitted,r.weeks,r.paid,r.pending,r.reallot].join(","))).join("\n"));

console.log(`| # | Name | Rider ID | Allotted | Status | Submitted | Weeks | Paid ₹ | Pending ₹ | Re-allot |`);
console.log(`|--|--|--|--|--|--|--|--|--|--|`);
rows.forEach((r,i)=>console.log(`| ${i+1} | ${r.name} | ${r.uid} | ${fmt(addDays(r.date,0))} | ${r.status} | ${r.submitted||"—"} | ${r.weeks} | ${r.paid.toLocaleString()} | ${r.pending.toLocaleString()} | ${r.reallot} |`));
const tp=rows.reduce((s,r)=>s+r.paid,0), tpe=rows.reduce((s,r)=>s+r.pending,0);
console.log(`\nSHEET TOTALS: ${rows.length} rows | Collected ₹${tp.toLocaleString()} | Pending (marked) ₹${tpe.toLocaleString()}`);

// --- Compare: weeks Collected in the sheet but NOT recorded paid in the DB ---
;(async()=>{
  const c=new pg.Client({host:_env.RDS_HOST,port:+_env.RDS_PORT,user:_env.RDS_USER,password:_env.RDS_PASSWORD,database:_env.RDS_DATABASE,ssl:{rejectUnauthorized:false}});
  await c.connect();
  const dg=s=>(s||"").replace(/\D/g,"");
  const isoD=dt=>dt.toISOString().slice(0,10);
  const miss=[];
  for(const [uid,name,mob,date,wk,st] of R){
    if(!st.includes("C")) continue;
    const rid=(await c.query(`SELECT id FROM ${_S}.riders WHERE regexp_replace(mobile,'\\D','','g')=$1 LIMIT 1`,[dg(mob)])).rows[0]?.id;
    if(!rid){miss.push(`${name} (${uid}): rider not in DB`);continue;}
    for(let k=0;k<11;k++){
      if(st[k]!=="C") continue;
      const ps=isoD(addDays(date,7*k)), pe=isoD(addDays(date,7*k+6));
      const paid=(await c.query(`SELECT 1 FROM ${_S}.rider_payments rp WHERE rp.rider_id=$1 AND (rp.rental_period_start BETWEEN $2 AND $3 OR rp.payment_date BETWEEN $2 AND $3) LIMIT 1`,[rid,ps,pe])).rows[0];
      if(!paid) miss.push(`${name} (${uid}) — wk${k+1} ${ps} Collected in sheet, NOT paid in DB (₹${wk})`);
    }
  }
  console.log(`\n=== GENUINE gaps — Collected in sheet but NOT paid in DB: ${miss.length} ===`);
  miss.forEach(m=>console.log("  "+m));
  await c.end();
})();
