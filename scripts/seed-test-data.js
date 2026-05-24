const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
require("dotenv").config({ path: ".env.local" });

const pool = new Pool({
  host: process.env.RDS_HOST, port: 5432, user: process.env.RDS_USER,
  password: process.env.RDS_PASSWORD, database: process.env.RDS_DATABASE,
  ssl: { rejectUnauthorized: false },
});

const p = process.env.RDS_ENV === "uat" ? "uat_" : "";

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Clear all
    await client.query(`DELETE FROM ${p}logs.audit_logs`);
    await client.query(`DELETE FROM ${p}ops.rider_payments`);
    await client.query(`DELETE FROM ${p}ops.investor_payouts`);
    await client.query(`DELETE FROM ${p}ops.rider_vehicle_assignments`);
    await client.query(`DELETE FROM ${p}ops.riders`);
    await client.query(`DELETE FROM ${p}ops.vehicles`);
    await client.query(`DELETE FROM ${p}ops.employee_hub_assignments`);
    await client.query(`DELETE FROM ${p}ops.hubs`);
    await client.query(`DELETE FROM ${p}ops.vehicle_models`);
    await client.query(`DELETE FROM ${p}ops.investor_profiles`);
    await client.query(`DELETE FROM ${p}leads.leads`);
    // Keep admin user, only delete investor users
    await client.query(`DELETE FROM ${p}auth.users WHERE email NOT LIKE '%movegrid.in'`);

    // Leads
    await client.query(`
      INSERT INTO ${p}leads.leads (type, name, phone, email, city, amount, status, created_at) VALUES
      ('investor','Rahul Sharma','9876543210','rahul@gmail.com','Delhi','2L-5L','new', NOW() - interval '2 minutes'),
      ('investor','Sneha Gupta','9123456780','sneha@gmail.com','Noida','6L-10L','contacted', NOW() - interval '2 hours'),
      ('investor','Vikram Joshi','9432109876','vikram@gmail.com','Gurugram','Up to 6L','new', NOW() - interval '5 hours'),
      ('investor','Meena Agarwal','9321098765','meena@gmail.com','Delhi','10L+','contacted', NOW() - interval '1 day'),
      ('rider','Amit Kumar','9988776655',null,'Gurugram',null,'new', NOW() - interval '18 minutes'),
      ('rider','Ravi Singh','9871234560',null,'Delhi',null,'converted', NOW() - interval '3 hours'),
      ('rider','Deepak Yadav','9765432100',null,'Faridabad',null,'new', NOW() - interval '6 hours'),
      ('rider','Suresh Mehta','9654321001',null,'Noida',null,'contacted', NOW() - interval '1 day'),
      ('rider','Priya Singh','9543210902',null,'Delhi',null,'converted', NOW() - interval '2 days'),
      ('fleet','FastMart Pvt Ltd','9210987603','ops@fastmart.in','Noida',null,'contacted', NOW() - interval '4 hours'),
      ('fleet','QuickDeliver Co','9109876504',null,'Delhi',null,'new', NOW() - interval '5 hours'),
      ('fleet','Zomato Pvt Ltd','8012345605',null,'Delhi',null,'new', NOW() - interval '5 hours')
    `);

    // Investor auth users + profiles
    const investors = [
      { name: 'Ankit Sharma', email: 'ankit@example.com', mobile: '9876500001', invested: 200000 },
      { name: 'Pooja Mehta', email: 'pooja@example.com', mobile: '9876500002', invested: 300000 },
      { name: 'Nikhil Verma', email: 'nikhil@example.com', mobile: '9876500003', invested: 150000 },
      { name: 'Shalini Rao', email: 'shalini@example.com', mobile: '9876500004', invested: 500000 },
      { name: 'Deepak Verma', email: 'deepak@example.com', mobile: '9876500005', invested: 250000 },
    ];

    const hash = await bcrypt.hash("password", 10);
    const invRoleRes = await client.query(`SELECT id FROM ${p}auth.roles WHERE name = 'investor'`);
    let invRoleId = invRoleRes.rows[0]?.id;
    if (!invRoleId) {
      const r = await client.query(`INSERT INTO ${p}auth.roles (name, description) VALUES ('investor','Investor portal access') RETURNING id`);
      invRoleId = r.rows[0].id;
    }

    const invProfileIds = [];
    for (const inv of investors) {
      const userRes = await client.query(
        `INSERT INTO ${p}auth.users (name, email, mobile, password_hash, role_id, status) VALUES ($1,$2,$3,$4,$5,'active') RETURNING id`,
        [inv.name, inv.email, inv.mobile, hash, invRoleId]
      );
      const userId = userRes.rows[0].id;
      const profRes = await client.query(
        `INSERT INTO ${p}ops.investor_profiles (user_id, total_invested, investment_date, status) VALUES ($1,$2,'2025-01-01','active') RETURNING id`,
        [userId, inv.invested]
      );
      invProfileIds.push(profRes.rows[0].id);
    }

    // Hubs
    const hubsRes = await client.query(`
      INSERT INTO ${p}ops.hubs (hub_id, hub_name, city, area, vehicle_capacity) VALUES
      ('HUB-DEL-01','Hub Delhi-01','Delhi','Lajpat Nagar',40),
      ('HUB-NOI-01','Hub Noida-01','Noida','Sector 62',30),
      ('HUB-GGN-01','Hub Gurugram-01','Gurugram','Cyber City',30),
      ('HUB-FBD-01','Hub Faridabad-01','Faridabad','Sector 16',20),
      ('HUB-GZB-01','Hub Ghaziabad-01','Ghaziabad','Indirapuram',20)
      RETURNING id
    `);
    const hubIds = hubsRes.rows.map(r => r.id);

    // Vehicle model
    const modelRes = await client.query(`
      INSERT INTO ${p}ops.vehicle_models (model_name, oem, rental_per_day, is_high_speed) VALUES
      ('S1 Pro','Ola',1400,true),
      ('450X','Ather',1400,true),
      ('iQube S','TVS',1200,false)
      RETURNING id
    `);
    const modelIds = modelRes.rows.map(r => r.id);

    // Vehicles: 98 assigned, 30 available, 12 maintenance = 140 total
    const vehicleStatuses = [
      ...Array(98).fill('assigned'),
      ...Array(30).fill('available'),
      ...Array(12).fill('maintenance'),
    ];
    const vehiclesRes = await client.query(`
      INSERT INTO ${p}ops.vehicles (ev_number, chassis_number, status, model_id, hub_id, investor_id, purchase_date, price)
      VALUES ${vehicleStatuses.map((status, i) => {
        const inv = invProfileIds[i % invProfileIds.length];
        const model = modelIds[i % modelIds.length];
        const hub = hubIds[i % hubIds.length];
        return `('EV-${String(i+1).padStart(4,'0')}','CHS-${String(i+1).padStart(6,'0')}','${status}','${model}','${hub}','${inv}','2024-10-01',95000)`;
      }).join(',')}
      RETURNING id, status
    `);
    const assignedVehicleIds = vehiclesRes.rows.filter(r => r.status === 'assigned').map(r => r.id);

    // Riders: 110 active, 14 inactive = 124 total
    const riderNames = [
      'Rahul Kumar','Amit Yadav','Suresh Patel','Deepak Singh','Ravi Sharma',
      'Anjali Verma','Mohit Gupta','Sanjay Tiwari','Vikash Kumar','Ashok Yadav',
      'Ramesh Singh','Dinesh Patel','Manoj Kumar','Arun Sharma','Sunita Devi',
      'Kavita Singh','Rajesh Gupta','Vikas Yadav','Prakash Kumar','Santosh Singh',
      'Umesh Patel','Narendra Kumar','Arjun Verma','Balram Singh','Chandan Kumar',
      'Dilip Gupta','Farhan Khan','Ganesh Yadav','Harsh Sharma','Indra Kumar',
    ];
    const riderStatuses = [...Array(110).fill('active'), ...Array(14).fill('inactive')];
    const ridersRes = await client.query(`
      INSERT INTO ${p}ops.riders (name, mobile, aadhaar, assigned_hub_id, status, onboarding_fee, security_deposit, rental_mode, created_at)
      VALUES ${riderStatuses.map((status, i) => {
        const name = riderNames[i % riderNames.length] + (i >= riderNames.length ? ` ${Math.floor(i/riderNames.length)+1}` : '');
        const hub = hubIds[i % hubIds.length];
        const mobile = `90000${String(10000 + i).padStart(5,'0')}`;
        const aadhaar = `${String(200000000000 + i)}`;
        const daysAgo = Math.floor(Math.random() * 120);
        return `('${name.replace(/'/g,"\\'")}','${mobile}','${aadhaar}','${hub}','${status}',1500,5000,'monthly', NOW() - interval '${daysAgo} days')`;
      }).join(',')}
      RETURNING id, status
    `);
    const activeRiderIds = ridersRes.rows.filter(r => r.status === 'active').map(r => r.id);

    // Assign vehicles to active riders
    for (let i = 0; i < Math.min(activeRiderIds.length, assignedVehicleIds.length); i++) {
      await client.query(`
        INSERT INTO ${p}ops.rider_vehicle_assignments (rider_id, vehicle_id, hub_id, assigned_date, status)
        VALUES ($1,$2,$3,CURRENT_DATE,'active')
      `, [activeRiderIds[i], assignedVehicleIds[i], hubIds[i % hubIds.length]]);
    }

    // Rider payments — last 5 months
    for (let month = 1; month <= 5; month++) {
      for (const riderId of activeRiderIds.slice(0, 90)) {
        const vehicle = assignedVehicleIds[activeRiderIds.indexOf(riderId) % assignedVehicleIds.length];
        const amount = 1200 + Math.floor(Math.random() * 400);
        const date = new Date(2026, month - 1, 10).toISOString().split('T')[0];
        await client.query(`
          INSERT INTO ${p}ops.rider_payments (rider_id, vehicle_id, amount_collected, payment_date)
          VALUES ($1,$2,$3,$4)
        `, [riderId, vehicle, amount, date]);
      }
    }

    // Investor payouts — last 5 months
    for (const invId of invProfileIds) {
      const veh = vehiclesRes.rows.find(r => r.status === 'assigned')?.id;
      for (let month = 1; month <= 5; month++) {
        const amount = 15000 + Math.floor(Math.random() * 5000);
        const dueDate = new Date(2026, month - 1, 5).toISOString().split('T')[0];
        const paidDate = month < 5 ? dueDate : null;
        await client.query(`
          INSERT INTO ${p}ops.investor_payouts (investor_id, vehicle_id, amount, due_date, paid_date, status)
          VALUES ($1,$2,$3,$4,$5,$6)
        `, [invId, veh, amount, dueDate, paidDate, month < 5 ? 'paid' : 'pending']);
      }
    }

    // Audit logs
    await client.query(`
      INSERT INTO ${p}logs.audit_logs (action, entity, details, created_at) VALUES
      ('onboard_rider','rider','{"name":"Rahul Kumar","hub":"Hub Delhi-01"}', NOW() - interval '2 minutes'),
      ('assign_vehicle','vehicle','{"vehicle":"EV-0098","rider":"Priya Singh"}', NOW() - interval '18 minutes'),
      ('record_payment','payment','{"amount":1400,"rider":"Amit Yadav"}', NOW() - interval '1 hour'),
      ('update_lead','lead','{"name":"Ankit Sharma","status":"contacted"}', NOW() - interval '2 hours'),
      ('payout_marked','investor_payout','{"investor":"Deepak Verma","amount":18756}', NOW() - interval '3 hours'),
      ('new_lead','lead','{"name":"Zomato Pvt Ltd","type":"fleet"}', NOW() - interval '5 hours')
    `);

    await client.query("COMMIT");
    console.log("✓ All test data seeded:");
    console.log("  → 12 leads, 5 hubs, 5 investors, 140 vehicles, 124 riders");
    console.log("  → payments, payouts, audit logs");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error:", err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
