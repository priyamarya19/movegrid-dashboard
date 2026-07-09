# MoveGrid Dashboard — Complete Tech Overview

*A plain‑English guide to what the system is, how it's built, how it works, and why these technologies were chosen.*

---

## 1. What this project is

MoveGrid Dashboard is the internal web application that runs an **electric‑scooter rental business**. It replaces spreadsheets and manual tracking with one organised system that manages:

- **Riders** — the customers who rent scooters (onboarding, KYC documents, rent dues).
- **Vehicles** — the scooter fleet (status, hub, owner, assignment history).
- **Hubs** — the physical locations where scooters are parked and handed over.
- **Leads** — prospective riders/investors in the sales pipeline.
- **Investors** — people who fund scooters and receive monthly payouts, with their own self‑service portal.

It serves **four types of users**, and each only sees what's relevant to their job:

| Role | What they manage |
|---|---|
| **Admin** | Everything — full control, investors, audit logs, user accounts |
| **Ops Manager** | Day‑to‑day operations: riders, vehicles, hubs, leads |
| **Hub Incharge** | Their hub's riders and vehicles |
| **Investor** | Only their own portfolio, profile, and support — a self‑service portal |

So the app is really **two things in one**: a **back‑office** for staff, and a **customer (investor) portal**.

---

## 2. The big picture (how the parts fit together)

```
        ┌─────────────┐      ┌──────────────────────────┐      ┌──────────────┐
        │  Browser    │ ───▶ │   MoveGrid app (Next.js) │ ───▶ │  PostgreSQL  │
        │ (the user)  │ ◀─── │   running on AWS EC2     │ ◀─── │  (AWS RDS)   │
        └─────────────┘      └───────────┬──────────────┘      └──────────────┘
                                         │
                              ┌──────────┴──────────┐
                              ▼                     ▼
                        ┌──────────┐          ┌──────────┐
                        │  AWS S3  │          │ AWS SES  │
                        │ (files)  │          │ (email)  │
                        └──────────┘          └──────────┘
```

- The **browser** shows the screens and is what users click around in.
- The **MoveGrid app** is a single program (built with **Next.js**) that does *both* jobs: it builds the screens **and** runs the business logic on the server.
- The **database** (PostgreSQL on AWS RDS) permanently stores all the data.
- **S3** stores uploaded files (photos, documents); **SES** sends emails.

A key idea: most modern apps split into a separate "frontend" and "backend" written in different languages. Here, **one app and one language (TypeScript) does both**, which keeps things simpler.

---

## 3. Languages and tools (and what each one is)

| Tool / Language | Type | What it does | Plain explanation |
|---|---|---|---|
| **TypeScript** | Language | All the app logic — screens **and** server | JavaScript with "types" (labels that catch mistakes early). The main language of the project. |
| **React** | Library | Builds the screens | Lets us build the UI from small reusable pieces ("components") like Lego blocks. |
| **Next.js** | Framework | Ties everything together | The framework around React that adds page routing, server rendering, and a built‑in backend. |
| **Tailwind CSS** | Styling | Colours, spacing, layout | A modern way to style screens by adding small classes directly in the markup. |
| **SQL / PostgreSQL** | Language / Database | Reading & writing data | SQL is the language for asking the database questions; PostgreSQL is the database itself. |
| **pg** | Library | Connects app to database | The "driver" that lets our app run SQL on PostgreSQL. |
| **jose** | Library | Login tokens | Creates and verifies the secure token that proves you're logged in. |
| **bcryptjs** | Library | Password security | Scrambles (hashes) passwords so the real password is never stored. |
| **Chart.js** | Library | Graphs | Draws the charts on the dashboards. |
| **AWS SDK** | Library | Talks to AWS | The official toolkit to use S3 (files) and SES (email) from our code. |
| **pm2** | Tool | Keeps the app alive | Runs the app on the server and restarts it automatically if it stops. |

**Language vs framework vs library** (since people ask): a **language** is what you write in (TypeScript, SQL); a **framework** is the big structure you build inside (Next.js); a **library** is a smaller helper you plug in for one job (Chart.js, bcrypt). The only two actual *languages* here are **TypeScript** and **SQL** — everything else is a framework or library supporting them.

---

## 4. How the project is organised (the folders)

| Folder | What's inside |
|---|---|
| **`app/`** | Every page and every backend endpoint. Folder names become web addresses (e.g. `app/portfolio` → `/portfolio`). |
| **`app/api/`** | The backend endpoints that save/return data (e.g. `app/api/investors` handles creating an investor). |
| **`components/`** | Reusable UI pieces — tables, forms, the sidebar, modals — shared across pages. |
| **`lib/`** | The "brains": database connection (`db.ts`), login (`auth.ts`), which database to use (`schemas.ts`), data queries (`portfolio.ts`), email (`email.ts`), and small helpers. |
| **`scripts/`** | One‑off helper scripts — e.g. database migrations (adding a new column) and data seeding. |
| **`public/`** | Static files like logos and images. |
| **config files** | `package.json` (the list of tools used), `ecosystem.config.js` (how the server runs the app), `tailwind`/`tsconfig` (settings). |

---

## 5. What each page does

| Page (URL) | Who sees it | What it does |
|---|---|---|
| **Login / Forgot / Reset password** | Everyone | Sign in; reset a forgotten password by email link |
| **Dashboard** (`/`) | All roles (different per role) | Landing page with that role's key numbers and charts |
| **Leads** (`/leads`) | Admin, Ops | Sales pipeline of prospective riders/investors; detail per lead |
| **Riders** (`/riders`) | Admin, Ops, Hub | Rider list; **+ New** to onboard (KYC, documents); a profile page per rider; **Due‑soon / Overdue** rent views |
| **Vehicles** (`/vehicles`) | Admin, Ops, Hub | Scooter fleet; **+ New** to add; detail page showing hub, investor, current rider, and payout history |
| **Hubs** (`/hubs`) | Admin, Ops, Hub | Hub locations; **+ New** to add; detail page with that hub's riders & vehicles |
| **Allotments** (`/allotments`) | Admin, Ops, Hub | Assign a vehicle to a rider, and record returns |
| **Investors** (`/investors`) | Admin only | Investor list; **+ Add Investor** (creates their login); detail page to map vehicles, record payouts, and verify bank‑detail changes |
| **My Portfolio** (`/portfolio`) | Investor | Their vehicles, earnings so far, payouts remaining (24‑month plan), ROI, next due date, and environmental impact (km, CO₂, trees) |
| **My Profile** (`/profile`) | Investor | Personal & bank details (editable; bank changes need admin approval), Aadhaar image |
| **Support** (`/support`) | Investor | Send a query — emails both the team and the investor |
| **Forms** (`/forms`) | Admin, Ops, Hub | A shortcut hub linking to the onboarding/allotment forms |
| **Audit Logs** (`/logs`) | Admin only | A record of who changed what |
| **Settings** (`/settings`) | All roles | Change password; admins also manage user accounts |

---

## 6. How it works — following one real request

The clearest way to understand it is to follow what happens when **an investor opens "My Portfolio":**

1. **The web address maps to a folder.** `/portfolio` corresponds to `app/portfolio`. Next.js knows to run that page.
2. **A security gatekeeper runs first.** Before the page loads, a check (the "middleware") reads the login token from the browser cookie. No valid token → you're redirected to the login screen.
3. **The page builds itself on the server.** This page is a "**Server Component**" — it runs on the server, not in your browser. It calls a function that runs **SQL** to fetch *only this investor's* vehicles, payouts, and totals from the PostgreSQL database.
4. **The numbers are calculated.** Earnings, payouts remaining, ROI, and the environmental‑impact figures are worked out from that data.
5. **A finished screen is sent to the browser.** Because it was assembled on the server, the page appears quickly and already filled in.
6. **Interactive bits run in the browser.** Things like the "edit bank details" form or the "request full number" popup are "**Client Components**" — they run in your browser so they can react instantly to clicks.
7. **Saving goes through an API endpoint.** When the investor submits a form, the browser sends it to a backend endpoint under `app/api/...`. That endpoint checks who you are, validates the input, runs SQL to save it, and replies. The screen then refreshes.

**One‑line summary:** *open a page → login is checked → the server fetches data with SQL → a ready‑made screen loads → forms save back through API endpoints.*

**Server‑rendered vs browser‑rendered** (a common question): pages are built on the **server** so they load fast and securely (sensitive data and database access never leave the server). Only the interactive parts run in the **browser**. We get the speed of server rendering *and* the slickness of an interactive app.

---

## 7. The database

- **PostgreSQL** (on AWS RDS) is the single source of truth — everything is stored here.
- We organise data into **schemas** (think of them as labelled sections of the database): one set for **operations** (riders, vehicles, hubs, investors, payouts), one for **logins/users**, one for **leads**, and one for **audit logs**.
- The main pieces of data ("tables") include: `riders`, `vehicles`, `hubs`, `rider_vehicle_assignments` (who has which scooter), `rider_payments`, `investor_profiles`, `investor_payouts`, `leads`, `users` + `roles` (logins), and `audit_logs`.
- We write **SQL directly** (rather than using an automatic translator called an "ORM"). This gives precise control and good performance for the heavier calculations — like working out who's overdue on rent, or totalling investor payouts.

---

## 8. Security & access control

- **Passwords are never stored as text** — they're hashed with **bcrypt**, a one‑way scramble. Even we can't read them.
- **Logins use a secure token (JWT).** When you sign in, the server issues a signed token stored in a protected browser cookie; every later request re‑checks it. Tokens expire after 8 hours.
- **A gatekeeper (middleware)** blocks every page for anyone not logged in.
- **Role‑based access** — each page and endpoint checks your role, so an investor can never reach admin data, and so on.
- **Sensitive personal data is masked.** For example, an investor sees a rider's phone as `98XXXXXX10` and Aadhaar with only the last 4 digits; seeing the full number requires a logged, emailed request.
- **Bank‑detail changes require approval.** If an investor edits their bank account, it's marked "pending" and an admin must verify it before it's trusted.
- **Files are served via short‑lived secure links.** Uploaded documents in S3 aren't public; the app generates a link that expires in an hour.
- **Live and test data are kept in separate databases**, so testing can never affect real customer data.

---

## 9. AWS services used (and how each works)

| Service | What it is | How we use it |
|---|---|---|
| **EC2** | A virtual server (a computer in the cloud) | Runs the app continuously via pm2. Two copies run on it: **live** (`dash.movegrid.in`) and **testing** (`dash‑uat.movegrid.in`). |
| **RDS (PostgreSQL)** | A managed database — AWS runs, secures, and backs it up | Stores all data. Two separate databases — one **live**, one **testing** — fully isolated. |
| **S3** | Object/file storage | Holds uploaded photos & documents (KYC, payment receipts, Aadhaar). The app stores a file "key" and shows the file through a short‑lived secure link. |
| **SES** | An email‑sending service | Sends emails from a verified company address — support replies, investor notifications, new‑lead alerts. |

"Managed" (as in *managed database*) means AWS handles the boring, hard infrastructure — backups, security patches, uptime — so we don't run our own servers for it.

---

## 10. Environments & how we ship changes

There are **two environments**, deliberately separated:

- **UAT (testing)** — `dash‑uat.movegrid.in`, uses the **test database**. We try every change here first.
- **Production (live)** — `dash.movegrid.in`, uses the **live database** with real customers.

Both run on the same server but are told which database to use by a single setting (`RDS_ENV`) configured per app in `ecosystem.config.js`. This is what keeps live and test data apart.

**A deployment** (publishing a change) is: push the code → on the server, pull it, install any new tools, run any database updates ("migrations"), rebuild the app, and restart it with pm2. Testing is verified on UAT before the same is done on production.

---

## 11. Why this technology — industry standard & easy to hire for

Every piece of this stack is a current **industry standard** with a huge community. That matters practically: more documentation, fewer dead ends, proven reliability, and — importantly — **a large pool of developers who already know these tools, so hiring is easier, faster, and cheaper.**

- **JavaScript / TypeScript** is the world's most widely used programming language, year after year in developer surveys — the biggest talent pool of any language. Because it runs both the screens and the server, a single developer can work across the whole app.
- **React** is the most popular way to build web interfaces, and **Next.js** is its leading framework — used by companies like **Netflix, TikTok, and Notion**. It's proven at very large scale, heavily documented, and easy to find answers for.
- **PostgreSQL** is the most popular and most‑loved open‑source database — extremely reliable, free, and widely known.
- **AWS** is the market‑leading cloud platform — a standard skill most infrastructure engineers already have.
- **Tailwind CSS** is today's dominant styling approach, so the UI is quick to build and consistent.

**Why it's the right call:** the stack is **modern** (current best practice, not legacy), **fast** for users (server‑rendered), **scalable** (the same tools power some of the largest sites in the world), **future‑proof** (actively maintained, growing adoption), and **easy to staff**. There's nothing niche or unusual here that would make it hard to maintain or hand over.

---

## 12. Glossary (plain English)

| Term | Meaning |
|---|---|
| **Framework** | The big structure you build an app inside (here: Next.js). |
| **Library** | A smaller plug‑in helper for one job (e.g. Chart.js for graphs). |
| **Component** | A reusable building block of the UI (a table, a form, a button). |
| **Server Component** | A page/piece built on the server, then sent to the browser ready‑made. |
| **Client Component** | A piece that runs in the browser so it can react to clicks instantly. |
| **API / endpoint** | A backend address the app calls to fetch or save data. |
| **SQL** | The language used to ask the database for, or save, data. |
| **Schema** | A labelled section of the database that groups related tables. |
| **Migration** | A script that updates the database structure (e.g. adds a new column). |
| **ORM** | An automatic SQL translator. We *don't* use one — we write SQL directly for control. |
| **JWT (token)** | A signed digital pass that proves you're logged in. |
| **Hashing** | A one‑way scramble (used for passwords) that can't be reversed. |
| **Presigned URL** | A temporary secure link to a private file in S3 that expires. |
| **Environment** | A copy of the app — e.g. *testing* (UAT) vs *live* (production). |
| **Deployment** | The act of publishing a code change to a running environment. |
| **pm2** | The tool that keeps the app running on the server and restarts it if needed. |
| **EC2 / RDS / S3 / SES** | AWS services: a server / a database / file storage / email sending. |
