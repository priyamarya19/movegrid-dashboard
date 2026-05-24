import { notFound } from "next/navigation";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import KycVerifyButton from "@/components/riders/KycVerifyButton";
import BackButton from "@/components/BackButton";
import BlacklistButton from "@/components/riders/BlacklistButton";
import RentMarkPaid from "@/components/riders/RentMarkPaid";
import { getSession } from "@/lib/auth";
import { EXPECTED_RENT } from "@/lib/rentConstants";

function toISTMidnight(d: Date): Date {
  // Returns a Date whose y/m/d components (in local time) match the IST date of d
  const s = d.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
  const [datePart] = s.split(",");
  const [m, day, y] = datePart.split("/").map(Number);
  return new Date(y, m - 1, day); // local midnight = UTC midnight on server
}

function calcLastDueDate(createdAt: string, rentalMode: string): Date | null {
  const joined = toISTMidnight(new Date(createdAt));
  const today = toISTMidnight(new Date());
  const periodLen = rentalMode === "weekly" ? 7 : rentalMode === "fortnightly" ? 14 : 30;

  if (rentalMode === "weekly" || rentalMode === "fortnightly") {
    const days = Math.round((today.getTime() - joined.getTime()) / 86400000);
    const periods = Math.floor(days / periodLen);
    if (periods <= 0) return null;
    const d = new Date(joined);
    d.setDate(joined.getDate() + periods * periodLen);
    if (d.getTime() >= today.getTime()) return null; // due today is handled by next_due
    return d;
  }
  // monthly
  const joinDay = joined.getDate();
  const thisMonthDue = new Date(today.getFullYear(), today.getMonth(), joinDay);
  if (thisMonthDue.getTime() < today.getTime() && thisMonthDue.getTime() > joined.getTime()) return thisMonthDue;
  const lastMonthDue = new Date(today.getFullYear(), today.getMonth() - 1, joinDay);
  if (lastMonthDue.getTime() > joined.getTime()) return lastMonthDue;
  return null;
}

function calcNextDueDate(createdAt: string, rentalMode: string): Date {
  const joined = toISTMidnight(new Date(createdAt));
  const today = toISTMidnight(new Date());

  if (rentalMode === "weekly") {
    const days = Math.round((today.getTime() - joined.getTime()) / 86400000);
    const weeks = Math.max(Math.ceil(days / 7), 1);
    const d = new Date(joined);
    d.setDate(joined.getDate() + weeks * 7);
    return d;
  }
  if (rentalMode === "fortnightly") {
    const days = Math.round((today.getTime() - joined.getTime()) / 86400000);
    const fortnights = Math.max(Math.ceil(days / 14), 1);
    const d = new Date(joined);
    d.setDate(joined.getDate() + fortnights * 14);
    return d;
  }
  // monthly — same day-of-month as IST join date
  const joinDay = joined.getDate();
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), joinDay);
  if (thisMonth >= today) return thisMonth;
  return new Date(today.getFullYear(), today.getMonth() + 1, joinDay);
}

async function getData(id: string) {
  const [rider, payments, assignments] = await Promise.all([
    pool.query(`
      SELECT r.*, h.hub_name, h.id AS hub_id, h.city AS hub_city,
             r.aadhaar_front_url, r.aadhaar_back_url,
             r.pan_image_url, r.dl_front_url, r.dl_back_url,
             r.bank_doc_url, r.address_map_link, r.nickname
      FROM ${schemas.ops}.riders r
      LEFT JOIN ${schemas.ops}.hubs h ON h.id = r.assigned_hub_id
      WHERE r.id = $1
    `, [id]),

    pool.query(`
      SELECT rp.amount_collected, rp.payment_date, rp.rental_period_start, rp.rental_period_end, v.ev_number
      FROM ${schemas.ops}.rider_payments rp
      LEFT JOIN ${schemas.ops}.vehicles v ON v.id = rp.vehicle_id
      WHERE rp.rider_id = $1
      ORDER BY rp.payment_date DESC
    `, [id]),

    pool.query(`
      SELECT rva.assigned_date, rva.status AS assignment_status,
             v.ev_number, v.id AS vehicle_id,
             m.model_name, m.oem
      FROM ${schemas.ops}.rider_vehicle_assignments rva
      JOIN ${schemas.ops}.vehicles v ON v.id = rva.vehicle_id
      LEFT JOIN ${schemas.ops}.vehicle_models m ON m.id = v.model_id
      WHERE rva.rider_id = $1
      ORDER BY rva.assigned_date DESC
    `, [id]),
  ]);

  if (!rider.rows[0]) return null;

  const totalCollected = payments.rows.reduce(
    (sum: number, p: { amount_collected: number }) => sum + Number(p.amount_collected), 0
  );

  return { rider: rider.rows[0], payments: payments.rows, assignments: assignments.rows, totalCollected };
}

const statusColor: Record<string, string> = {
  active: "bg-green-500/20 text-green-400",
  inactive: "bg-gray-500/20 text-gray-400",
  pending: "bg-yellow-500/20 text-yellow-400",
  suspended: "bg-red-500/20 text-red-400",
};

export default async function RiderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, session] = await Promise.all([getData(id), getSession()]);
  if (!data) notFound();

  const { rider, payments, assignments, totalCollected } = data;
  const activeAssignment = assignments.find((a: { assignment_status: string }) => a.assignment_status === "active");

  const periodLen = rider.rental_mode === "weekly" ? 7 : rider.rental_mode === "fortnightly" ? 14 : 30;
  const todayIST = toISTMidnight(new Date());

  // Next due date
  const nextDueDate = rider.status === "active" && rider.rental_mode
    ? calcNextDueDate(rider.created_at, rider.rental_mode)
    : null;
  const nextDueDaysLeft = nextDueDate
    ? Math.round((nextDueDate.getTime() - todayIST.getTime()) / 86400000)
    : null;
  const periodEndStr = nextDueDate ? nextDueDate.toISOString().split("T")[0] : null;
  const periodStartStr = nextDueDate
    ? new Date(nextDueDate.getTime() - periodLen * 86400000).toISOString().split("T")[0]
    : null;
  // Find the actual payment object for the current period, then check if it's full or partial
  const currentPeriodPayment = periodStartStr != null
    ? payments.find((p: { rental_period_start: string; amount_collected: number }) =>
        p.rental_period_start != null && p.rental_period_start >= periodStartStr!)
    : undefined;
  const currentPeriodPaid = !!currentPeriodPayment && Number(currentPeriodPayment.amount_collected) >= EXPECTED_RENT;
  const currentPeriodPartial = !!currentPeriodPayment && Number(currentPeriodPayment.amount_collected) < EXPECTED_RENT;
  const currentPeriodBalance = currentPeriodPartial ? EXPECTED_RENT - Number(currentPeriodPayment!.amount_collected) : 0;

  // Last (overdue) due date — only exists if past due and no full payment
  const lastDueDate = rider.status === "active" && rider.rental_mode
    ? calcLastDueDate(rider.created_at, rider.rental_mode)
    : null;
  const lastDuePeriodEndStr = lastDueDate ? lastDueDate.toISOString().split("T")[0] : null;
  const lastDuePeriodStartStr = lastDueDate
    ? new Date(lastDueDate.getTime() - periodLen * 86400000).toISOString().split("T")[0]
    : null;
  // A period is paid only if a full payment (>= EXPECTED_RENT) exists for it
  const lastPeriodFullPayment = lastDuePeriodStartStr != null
    ? payments.find((p: { rental_period_start: string; amount_collected: number }) =>
        p.rental_period_start != null && p.rental_period_start >= lastDuePeriodStartStr! && Number(p.amount_collected) >= EXPECTED_RENT)
    : undefined;
  const lastPeriodPartialPayment = lastDuePeriodStartStr != null && !lastPeriodFullPayment
    ? payments.find((p: { rental_period_start: string; amount_collected: number }) =>
        p.rental_period_start != null && p.rental_period_start >= lastDuePeriodStartStr! && Number(p.amount_collected) < EXPECTED_RENT)
    : undefined;
  const isOverdueUnpaid = lastDueDate !== null && !lastPeriodFullPayment;
  const lastDuePeriodPartialAmt = isOverdueUnpaid && lastPeriodPartialPayment ? Number(lastPeriodPartialPayment.amount_collected) : null;
  const lastDuePeriodBalance = lastDuePeriodPartialAmt != null ? EXPECTED_RENT - lastDuePeriodPartialAmt : null;
  const lastDueDaysOverdue = lastDueDate
    ? Math.round((todayIST.getTime() - lastDueDate.getTime()) / 86400000)
    : 0;

  return (
    <DashboardLayout allowedRoles={["admin", "ops_manager", "hub_incharge"]}>
      <div className="space-y-6">

        <div className="flex items-center gap-3">
          <BackButton fallback="/riders" label="Riders" />
          <span className="text-[#333]">/</span>
          <span className="text-white text-sm">{rider.name}</span>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            {rider.profile_photo_url ? (
              <a href={`/api/file?key=${encodeURIComponent(rider.profile_photo_url)}`} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/file?key=${encodeURIComponent(rider.profile_photo_url)}`} alt={rider.name} className="w-16 h-16 rounded-xl object-cover border border-white/10" />
              </a>
            ) : (
              <div className="w-16 h-16 rounded-xl bg-[#1e1e2e] flex items-center justify-center text-2xl font-bold text-[#6C5CE7]">
                {rider.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-white text-2xl font-bold">{rider.name}</h1>
                {rider.rider_code && (
                  <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-full bg-[#6C5CE7]/15 text-[#6C5CE7]">{rider.rider_code}</span>
                )}
                {rider.is_blacklisted && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/20 text-red-400">Blacklisted</span>
                )}
              </div>
              <p className="text-[#666] text-sm mt-1">
                {rider.mobile} · {rider.rental_mode ?? "—"}
                {rider.employer ? <span> · <span className="text-[#aaa]">{rider.employer}</span></span> : ""}
              </p>
            </div>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium capitalize shrink-0 ${statusColor[rider.status] ?? "bg-gray-500/20 text-gray-400"}`}>{rider.status}</span>
        </div>

        <BlacklistButton
          riderId={rider.id}
          isBlacklisted={!!rider.is_blacklisted}
          blacklistReason={rider.blacklist_reason}
          blacklistedBy={rider.blacklisted_by}
          blacklistedAt={rider.blacklisted_at}
          role={session?.role ?? ""}
        />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Collected", value: "₹" + Number(totalCollected).toLocaleString(), color: "#00D1B2" },
            { label: "Onboarding Fee", value: "₹" + Number(rider.onboarding_fee || 0).toLocaleString(), color: "#6C5CE7" },
            { label: "Security Deposit", value: "₹" + Number(rider.security_deposit || 0).toLocaleString(), color: "#fdcb6e" },
            { label: "Payments Made", value: payments.length.toString(), color: "#a29bfe" },
          ].map((c) => (
            <div key={c.label} className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-5">
              <p className="text-[11px] text-[#555] uppercase tracking-wider mb-2">{c.label}</p>
              <p className="text-2xl font-bold" style={{ color: c.color }}>{c.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-5 space-y-3">
            <h2 className="text-white font-semibold mb-4">Rider Details</h2>
            {[
              { label: "Mobile", value: rider.mobile },
              { label: "Employer", value: rider.employer ?? "—" },
              { label: "Aadhaar", value: rider.aadhaar ? "XXXX XXXX " + rider.aadhaar.slice(-4) : "—" },
              { label: "PAN", value: rider.pan ?? "—" },
              { label: "DL Number", value: rider.dl_number ?? "—" },
              { label: "Bank", value: rider.bank ?? "—" },
              { label: "IFSC", value: rider.ifsc ?? "—" },
              { label: "Account", value: rider.account_number ? "XXXX" + rider.account_number.slice(-4) : "—" },
              { label: "Current Address", value: rider.current_address ?? "—" },
              { label: "Permanent Address", value: rider.permanent_address ?? "—" },
            ].map((row) => (
              <div key={row.label} className="flex justify-between py-2 border-b border-[#1e1e2e] last:border-0">
                <span className="text-[#555] text-sm">{row.label}</span>
                <span className="text-[#ccc] text-sm text-right max-w-xs">{row.value}</span>
              </div>
            ))}

            {/* Family & Local references */}
            {(rider.family_ref_name || rider.local_ref_name) && (
              <div className="pt-3">
                <p className="text-[#555] text-xs uppercase tracking-wider mb-2">References</p>
                {rider.family_ref_name && (
                  <div className="flex justify-between py-2 border-b border-[#1e1e2e]">
                    <span className="text-[#555] text-sm">Family Ref</span>
                    <span className="text-[#ccc] text-sm text-right">{rider.family_ref_name} · {rider.family_ref_mobile ?? "—"}</span>
                  </div>
                )}
                {rider.local_ref_name && (
                  <div className="flex justify-between py-2 border-b border-[#1e1e2e] last:border-0">
                    <span className="text-[#555] text-sm">Local Ref</span>
                    <span className="text-[#ccc] text-sm text-right">{rider.local_ref_name} · {rider.local_ref_mobile ?? "—"}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-5">
              <h2 className="text-white font-semibold mb-4">Hub</h2>
              {rider.hub_id ? (
                <Link href={`/hubs/${rider.hub_id}`} className="flex items-center justify-between group">
                  <div>
                    <p className="text-[#6C5CE7] font-medium group-hover:underline">{rider.hub_name}</p>
                    <p className="text-[#555] text-xs mt-0.5">{rider.hub_city}</p>
                  </div>
                  <span className="text-[#555] group-hover:text-white transition-colors">→</span>
                </Link>
              ) : <p className="text-[#555]">No hub assigned</p>}
            </div>

            <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-5">
              <h2 className="text-white font-semibold mb-4">Current Vehicle</h2>
              {activeAssignment ? (
                <Link href={`/vehicles/${activeAssignment.vehicle_id}`} className="flex items-center justify-between group">
                  <div>
                    <p className="text-[#00D1B2] font-medium group-hover:underline">{activeAssignment.ev_number}</p>
                    <p className="text-[#555] text-xs mt-0.5">{activeAssignment.model_name} · {activeAssignment.oem}</p>
                    <p className="text-[#555] text-xs">Assigned: {new Date(activeAssignment.assigned_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
                  </div>
                  <span className="text-[#555] group-hover:text-white transition-colors">→</span>
                </Link>
              ) : <p className="text-[#555]">No vehicle assigned</p>}
            </div>
          </div>
        </div>

        {/* KYC Documents */}
        <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold">KYC Documents</h2>
            {[rider.aadhaar_verified, rider.pan_verified, rider.dl_verified].every(Boolean) ? (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-[#00D1B2] bg-[#00D1B220] px-2.5 py-1 rounded-full">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                All Verified
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-[#fdcb6e] bg-[#fdcb6e20] px-2.5 py-1 rounded-full">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Pending Verification
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                label: "Aadhaar Card",
                doc: "aadhaar" as const,
                masked: rider.aadhaar ? "XXXX XXXX " + rider.aadhaar.slice(-4) : null,
                frontUrl: rider.aadhaar_front_url ?? null,
                backUrl: rider.aadhaar_back_url ?? null,
                verified: !!rider.aadhaar_verified,
                verifiedBy: rider.aadhaar_verified_by ?? null,
                verifiedAt: rider.aadhaar_verified_at ?? null,
              },
              {
                label: "PAN Card",
                doc: "pan" as const,
                masked: rider.pan ?? null,
                frontUrl: rider.pan_image_url ?? null,
                backUrl: null,
                verified: !!rider.pan_verified,
                verifiedBy: rider.pan_verified_by ?? null,
                verifiedAt: rider.pan_verified_at ?? null,
              },
              {
                label: "Driving Licence",
                doc: "dl" as const,
                masked: rider.dl_number ?? null,
                frontUrl: rider.dl_front_url ?? null,
                backUrl: rider.dl_back_url ?? null,
                verified: !!rider.dl_verified,
                verifiedBy: rider.dl_verified_by ?? null,
                verifiedAt: rider.dl_verified_at ?? null,
              },
            ].map((d) => (
              <div key={d.label} className={`border rounded-xl p-4 transition-colors ${d.verified ? "border-[#00D1B230]" : "border-[#fdcb6e30]"}`}>
                <p className="text-[#555] text-xs uppercase tracking-wider mb-2">{d.label}</p>
                {d.masked ? (
                  <p className="text-[#ccc] text-sm font-mono mb-2">{d.masked}</p>
                ) : (
                  <p className="text-[#444] text-sm mb-2">Not provided</p>
                )}
                <div className="flex flex-col gap-1 mb-1">
                  {d.frontUrl ? (
                    <a href={d.frontUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-[#6C5CE7] hover:underline">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      View Front
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs text-[#333]">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      No front image
                    </span>
                  )}
                  {d.backUrl !== undefined && (d.backUrl ? (
                    <a href={d.backUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-[#6C5CE7] hover:underline">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      View Back
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs text-[#333]">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      No back image
                    </span>
                  ))}
                </div>
                <KycVerifyButton
                  riderId={rider.id}
                  document={d.doc}
                  initialVerified={d.verified}
                  initialVerifiedBy={d.verifiedBy}
                  initialVerifiedAt={d.verifiedAt}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#1e1e2e]">
            <h2 className="text-white font-semibold">Payment History</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e1e2e]">
                  {["Date", "Amount", "Vehicle", "Status"].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-[11px] text-[#555] uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Overdue unpaid row */}
                {isOverdueUnpaid && lastDueDate && lastDuePeriodStartStr && lastDuePeriodEndStr && (
                  <tr className="border-b border-[#1a1a2a] bg-red-500/[0.04]">
                    <td className="px-5 py-3 text-[#aaa]">
                      {lastDueDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-5 py-3">
                      {lastDuePeriodPartialAmt != null ? (
                        <div className="text-xs leading-tight">
                          <span className="text-orange-400 font-semibold">₹{lastDuePeriodPartialAmt.toLocaleString()} paid</span>
                          <span className="block text-red-400">₹{lastDuePeriodBalance!.toLocaleString()} due</span>
                        </div>
                      ) : <span className="text-[#555]">—</span>}
                    </td>
                    <td className="px-5 py-3 text-[#6C5CE7]">{activeAssignment?.ev_number ?? "—"}</td>
                    <td className="px-5 py-3">
                      <RentMarkPaid
                        riderId={rider.id}
                        periodStart={lastDuePeriodStartStr}
                        periodEnd={lastDuePeriodEndStr}
                        daysLeft={-lastDueDaysOverdue}
                        defaultAmount={lastDuePeriodBalance ?? undefined}
                      />
                    </td>
                  </tr>
                )}
                {/* Next due row */}
                {nextDueDate && nextDueDaysLeft !== null && periodStartStr && periodEndStr && (
                  <tr className="border-b border-[#1a1a2a] bg-white/[0.01]">
                    <td className="px-5 py-3 text-[#aaa]">
                      {nextDueDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-5 py-3">
                      {currentPeriodPartial ? (
                        <div className="text-xs leading-tight">
                          <span className="text-orange-400 font-semibold">₹{Number(currentPeriodPayment!.amount_collected).toLocaleString()} paid</span>
                          <span className="block text-red-400">₹{currentPeriodBalance.toLocaleString()} due</span>
                        </div>
                      ) : <span className="text-[#555]">—</span>}
                    </td>
                    <td className="px-5 py-3 text-[#6C5CE7]">{activeAssignment?.ev_number ?? "—"}</td>
                    <td className="px-5 py-3">
                      {currentPeriodPaid ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-500/15 text-green-400">
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                          Paid
                        </span>
                      ) : (
                        <RentMarkPaid
                          riderId={rider.id}
                          periodStart={periodStartStr}
                          periodEnd={periodEndStr}
                          daysLeft={nextDueDaysLeft}
                          defaultAmount={currentPeriodPartial ? currentPeriodBalance : undefined}
                        />
                      )}
                    </td>
                  </tr>
                )}
                {/* Past payments */}
                {payments.length === 0 && !nextDueDate ? (
                  <tr><td colSpan={4} className="px-5 py-8 text-center text-[#555]">No payments yet</td></tr>
                ) : payments.map((p: { payment_date: string; amount_collected: number; ev_number: string }, i: number) => {
                  const amt = Number(p.amount_collected);
                  const isPartial = amt < EXPECTED_RENT;
                  const balance = isPartial ? EXPECTED_RENT - amt : 0;
                  return (
                    <tr key={i} className="border-b border-[#1a1a2a]">
                      <td className="px-5 py-3 text-[#aaa]">{new Date(p.payment_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
                      <td className="px-5 py-3">
                        <span className={`font-semibold ${isPartial ? "text-orange-400" : "text-[#00D1B2]"}`}>₹{amt.toLocaleString()}</span>
                        {isPartial && <span className="block text-red-400 text-xs">₹{balance.toLocaleString()} remaining</span>}
                      </td>
                      <td className="px-5 py-3 text-[#6C5CE7]">{p.ev_number ?? "—"}</td>
                      <td className="px-5 py-3">
                        {isPartial ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-orange-500/15 text-orange-400">Partial</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-500/15 text-green-400">
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                            Paid
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}
