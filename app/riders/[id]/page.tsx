import { notFound } from "next/navigation";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import KycVerifyButton from "@/components/riders/KycVerifyButton";
import BackButton from "@/components/BackButton";
import BlacklistButton from "@/components/riders/BlacklistButton";
import RecordPayment from "@/components/riders/RecordPayment";
import ChangeRate from "@/components/riders/ChangeRate";
import ApplyWaiver from "@/components/riders/ApplyWaiver";
import PhotoGallery from "@/components/PhotoGallery";
import { getRiderCycle, nextDueSql } from "@/lib/rent";
import RiderPenalties from "@/components/riders/RiderPenalties";
import ExportButton from "@/components/ExportButton";
import { maskPan, maskAccount, maskDl } from "@/lib/mask";
import { getSession } from "@/lib/auth";
import { inr, dateIN } from "@/lib/format";

function toISTMidnight(d: Date): Date {
  // Returns a Date whose y/m/d components (in local time) match the IST date of d
  const s = d.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
  const [datePart] = s.split(",");
  const [m, day, y] = datePart.split("/").map(Number);
  return new Date(y, m - 1, day); // local midnight = UTC midnight on server
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
      SELECT rva.id AS assignment_id, rva.assigned_date, rva.status AS assignment_status,
             rva.daily_rent, to_char(rva.paid_through_date, 'YYYY-MM-DD') AS paid_through_date,
             to_char(${nextDueSql("rva")}, 'YYYY-MM-DD') AS next_due_date,
             rva.allotment_code,
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
  active: "bg-accent-success/20 text-accent-success-text",
  inactive: "bg-muted/20 text-muted",
  pending: "bg-accent-warning/20 text-accent-warning-text",
  suspended: "bg-accent-danger-alt/20 text-accent-danger-alt-text",
};

export default async function RiderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, session] = await Promise.all([getData(id), getSession()]);
  if (!data) notFound();

  const { rider, payments, assignments, totalCollected } = data;
  const activeAssignment = assignments.find((a: { assignment_status: string }) => a.assignment_status === "active");
  const cycle = await getRiderCycle(rider.id); // unbroken weekly ledger (no gaps; stops at return)

  const todayIST = toISTMidnight(new Date());

  return (
    <DashboardLayout allowedRoles={["admin", "ops_manager", "hub_incharge"]}>
      <div className="space-y-6">

        <div className="flex items-center gap-3">
          <BackButton fallback="/riders" label="Riders" />
          <span className="text-faint">/</span>
          <span className="text-primary text-sm">{rider.name}</span>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            {rider.profile_photo_url ? (
              <a href={`/api/file?key=${encodeURIComponent(rider.profile_photo_url)}`} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/file?key=${encodeURIComponent(rider.profile_photo_url)}`} alt={rider.name} className="w-16 h-16 rounded-xl object-cover border border-default" />
              </a>
            ) : (
              <div className="w-16 h-16 rounded-xl bg-default flex items-center justify-center text-2xl font-bold text-accent-purple">
                {rider.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-primary text-2xl font-bold">{rider.name}</h1>
                {rider.rider_code && (
                  <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-full bg-accent-purple/15 text-accent-purple">{rider.rider_code}</span>
                )}
                {rider.is_blacklisted && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-accent-danger-alt/20 text-accent-danger-alt-text">Blacklisted</span>
                )}
              </div>
              <p className="text-muted text-sm mt-1">
                {rider.mobile} · {rider.rental_mode ?? "—"}
                {rider.employer ? <span> · <span className="text-secondary">{rider.employer}</span></span> : ""}
              </p>
            </div>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium capitalize shrink-0 ${statusColor[rider.status] ?? "bg-muted/20 text-muted"}`}>{rider.status}</span>
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
            { label: "Total Collected", value: inr(totalCollected), color: "var(--accent-teal)" },
            { label: "Onboarding Fee", value: inr(rider.onboarding_fee || 0), color: "var(--accent-purple)" },
            { label: "Security Deposit", value: inr(rider.security_deposit || 0), color: "var(--accent-warning)" },
            { label: "Payments Made", value: payments.length.toString(), color: "var(--accent-purple-2)" },
          ].map((c) => (
            <div key={c.label} className="bg-surface border border-default rounded-xl p-5">
              <p className="text-[11px] text-muted uppercase tracking-wider mb-2">{c.label}</p>
              <p className="text-2xl font-bold" style={{ color: c.color }}>{c.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-surface border border-default rounded-xl p-5 space-y-3">
            <h2 className="text-primary font-semibold mb-4">Rider Details</h2>
            {[
              { label: "Onboarded", value: rider.created_at ? dateIN(rider.created_at, { day: "numeric", month: "short", year: "numeric" }) : "—" },
              { label: "Mobile", value: rider.mobile },
              { label: "Employer", value: rider.employer ?? "—" },
              { label: "Aadhaar", value: rider.aadhaar ? "XXXX XXXX " + rider.aadhaar.slice(-4) : "—" },
              { label: "PAN", value: maskPan(rider.pan) },
              { label: "DL Number", value: maskDl(rider.dl_number) },
              { label: "Bank", value: rider.bank ?? "—" },
              { label: "IFSC", value: rider.ifsc ?? "—" },
              { label: "Account", value: maskAccount(rider.account_number) },
              { label: "Current Address", value: rider.current_address ?? "—" },
              { label: "Permanent Address", value: rider.permanent_address ?? "—" },
            ].map((row) => (
              <div key={row.label} className="flex justify-between py-2 border-b border-default last:border-0">
                <span className="text-muted text-sm">{row.label}</span>
                <span className="text-secondary text-sm text-right max-w-xs">{row.value}</span>
              </div>
            ))}

            {/* Family & Local references */}
            {(rider.family_ref_name || rider.local_ref_name) && (
              <div className="pt-3">
                <p className="text-muted text-xs uppercase tracking-wider mb-2">References</p>
                {rider.family_ref_name && (
                  <div className="flex justify-between py-2 border-b border-default">
                    <span className="text-muted text-sm">Family Ref</span>
                    <span className="text-secondary text-sm text-right">{rider.family_ref_name} · {rider.family_ref_mobile ?? "—"}</span>
                  </div>
                )}
                {rider.local_ref_name && (
                  <div className="flex justify-between py-2 border-b border-default last:border-0">
                    <span className="text-muted text-sm">Local Ref</span>
                    <span className="text-secondary text-sm text-right">{rider.local_ref_name} · {rider.local_ref_mobile ?? "—"}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="bg-surface border border-default rounded-xl p-5">
              <h2 className="text-primary font-semibold mb-4">Hub</h2>
              {rider.hub_id ? (
                <Link href={`/hubs/${rider.hub_id}`} className="flex items-center justify-between group">
                  <div>
                    <p className="text-accent-purple font-medium group-hover:underline">{rider.hub_name}</p>
                    <p className="text-muted text-xs mt-0.5">{rider.hub_city}</p>
                  </div>
                  <span className="text-muted group-hover:text-primary transition-colors">→</span>
                </Link>
              ) : <p className="text-muted">No hub assigned</p>}
            </div>

            <div className="bg-surface border border-default rounded-xl p-5">
              <h2 className="text-primary font-semibold mb-4">Current Vehicle</h2>
              {activeAssignment ? (
                <Link href={`/vehicles/${activeAssignment.vehicle_id}`} className="flex items-center justify-between group">
                  <div>
                    <p className="text-accent-teal font-medium group-hover:underline">{activeAssignment.ev_number}</p>
                    <p className="text-muted text-xs mt-0.5">{activeAssignment.model_name} · {activeAssignment.oem}</p>
                    {activeAssignment.allotment_code && <p className="text-muted text-xs">Allotment ID: {activeAssignment.allotment_code}</p>}
                    <p className="text-muted text-xs">Assigned: {dateIN(activeAssignment.assigned_date, { day: "numeric", month: "short", year: "numeric" })}</p>
                  </div>
                  <span className="text-muted group-hover:text-primary transition-colors">→</span>
                </Link>
              ) : <p className="text-muted">No vehicle assigned</p>}
            </div>
          </div>
        </div>

        {/* KYC Documents */}
        <div className="bg-surface border border-default rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-primary font-semibold">KYC Documents</h2>
            {[rider.aadhaar_verified, rider.pan_verified, rider.dl_verified].every(Boolean) ? (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-accent-teal bg-accent-teal/13 px-2.5 py-1 rounded-full">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                All Verified
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-accent-warning bg-accent-warning/13 px-2.5 py-1 rounded-full">
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
              <div key={d.label} className={`border rounded-xl p-4 transition-colors ${d.verified ? "border-accent-teal/19" : "border-accent-warning/19"}`}>
                <p className="text-muted text-xs uppercase tracking-wider mb-2">{d.label}</p>
                {d.masked ? (
                  <p className="text-secondary text-sm font-mono mb-2">{d.masked}</p>
                ) : (
                  <p className="text-faint text-sm mb-2">Not provided</p>
                )}
                <div className="flex flex-col gap-1 mb-1">
                  {d.frontUrl ? (
                    <a href={d.frontUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-accent-purple hover:underline">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      View Front
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs text-faint">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      No front image
                    </span>
                  )}
                  {d.backUrl !== undefined && (d.backUrl ? (
                    <a href={d.backUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-accent-purple hover:underline">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      View Back
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs text-faint">
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

        <PhotoGallery title="Additional Photos" accent="var(--accent-purple)" photos={rider.additional_photos} />

        {/* Rent cycle — full unbroken weekly ledger (no gaps; stops at return) */}
        <div className="bg-surface border border-default rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-default flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-primary font-semibold">Rent Cycle</h2>
              {activeAssignment?.paid_through_date && (
                <p className="text-[11px] mt-0.5">
                  <span className="text-accent-teal">
                    Paid through {dateIN(activeAssignment.paid_through_date, { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                  {activeAssignment.next_due_date && (
                    <span className="text-accent-warning-text">
                      {" "}· Next due {dateIN(activeAssignment.next_due_date, { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  )}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-muted">{cycle.length} week{cycle.length !== 1 ? "s" : ""} · shown until the bike is returned</span>
              <ExportButton filename={`rent-cycle-${rider.rider_code ?? rider.mobile}`} rows={cycle} columns={[
                { label: "Week", key: "week_no" }, { label: "Period start", key: "period_start" }, { label: "Period end", key: "period_end" },
                { label: "Due date", key: "due_date" }, { label: "Vehicle", key: "ev_number" }, { label: "Rent", key: "amount" },
                { label: "Paid", key: "paid" }, { label: "Status", key: "status" },
              ]} />
              {activeAssignment && (
                <>
                  <ChangeRate assignmentId={activeAssignment.assignment_id} currentRate={activeAssignment.daily_rent ? Number(activeAssignment.daily_rent) : null} />
                  <ApplyWaiver riderId={rider.id} dailyRent={activeAssignment.daily_rent ? Number(activeAssignment.daily_rent) : null} />
                  <RecordPayment riderId={rider.id} dailyRent={activeAssignment.daily_rent ? Number(activeAssignment.daily_rent) : null} />
                </>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-default">
                  {["Week", "Period", "Due date", "Vehicle", "Rent", "Status", "Payment"].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-[11px] text-muted uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cycle.length === 0 ? (
                  <tr><td colSpan={7} className="px-5 py-8 text-center text-muted">No rent cycle yet (no allotment)</td></tr>
                ) : (() => {
                  // Running total of everything unpaid up to and including each week
                  // (chronological), so a Pending/Partial hover can show the rider's
                  // full balance — this week's rent plus any earlier shortfall.
                  const cumOutstanding: number[] = [];
                  let run = 0;
                  for (const w of cycle) { run += Math.max(Math.round(w.amount - w.paid), 0); cumOutstanding.push(run); }
                  return [...cycle].reverse().map((w, i) => {
                  const totalDue = cumOutstanding[cycle.length - 1 - i];
                  const color = w.status === "Collected" ? "bg-accent-success/15 text-accent-success-text"
                    : w.status === "Partial" ? "bg-accent-danger/15 text-accent-danger-text"
                    : w.status === "Overdue" ? "bg-accent-danger-alt/15 text-accent-danger-alt-text"
                    : "bg-accent-warning/15 text-accent-warning-text";
                  const fmtD = (s: string) => dateIN(s, { day: "numeric", month: "short" });
                  const daysLeft = Math.round((new Date(w.due_date).getTime() - todayIST.getTime()) / 86400000);
                  const balance = Math.max(Math.round(w.amount - w.paid), 0);
                  return (
                    <tr key={i} className="border-b border-subtle">
                      <td className="px-5 py-3 text-secondary">{w.week_no}</td>
                      <td className="px-5 py-3 text-secondary whitespace-nowrap">{fmtD(w.period_start)} – {fmtD(w.period_end)}</td>
                      <td className="px-5 py-3 text-secondary whitespace-nowrap">{fmtD(w.due_date)}</td>
                      <td className="px-5 py-3">{w.vehicle_id ? <Link href={`/vehicles/${w.vehicle_id}`} className="text-accent-purple hover:underline">{w.ev_number ?? "—"}</Link> : <span className="text-muted">{w.ev_number ?? "—"}</span>}</td>
                      <td className="px-5 py-3 text-primary">₹{Math.round(w.amount).toLocaleString("en-IN")}</td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        {w.status === "Partial" ? (
                          <span className={`relative group cursor-default px-2 py-0.5 rounded-full text-[11px] font-semibold ${color}`}>
                            {w.status}
                            <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 hidden group-hover:block whitespace-nowrap bg-surface border border-default rounded-lg px-3 py-1.5 text-[11px] font-normal shadow-lg z-10">
                              <span className="text-accent-teal font-semibold">₹{Math.round(w.paid).toLocaleString("en-IN")} paid</span>
                              <span className="text-muted"> · </span>
                              <span className="text-accent-danger-text font-semibold">₹{balance.toLocaleString("en-IN")} pending</span>
                              {totalDue > balance && (
                                <span className="block mt-0.5 text-secondary">Total pending incl. earlier weeks: <span className="font-semibold text-accent-danger-text">₹{totalDue.toLocaleString("en-IN")}</span></span>
                              )}
                            </span>
                          </span>
                        ) : (w.status === "Pending" || w.status === "Overdue") && totalDue > 0 ? (
                          <span className={`relative group cursor-default px-2 py-0.5 rounded-full text-[11px] font-semibold ${color}`}>
                            {w.status}
                            <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 hidden group-hover:block whitespace-nowrap bg-surface border border-default rounded-lg px-3 py-1.5 text-[11px] font-normal shadow-lg z-10">
                              <span className="text-secondary">This week: <span className="font-semibold text-primary">₹{balance.toLocaleString("en-IN")}</span></span>
                              {totalDue > balance && (
                                <span className="block mt-0.5 text-secondary">Total pending incl. earlier weeks: <span className="font-semibold text-accent-danger-text">₹{totalDue.toLocaleString("en-IN")}</span></span>
                              )}
                            </span>
                          </span>
                        ) : (
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${color}`}>{w.status}</span>
                        )}
                        {w.sheet_note && (
                          <span className="relative group cursor-default ml-1.5 align-middle text-muted hover:text-primary text-[12px]">
                            📝
                            <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 hidden group-hover:block whitespace-nowrap bg-surface border border-default rounded-lg px-3 py-1.5 text-[11px] font-normal text-secondary shadow-lg z-10">
                              {w.sheet_note}
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {w.status === "Collected" ? (
                          <span className="text-accent-teal text-xs font-semibold">₹{Math.round(w.paid).toLocaleString("en-IN")} paid</span>
                        ) : w.status === "Partial" ? (
                          <span className="text-accent-danger-text text-xs font-semibold">₹{Math.round(w.paid).toLocaleString("en-IN")} of ₹{Math.round(w.amount).toLocaleString("en-IN")}</span>
                        ) : (
                          <span className="text-[11px]" style={{ color: daysLeft < 0 ? "var(--accent-danger-alt-text)" : daysLeft <= 2 ? "var(--accent-warning-text)" : "var(--text-muted)" }}>
                            {daysLeft < 0 ? `Overdue ${Math.abs(daysLeft)}d` : daysLeft === 0 ? "Due today" : `Due in ${daysLeft}d`} · ₹{balance.toLocaleString("en-IN")}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>

        {/* Payment History — actual collections received (money ledger), newest first.
            Distinct from the Rent Cycle above, which is the per-week dues view. */}
        <div className="bg-surface border border-default rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-default flex items-center justify-between">
            <h2 className="text-primary font-semibold">Payment History</h2>
            <span className="text-[11px] text-muted">{payments.length} payment{payments.length !== 1 ? "s" : ""} · {inr(totalCollected)} collected</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-default">
                  {["Date Received", "Amount", "Period Covered", "Vehicle"].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-[11px] text-muted uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 ? (
                  <tr><td colSpan={4} className="px-5 py-8 text-center text-muted">No payments recorded yet</td></tr>
                ) : payments.map((p: { payment_date: string; amount_collected: number; rental_period_start: string | null; rental_period_end: string | null; ev_number: string | null }, i: number) => (
                  <tr key={i} className="border-b border-subtle">
                    <td className="px-5 py-3 text-secondary whitespace-nowrap">{dateIN(p.payment_date, { day: "numeric", month: "short", year: "numeric" })}</td>
                    <td className="px-5 py-3 text-accent-teal font-semibold whitespace-nowrap">{inr(Math.round(Number(p.amount_collected)))}</td>
                    <td className="px-5 py-3 text-secondary whitespace-nowrap">
                      {p.rental_period_start && p.rental_period_end
                        ? `${dateIN(p.rental_period_start, { day: "numeric", month: "short" })} – ${dateIN(p.rental_period_end, { day: "numeric", month: "short" })}`
                        : "—"}
                    </td>
                    <td className="px-5 py-3 text-secondary">{p.ev_number ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Penalties — per-rider, raised at submission or ad-hoc */}
        <RiderPenalties riderId={rider.id} />

      </div>
    </DashboardLayout>
  );
}
