// Generates a Postman collection for the MoveGrid dashboard API.
//   node scripts/gen-postman.js
// Output: postman/MoveGrid.postman_collection.json
const fs = require("fs");
const path = require("path");

const BEARER = { type: "bearer", bearer: [{ key: "token", value: "{{token}}", type: "string" }] };

// req(name, method, urlPath, opts)
//   opts: { desc, body (object|formdata), query ([{key,value,description,disabled}]), public, headers, event }
function req(name, method, urlPath, opts = {}) {
  const segments = urlPath.split("/").filter(Boolean);
  const queryStr = opts.query && opts.query.length
    ? "?" + opts.query.map((q) => `${q.key}=${q.value ?? ""}`).join("&") : "";
  const url = {
    raw: `{{baseUrl}}/${urlPath}${queryStr}`,
    host: ["{{baseUrl}}"],
    path: segments,
  };
  if (opts.query) url.query = opts.query.map((q) => ({ key: q.key, value: q.value ?? "", description: q.description || "", disabled: q.disabled || false }));

  const header = [...(opts.headers || [])];
  const request = { method, header, url, description: opts.desc || "" };

  if (opts.body && opts.bodyMode !== "formdata") {
    header.push({ key: "Content-Type", value: "application/json" });
    request.body = { mode: "raw", raw: JSON.stringify(opts.body, null, 2), options: { raw: { language: "json" } } };
  } else if (opts.bodyMode === "formdata") {
    request.body = { mode: "formdata", formdata: opts.body };
  }
  if (opts.public) request.auth = { type: "noauth" };

  const item = { name, request, response: [] };
  if (opts.event) item.event = opts.event;
  return item;
}

const folder = (name, description, item) => ({ name, description, item });

const collection = {
  info: {
    _postman_id: "mg-dashboard-0000-0000-0000-000000000001",
    name: "MoveGrid Dashboard API",
    description:
      "All HTTP APIs used by the MoveGrid ops dashboard, grouped by task.\n\n" +
      "## Setup\n" +
      "1. Set the `baseUrl` variable (default `http://localhost:3000`; UAT app runs on port 3002).\n" +
      "2. Run **Auth → Login** with a valid email/password. It sends `X-Client-Type: mobile` so the response includes a `token`, which a test script saves to the `token` variable.\n" +
      "3. Every other request inherits `Authorization: Bearer {{token}}` automatically.\n\n" +
      "## Roles\n" +
      "Each request notes the role(s) allowed: **admin**, **ops_manager**, **hub_incharge**, **investor**. A 403 means your logged-in user's role isn't permitted.\n\n" +
      "## Path/ID variables\n" +
      "Set `riderId`, `vehicleId`, `investorId`, `hubId`, `leadId`, `userId`, `payoutId`, `allotmentId` as needed.",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  auth: BEARER,
  variable: [
    { key: "baseUrl", value: "http://localhost:3000", type: "string" },
    { key: "token", value: "", type: "string" },
    { key: "riderId", value: "", type: "string" },
    { key: "vehicleId", value: "", type: "string" },
    { key: "investorId", value: "", type: "string" },
    { key: "hubId", value: "", type: "string" },
    { key: "leadId", value: "", type: "string" },
    { key: "userId", value: "", type: "string" },
    { key: "payoutId", value: "", type: "string" },
    { key: "allotmentId", value: "", type: "string" },
  ],
  item: [
    folder("Auth", "Login / session / password management.", [
      req("Login", "POST", "api/auth/login", {
        desc: "Authenticate. Sends `X-Client-Type: mobile` so the JSON response includes `token` (also sets the `mg_token` cookie). A test script stores the token in the `token` collection variable. **Public.**",
        public: true,
        headers: [{ key: "X-Client-Type", value: "mobile" }],
        body: { email: "priyam@movegrid.in", password: "your-password" },
        event: [{ listen: "test", script: { type: "text/javascript", exec: [
          "const j = pm.response.json();",
          "if (j && j.token) { pm.collectionVariables.set('token', j.token); console.log('token saved'); }",
          "else { console.log('No token in body — send header X-Client-Type: mobile'); }",
        ] } }],
      }),
      req("Current session", "GET", "api/auth/session", { desc: "Returns the logged-in user (id, name, email, role) from the cookie/Bearer token. **Any logged-in user.**" }),
      req("Logout", "POST", "api/auth/logout", { desc: "Clears the `mg_token` cookie. **Any logged-in user.**" }),
      req("Change password", "POST", "api/auth/change-password", {
        desc: "Change your own password (min 8 chars). **Any logged-in user.**",
        body: { currentPassword: "old-password", newPassword: "new-password-8+" },
      }),
      req("Forgot password", "POST", "api/auth/forgot-password", {
        desc: "Emails a password-reset link to the address (if it exists). **Public.**",
        public: true, body: { email: "priyam@movegrid.in" },
      }),
      req("Reset password", "POST", "api/auth/reset-password", {
        desc: "Set a new password using the token from the reset email. **Public.**",
        public: true, body: { token: "reset-token-from-email", password: "new-password-8+" },
      }),
    ]),

    folder("Riders", "Onboard, view, KYC, payments, blacklist.", [
      req("List riders", "GET", "api/riders", {
        desc: "List riders with optional filters. **admin / ops_manager / hub_incharge.**",
        query: [
          { key: "status", value: "active", description: "active | inactive | pending", disabled: true },
          { key: "hub", value: "", description: "hub id", disabled: true },
          { key: "rent", value: "overdue", description: "overdue | due_soon", disabled: true },
        ],
      }),
      req("Create rider", "POST", "api/riders", {
        desc: "Onboard a rider (name + mobile required; rest optional). **admin / ops_manager / hub_incharge.**",
        body: {
          name: "Test Rider", mobile: "9876543210", nickname: "Test",
          rental_mode: "weekly", business_type: "rental", employer: "Blinkit",
          onboarding_fee: 1250, security_deposit: 0, assigned_hub_id: "{{hubId}}",
          current_address: "Sector 122 Noida", permanent_address: "", address_map_link: "",
          aadhaar: "", pan: "", dl_number: "",
          bank: "", account_number: "", ifsc: "",
          family_ref_name: "", family_ref_mobile: "", family_ref_aadhaar: "",
          local_ref_name: "", local_ref_mobile: "",
          aadhaar_front_url: "", aadhaar_back_url: "", pan_image_url: "", dl_front_url: "", dl_back_url: "",
          bank_doc_url: "", family_ref_aadhaar_url: "", profile_photo_url: "",
        },
      }),
      req("Get rider", "GET", "api/riders/{{riderId}}", { desc: "Full rider detail (KYC, assignment, payments). **admin / ops_manager / hub_incharge.**" }),
      req("Verify KYC document", "PATCH", "api/riders/{{riderId}}/kyc", {
        desc: "Mark a rider document verified/unverified. `document` ∈ aadhaar|pan|dl. **admin / ops_manager / hub_incharge.**",
        body: { document: "aadhaar", verified: true },
      }),
      req("Record rent received", "POST", "api/riders/{{riderId}}/rent-received", {
        desc: "Record a rent payment for the rider's active vehicle. **admin / ops_manager / hub_incharge.**",
        body: { amount: 1610, period_start: "2026-06-15", period_end: "2026-06-21" },
      }),
      req("Rent history", "GET", "api/riders/{{riderId}}/rent-received", { desc: "Payment history for the rider. **Any logged-in user.**" }),
      req("Blacklist rider", "POST", "api/riders/{{riderId}}/blacklist", {
        desc: "Blacklist a rider with a reason. **admin / ops_manager.**",
        body: { reason: "Repeated non-payment" },
      }),
      req("Un-blacklist rider", "DELETE", "api/riders/{{riderId}}/blacklist", { desc: "Remove a rider from the blacklist. **admin only.**" }),
      req("Blacklist check by Aadhaar", "GET", "api/riders/blacklist-check", {
        desc: "Check if an Aadhaar belongs to a blacklisted rider (pre-onboarding). **Any logged-in user.**",
        query: [{ key: "aadhaar", value: "123412341234", description: "Aadhaar number" }],
      }),
    ]),

    folder("Allotments", "Assign a vehicle to a rider and process returns.", [
      req("Assign vehicle (allot)", "POST", "api/allotments", {
        desc: "Allot a vehicle to a rider; sets rider active + vehicle assigned, optionally records first payment. **admin / ops_manager / hub_incharge.**",
        body: {
          rider_id: "{{riderId}}", vehicle_id: "{{vehicleId}}", hub_id: "{{hubId}}",
          assigned_date: "2026-06-22", rental_mode: "weekly",
          onboarding_fee: 1250, security_deposit: 0, amount_collected: 1610,
          payment_screenshot_url: "", undertaking_url: "",
          allotment_pics: ["", "", "", "", ""],
        },
      }),
      req("Return vehicle", "PATCH", "api/allotments/{{allotmentId}}/return", {
        desc: "Process a vehicle return for an assignment; frees the vehicle and deactivates the rider. **admin / ops_manager / hub_incharge.**",
        body: {
          returned_date: "2026-06-22", rent_cleared: true, penalty_amount: 0,
          condition_on_return: ["scratches"], return_photos: [""], return_remarks: "",
        },
      }),
    ]),

    folder("Vehicles", "Fleet inventory, lookups, investor mapping.", [
      req("List vehicles", "GET", "api/vehicles", {
        desc: "List vehicles, optional filters. **admin / ops_manager / hub_incharge.**",
        query: [
          { key: "status", value: "available", description: "available | assigned | maintenance", disabled: true },
          { key: "unassigned", value: "1", description: "1 = only vehicles with no investor", disabled: true },
        ],
      }),
      req("Create vehicle", "POST", "api/vehicles", {
        desc: "Add a vehicle (ev_number + oem required). **admin / ops_manager.**",
        body: {
          ev_number: "MG0426N0051", oem: "Shelby", chassis_number: "", motor_number: "",
          controller_number: "", iot_imei: "", iot_partner: "Fixx ev/Loconav",
          battery_number: "", battery_partner: "Battery Smart",
          hub_id: "{{hubId}}", purchase_date: "2026-06-01", price: 0,
          vehicle_photo_url: "", rc_book_url: "",
        },
      }),
      req("Get vehicle", "GET", "api/vehicles/{{vehicleId}}", { desc: "Vehicle detail incl. model, hub, investor, current rider. **admin / ops_manager / hub_incharge.**" }),
      req("Assign vehicle to investor", "PATCH", "api/vehicles/{{vehicleId}}", {
        desc: "Set/clear the investor that owns this vehicle. **admin only.**",
        body: { investor_id: "{{investorId}}" },
      }),
      req("Lookup by EV number or mobile", "GET", "api/vehicles/lookup", {
        desc: "Resolve a vehicle by `ev_number`, OR a rider by `mobile` (used by scan/quick-find). **Any logged-in user.**",
        query: [
          { key: "ev_number", value: "MG0426N0010", description: "find a vehicle" },
          { key: "mobile", value: "", description: "find a rider", disabled: true },
        ],
      }),
      req("Current assignment", "GET", "api/vehicles/{{vehicleId}}/assignment", { desc: "Active rider assignment for a vehicle. **Any logged-in user.**" }),
    ]),

    folder("Investors", "Investor accounts, vehicle mapping, bank, payouts.", [
      req("List investors", "GET", "api/investors", { desc: "All investors with totals. **admin only.**" }),
      req("Create investor", "POST", "api/investors", {
        desc: "Create an investor account (also creates a login). **admin only.**",
        body: {
          name: "Test Investor", email: "investor2@movegrid.in", mobile: "9000000010",
          password: "investor123", total_invested: 100000, investment_date: "2026-06-01",
          bank: "HDFC", account_number: "1234567890", confirm_account_number: "1234567890",
          ifsc: "HDFC0001203", pan: "", aadhaar: "", aadhaar_url: "",
        },
      }),
      req("Get investor", "GET", "api/investors/{{investorId}}", { desc: "Investor detail, vehicles, payouts. **admin / ops_manager / hub_incharge.**" }),
      req("Map vehicles to investor", "POST", "api/investors/{{investorId}}/vehicles", {
        desc: "Attach a set of vehicles to an investor. **admin only.**",
        body: { vehicle_ids: ["{{vehicleId}}"] },
      }),
      req("Verify investor bank", "POST", "api/investors/{{investorId}}/verify-bank", { desc: "Mark the investor's bank details as verified. **admin only.**" }),
      req("Update own bank (investor)", "POST", "api/investors/bank", {
        desc: "Investor updates their own bank account. **investor only.**",
        body: { bank: "HDFC", account_number: "1234567890", confirm_account_number: "1234567890", ifsc: "HDFC0001203" },
      }),
      req("Create payout", "POST", "api/investors/payouts", {
        desc: "Record an investor payout for a month (proof required). **admin only.**",
        body: {
          investor_id: "{{investorId}}", period_month: "2026-06", amount: 5000,
          proof_url: "https://...", vehicle_id: "{{vehicleId}}", paid_date: "2026-06-22", note: "",
        },
      }),
      req("Mark payout paid", "PATCH", "api/investors/payouts", {
        desc: "Mark a pending payout as paid. **admin only.**",
        body: { payout_id: "{{payoutId}}" },
      }),
    ]),

    folder("Hubs", "Hub master data.", [
      req("List hubs", "GET", "api/hubs", { desc: "All hubs. **admin / ops_manager / hub_incharge.**" }),
      req("Create hub", "POST", "api/hubs", {
        desc: "Create a hub (hub_name + city required). **admin only.**",
        body: {
          hub_name: "Noida-123", city: "Noida", area: "Sector 123",
          owner_name: "", owner_mobile: "", monthly_rent: 0, security_deposit: 0,
          vehicle_capacity: 50, agreement_pdf_url: "",
        },
      }),
      req("Get hub", "GET", "api/hubs/{{hubId}}", { desc: "Hub detail with vehicles/riders. **admin / ops_manager / hub_incharge.**" }),
    ]),

    folder("Leads", "Inbound leads (rider/investor/fleet) + comments.", [
      req("List leads", "GET", "api/leads", {
        desc: "List leads, optional filters. **admin / ops_manager.**",
        query: [
          { key: "type", value: "rider", description: "rider | investor | fleet", disabled: true },
          { key: "status", value: "new", description: "new | contacted | converted | rejected", disabled: true },
        ],
      }),
      req("Update lead status (list)", "PATCH", "api/leads", {
        desc: "Update a lead's status by id. **admin / ops_manager.**",
        body: { id: "{{leadId}}", status: "contacted" },
      }),
      req("Get lead", "GET", "api/leads/{{leadId}}", { desc: "Lead detail + comment history. **admin / ops_manager / hub_incharge.**" }),
      req("Add lead comment", "POST", "api/leads/{{leadId}}", {
        desc: "Add a comment to a lead. **admin / ops_manager / hub_incharge.**",
        body: { comment: "Called, will visit hub tomorrow." },
      }),
      req("Update lead status (by id)", "PATCH", "api/leads/{{leadId}}", {
        desc: "Update this lead's status. **admin / ops_manager / hub_incharge.**",
        body: { status: "converted" },
      }),
    ]),

    folder("Users (Staff)", "Internal staff accounts. Admin only.", [
      req("List staff", "GET", "api/users", { desc: "All staff users + roles. **admin only.**" }),
      req("Create staff user", "POST", "api/users", {
        desc: "Create a staff login. role ∈ admin|ops_manager|hub_incharge|investor. **admin only.**",
        body: { name: "New Ops", email: "ops2@movegrid.in", mobile: "9000000020", password: "password123", role: "ops_manager" },
      }),
      req("Update staff user", "PATCH", "api/users/{{userId}}", {
        desc: "Change a user's role and/or status. **admin only.**",
        body: { role: "ops_manager", status: "active" },
      }),
    ]),

    folder("Files", "S3 upload + signed download.", [
      req("Upload file", "POST", "api/upload", {
        desc: "Multipart upload to S3; returns the stored key/URL. Use form-data: `file` (file) + `folder` (text). **Any logged-in user.**",
        bodyMode: "formdata",
        body: [
          { key: "file", type: "file", src: [] },
          { key: "folder", value: "kyc", type: "text" },
        ],
      }),
      req("Get signed file URL", "GET", "api/file", {
        desc: "Get a presigned download URL for an S3 key. **Any logged-in user.**",
        query: [{ key: "key", value: "kyc/example.jpg", description: "S3 object key" }],
      }),
    ]),

    folder("Investor self-service", "Endpoints used by the investor portal.", [
      req("Raise support ticket", "POST", "api/support", {
        desc: "Investor submits a support request. **investor only.**",
        body: { subject: "Payout query", message: "When is June payout?" },
      }),
      req("Request rider reveal", "POST", "api/portfolio/reveal-request", {
        desc: "Investor requests to reveal the rider assigned to one of their vehicles. **investor only.**",
        body: { vehicle_id: "{{vehicleId}}", reason: "Verifying utilisation" },
      }),
    ]),

    folder("Logs", "Audit trail. Admin only.", [
      req("Audit logs", "GET", "api/logs", {
        desc: "Recent audit log entries, optional `action` filter. **admin only.**",
        query: [{ key: "action", value: "record_payment", description: "filter by action", disabled: true }],
      }),
    ]),
  ],
};

const outDir = path.join(process.cwd(), "postman");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "MoveGrid.postman_collection.json");
fs.writeFileSync(outFile, JSON.stringify(collection, null, 2));

const count = collection.item.reduce((n, f) => n + f.item.length, 0);
console.log(`Wrote ${outFile}`);
console.log(`${collection.item.length} folders, ${count} requests`);
collection.item.forEach((f) => console.log(`  ${f.name}: ${f.item.length}`));
