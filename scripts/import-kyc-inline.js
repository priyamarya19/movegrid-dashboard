// Imports rider KYC (structured fields) from the onboarding sheet, inline.
//
//   node scripts/import-kyc-inline.js
//
// Decisions baked in (per user):
//   - Match riders by mobile (digits). Existing -> UPDATE; unknown mobile -> INSERT new.
//     (Same name + different mobile = a different person; always insert new.)
//   - Bank values stored literally as-is (incl. 000000 / 1.125E+15 placeholders).
//   - Document images: NOT transcribed for now. Empty image fields get a DUMMY
//     placeholder; any real image already on a rider is left untouched.
//   - address_map_link intentionally NOT set here (long encoded URLs -> later TSV pass).

const { Client } = require("pg");
const fs = require("fs");

const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const [k, ...v] = l.split("=");
  if (k && k.trim()) a[k.trim()] = v.join("=").trim();
  return a;
}, {});

const client = new Client({
  host: env.RDS_HOST, port: Number(env.RDS_PORT),
  user: env.RDS_USER, password: env.RDS_PASSWORD,
  database: env.RDS_DATABASE, ssl: { rejectUnauthorized: false },
});

const S = "mg_data_uat";
const DUMMY = "https://placehold.co/800x600?text=Document+Pending";
const IMG_COLS = ["aadhaar_front_url", "aadhaar_back_url", "pan_image_url",
  "bank_doc_url", "dl_front_url", "dl_back_url", "family_ref_aadhaar_url"];

// name, mobile, address, bank, account, ifsc, famName, famMobile, localName, localMobile
const R = (name, mobile, addr, bank, acct, ifsc, fn, fm, ln, lm) =>
  ({ name, mobile, current_address: addr, bank, account_number: acct, ifsc,
     family_ref_name: fn, family_ref_mobile: fm, local_ref_name: ln, local_ref_mobile: lm });

const ROWS = [
  R("Rohit Kumar","7505022678","Bishrakh jalalpur Sector 1 Yatharth Hospital","Punjab National Bank","1.125E+15","PUNB0112500","Yashveer","9719015977","Aniket","6263850810"),
  R("Ajay Sharma","8860794603","Pandit colony nearby khatu Shyam Mandir sarfabad sector 73 Noida","FEDERAL PAYMENT BANK","77770100211461","FDRL0007777","Sangeeta Sharma","9667014563","Prerna sharma","8076249496"),
  R("Altaf","8587971484","Lal flats Parthala Jhanjharpur Sector 122 Noida","Kotak mahindra bank","5450421054","KKBK0000181","Nargis","9540021805","Rishabh","8796013875"),
  R("Vinit Kumar Tiwari","7379146745","Sector 45 Sadarpur Noida apposite godrej Society","Bank of Baroda","47818100007447","BARB0MORNAX","Madhubala","7042552278","Lalit","8318973821"),
  R("Suraj","9027145129","Gali number 7 Mamura sector 66 noida","Indian overseas Bank","331501000010948","IOBA0002315","Narendra kumar","7678418375","Rizvan","9990863834"),
  R("Rajat Singh","9058439061","Saraswati Vihar nearby kavita palace khora colony Ghaziabad","State Bank of India","39081013971","SBIN0005403","Sanjay","8448571681","Arun","9817134341"),
  R("Aas mohammad","7818823128","Sector 1 Jalpura greater Noida","Kotak mahindra bank","6749702069","KKBK0005304","Yasin khan","9654241878","Sumit","8750398979"),
  R("Shiva Sharma","9559326761","MORNA Sector 35 Noida","Union Bank of India","723802010008561","UBIN0572381","Gayatri","9266241950","Naveen Kumar","8510852652"),
  R("Harshit Yadav","7818838273","Bahlolpur Sector 63 Noida","Bank of India","772518210002959","BKID0007725","Rishi","9540514314","Yash vendra","9889507240"),
  R("Rinku","9839859086","Bahlolpur Sector 63 Noida","000000000","000000000","00000000","Manjesh kumar","9555001349","Yash Vendra","9889507240"),
  R("Rambabu Prasad","8796918758","Sk C 24 Nearby Delhi public school Sector 122","0000000","00000000","00000000","Nippu kumar soni","9958227097","Deepu","8448517324"),
  R("Bharat Singh","9927186055","Chhajarsi colony Sector 63 Noida","0000000","0000000","0000","Pawan","7217594734","Arvind kumar saini","8979934892"),
  R("Rohit Sharma","8882973803","Lal flats Sector 122 Noida","000000","0000000","00000000","Ranjit","8587855645","Kusham Sharma","8826963820"),
  R("Ghanshyam murari","9582912949","Bishrakh sector 1 Noida","000000","000000","000000","Chandan","9871881298","Kundan","9608221589"),
  R("Vipul anand","6397101738","Pusta Road FNG Vihar Sector 63 Noida","00000","000000","000000","Chandrpal Singh","9720292763","Rakesh","6398863604"),
  R("Sunil","7428246775","Nithari Sector 31 Noida","00000","000000","000000","Soni","9821186995","Vinit","7379146745"),
  R("Rahul Kumar","9548396560","Lal flats Sector 122 Noida","00000","00000","00000","Nitin kumar","6397112533","Kushlindra","6398844776"),
  R("Lakiraj","8193841808","Tugalpur pari Chowk Greater Noida","000000","000000","00000","Anita Kumari","8430018098","Sourabh","9211858229"),
  R("Abhishek","9870164936","Village Chalera gali no 3 greater Noida","000000","00000","00000","Subhash","8505803849","Kaushal","8076668272"),
  R("Arun Kumar","7054098911","Village Challera Sector 44 noida","0000","0000","0000","Uma","9236633673","Amit kumar","9026795517"),
  R("Ritwik kumar pandey","9088230421","Bishanpura Sector 58 Noida","HDFC","50100588489989","HDFC0001203","Rishish kumar pandey","7761828431","Shubham","7909073204"),
  R("Ankesh kumar","9639610457","Chotpur Sector 63 Noida","00000","00000","00000","Avadh Biharee","9389471032","Manish","8126860125"),
  R("Sumit Srivastava","8860514433","Bishrakh sector 1 Greater Noida","00000","00000","00000","Ananya Srivastava","7982344401","Mannu bhatu","9310157777"),
  R("Pradeep kumar","9793047488","Chotpur Sec 63 Noida","00000","00000","00000","Kaushlendra","9305596240","Solu","9219313075"),
  R("Sanjay Kumar","7302165388","Sharma bhawan sector 45 Noida","00000","00000","00000","Prempal","9536883537","Bhisampal","9779579899"),
  R("Gajendra Yadav","7248826582","Sharma bhawan sector 45 Noida","00000","000000","00000","Raju yadav","9927248513","Kamal singh","9389188292"),
  R("Ashok Kumar mahto","8287755018","Hajipur Sector 104 Noida","00000","00000","00000","Chhedi Mahto","7303288907","Kamlesh","8368434929"),
  R("Nirbhay Rana","8882777082","Ram park B21 Loni Ghaziabad","000000","000000","00000","Priyanka","9027724587","Sandeep","7838452392"),
  R("Prem Singh","7668390241","Chotpur Sector 63 Noida","0000","00000","0000","Rani","8745840319","Harshit Yadav","7818838273"),
  R("Pawan","8433020233","Akash morden Shorkha sector 115 Noida","000000","000000","000000","Kannon","8447124370","Rahul","7827899682"),
  R("Anoj Kumar","8750235022","सरफाबाद नोएडा सेक्टर 73","0000","00000","00000","Pinki kumari","6334393642","Pinky","7042140345"),
  R("Ravi Kumar","9691127984","salarpur sector 101 Khadar noida Gali no. 5 Durga mandir","State Bank of India","38849654174","SBIN0000186","Chanda Kumari","9279007933","Nitesh Kumar","7631222151"),
  R("Prince Deep","7061692906","Dax PG Rasoolpur nawada Sector 62 Noida","00000","000000","000000","Nagendra Prasad Roy","7696492906","Pushpanjali","7070784298"),
  R("Shashank","9235371948","Bishanpura Sector 58 Noida","0000","000000","00000","Arun Kumar","8418935365","Rajkumar","9519512559"),
  R("Anoop kumar","6392485904","Chauda Raghunathpur Sec 22 noida Rana Complex","000000","000000","0000000","Bhupendra","9506517112","Sachin","8882717089"),
  R("Gopal jha","9319716945","Lal Flats Sector 122 Noida","000000","00000","00000","Krishna jha","9958744242","Altaf","8587971484"),
  R("Aman Pratap","7393872559","Sarfabad Gali no 5 1A Sector 73 Noida","00000","00000","00000","Priya pal","9454372795","Arun","8400355480"),
  R("Sanjay Kumar 02","8766334246","Harola mahila park sector noida","State Bank of India","44062661019","SBIN0064941","Leela devi","8294845963","Suraj","9354649346"),
  R("Sheelu","9643636941","Chhotpur sector 63 Noida","0000","00000","0000","Samser Singh","9519516074","Nishant Kumar","8218086732"),
  R("Hritik","6398077228","Sector 44 Noida","00000","00000","00000","Karanveer","8006643553","Mahi","9336772677"),
  R("Mohan","7451024910","Sadarpur sector 46 Noida","00000","00000","00000","Sanjeev Kumar","9639284277","Sanjeev","9528575039"),
  R("Sahil Hindustani","7292011287","Shorkha sector 115 Noida","0000","0000","0000","Ajmati khatun","7549830064","Oshi","9599126297"),
  R("Akash","8840535672","Sadarpur sector 44 noida","0000","0000","0000","Narendra","8957623856","Vikash","9519746048"),
  R("Ashvani kumar","9974207270","Chand masjid Sector 81 Noida","0000","00000","0000","Phool jaha","9978528757","Jubair","8381906089"),
  R("Kunal Singh","7982212139","C383 Lal flats Sector 122 Noida","0000","0000","0000","Shivam Savita","9911050675","Rohit kunal","9205492216"),
  R("Md Barik","7319845124","Bahrampur sector 65 Noida","Yes Bank","070491900027772","YESB0000704","Nazma Khatun","8587864651","Iklak","8376831890"),
  R("Shivendra Pratap Singh","8528297800","Dadha Dabra market UTL Solar Greater Noida","Bank of Baroda","47828100014708","BARB0KUDWAR","Vindoo singh","8423550373","Anil Singh","7309352240"),
  R("Mohit pal","8447063784","Gali no 1 Pragati vihar near Agrawal general Store khora colony ghaziabad","Bank of Baroda","21358100002383","BARB0TRDCHW","Pushpa devi","9654288032","Sachin Pal","9999613848"),
  R("Rithik kumar","9560759578","Noida sector 122 janta flat block 58/2c","0000","0000","0000","Reena devi","8800174864","Roshan Ray","8076054043"),
  R("Mohd Sakib","9355676982","Noida sector 5 harola near mahila park","00000","00000","00000","Shakir ali","6395457933","Nasir","8860832572"),
  R("Pawan Kumar 01","8439616892","Lal Flats Sector 122 Noida","0000","0000","00000","Gaurav","7037815232","Shailendra","8923383950"),
];

const TEXT_COLS = ["name", "current_address", "bank", "account_number", "ifsc",
  "family_ref_name", "family_ref_mobile", "local_ref_name", "local_ref_mobile"];

async function nextRiderCode() {
  const r = await client.query(
    `SELECT rider_code FROM ${S}.riders WHERE rider_code ~ '^MG[0-9]+$'
     ORDER BY (regexp_replace(rider_code,'\\D','','g'))::int DESC LIMIT 1`
  );
  const n = parseInt((r.rows[0]?.rider_code ?? "MG000000").replace(/\D/g, ""), 10) + 1;
  return "MG" + String(n).padStart(6, "0");
}

async function run() {
  await client.connect();
  console.log(`Connected to ${env.RDS_DATABASE} (schema ${S})\n`);
  await client.query("BEGIN");
  try {
    const hub = await client.query(`SELECT id FROM ${S}.hubs WHERE hub_name = 'Noida-122' LIMIT 1`);
    const hubId = hub.rows[0]?.id ?? null;

    let updated = 0, inserted = 0;
    const dupNames = [];

    for (const r of ROWS) {
      const found = await client.query(
        `SELECT id FROM ${S}.riders WHERE regexp_replace(mobile,'\\D','','g') = $1 LIMIT 1`, [r.mobile]);

      if (found.rows[0]) {
        // text fields set directly; image fields filled only when currently empty
        const sets = TEXT_COLS.map((c, i) => `${c} = $${i + 1}`);
        const vals = TEXT_COLS.map((c) => r[c]);
        IMG_COLS.forEach((c) => { sets.push(`${c} = COALESCE(NULLIF(${c}, ''), $${vals.length + 1})`); vals.push(DUMMY); });
        vals.push(found.rows[0].id);
        await client.query(`UPDATE ${S}.riders SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);
        updated++;
      } else {
        const nameHit = await client.query(`SELECT mobile FROM ${S}.riders WHERE lower(name) = lower($1) LIMIT 1`, [r.name]);
        if (nameHit.rows[0]) dupNames.push(`${r.name}: new ${r.mobile} (existing ${nameHit.rows[0].mobile}) — kept as separate person`);

        const code = await nextRiderCode();
        const cols = ["rider_code", "mobile", "aadhaar", "rental_mode", "status",
          "assigned_hub_id", "created_by", "created_at", ...TEXT_COLS, ...IMG_COLS];
        const vals = [code, r.mobile, "AADHAAR-" + r.mobile, "weekly", "pending",
          hubId, "Ajay", new Date().toISOString(),
          ...TEXT_COLS.map((c) => r[c]), ...IMG_COLS.map(() => DUMMY)];
        const ph = vals.map((_, i) => `$${i + 1}`).join(",");
        await client.query(`INSERT INTO ${S}.riders (${cols.join(",")}) VALUES (${ph})`, vals);
        inserted++;
        console.log(`  + inserted ${code} ${r.name} (${r.mobile})`);
      }
    }

    if (dupNames.length) {
      console.log("\nℹ Same-name riders kept separate (matched by mobile):");
      dupNames.forEach((w) => console.log("  " + w));
    }

    await client.query("COMMIT");
    console.log(`\n✅ Done. Updated: ${updated}, Inserted: ${inserted}, Total: ${ROWS.length}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\n❌ ROLLBACK:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
