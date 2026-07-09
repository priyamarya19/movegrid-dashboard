import fs from "fs"; import pg from "pg";
const env = fs.readFileSync(".env.local","utf8").split("\n").reduce((a,l)=>{const [k,...v]=l.split("=");if(k&&k.trim())a[k.trim()]=v.join("=").trim();return a;},{});
const S = env.RDS_ENV === "uat" ? "mg_data_uat" : "mg_data";
const c = new pg.Client({ host: env.RDS_HOST, port:+env.RDS_PORT, user: env.RDS_USER, password: env.RDS_PASSWORD, database: env.RDS_DATABASE, ssl:{rejectUnauthorized:false} });
const fmtd=(d)=> d? new Date(d).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}) : "";

const SQL = `
  SELECT r.name, r.rider_code, r.mobile, v.ev_number,
    to_char(a.assigned_date,'YYYY-MM-DD') allotted,
    a.status,
    to_char(a.returned_date,'YYYY-MM-DD') submitted,
    (SELECT count(*)::int FROM ${S}.rent_dues d WHERE d.assignment_id=a.id) weeks,
    (SELECT coalesce(sum(d.amount),0)::int FROM ${S}.rent_dues d WHERE d.assignment_id=a.id) expected,
    (SELECT coalesce(sum(rp.amount_collected),0)::int FROM ${S}.rider_payments rp
       WHERE rp.rider_id=a.rider_id AND rp.vehicle_id=a.vehicle_id
         AND rp.rental_period_start >= a.assigned_date
         AND rp.rental_period_start <= coalesce(a.returned_date, (now() AT TIME ZONE 'Asia/Kolkata')::date)) paid,
    (SELECT count(*)::int FROM ${S}.rider_vehicle_assignments a2 WHERE a2.rider_id=a.rider_id) cycles
  FROM ${S}.rider_vehicle_assignments a
  JOIN ${S}.riders r ON r.id=a.rider_id
  LEFT JOIN ${S}.vehicles v ON v.id=a.vehicle_id
  ORDER BY r.name`;

async function run(){
  await c.connect();
  const rows=(await c.query(SQL)).rows.map(r=>({...r, pending:r.expected-r.paid})).sort((a,b)=>b.pending-a.pending);
  // CSV
  const head=["Name","Rider ID","Mobile","Scooter","Allotted","Status","Submitted On","Weeks","Rent Paid","Pending","Re-allotted"];
  const csv=[head.join(",")].concat(rows.map(r=>[
    `"${r.name.trim()}"`, r.rider_code, r.mobile, r.ev_number||"",
    fmtd(r.allotted), r.status==="returned"?"Submitted":"Active",
    r.submitted?fmtd(r.submitted):"", r.weeks, r.paid, r.pending, r.cycles>1?"Yes":""
  ].join(","))).join("\n");
  fs.writeFileSync("rider-rent-report.csv", csv);

  // markdown
  console.log(`| # | Name | Rider ID | Allotted | Status | Submitted | Weeks | Paid ₹ | Pending ₹ | Re-allot |`);
  console.log(`|--|--|--|--|--|--|--|--|--|--|`);
  rows.forEach((r,i)=>console.log(`| ${i+1} | ${r.name.trim()} | ${r.rider_code} | ${fmtd(r.allotted)} | ${r.status==="returned"?"Submitted":"Active"} | ${r.submitted?fmtd(r.submitted):"—"} | ${r.weeks} | ${r.paid.toLocaleString()} | ${r.pending.toLocaleString()} | ${r.cycles>1?"Yes":""} |`));
  const tp=rows.reduce((s,r)=>s+r.paid,0), tpe=rows.reduce((s,r)=>s+r.pending,0);
  console.log(`\nTOTAL rows: ${rows.length} | Paid ₹${tp.toLocaleString()} | Pending ₹${tpe.toLocaleString()}`);
  // riders with no allotment
  const na=(await c.query(`SELECT name, rider_code, mobile FROM ${S}.riders r WHERE NOT EXISTS (SELECT 1 FROM ${S}.rider_vehicle_assignments a WHERE a.rider_id=r.id)`)).rows;
  if(na.length) console.log("Riders with NO allotment:", na.map(x=>`${x.name.trim()} (${x.rider_code})`).join(", "));
  await c.end();
}
run().catch(e=>{console.error(e.message);process.exit(1);});
