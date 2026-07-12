"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/Confirm";

type User = {
  id: string;
  name: string;
  email: string;
  mobile: string;
  role: string;
  status: string;
  created_at: string;
  can_approve_rent_waivers: boolean;
};

const ROLES = ["admin", "ops_manager", "hub_incharge", "investor"];

const roleLabel: Record<string, string> = {
  admin: "Admin",
  ops_manager: "Ops Manager",
  hub_incharge: "Hub Incharge",
  investor: "Investor",
};

const roleColor: Record<string, string> = {
  admin: "bg-accent-danger/13 text-accent-danger",
  ops_manager: "bg-accent-purple/13 text-accent-purple",
  hub_incharge: "bg-accent-warning/13 text-accent-warning",
  investor: "bg-accent-teal/13 text-accent-teal",
};

const statusColor: Record<string, string> = {
  active: "bg-accent-success/20 text-accent-success-text",
  inactive: "bg-muted/20 text-muted",
  suspended: "bg-accent-danger-alt/20 text-accent-danger-alt-text",
};

const emptyForm = { name: "", email: "", mobile: "", password: "", role: "ops_manager" };

export default function UsersManager() {
  const toast = useToast();
  const confirm = useConfirm();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [editingRole, setEditingRole] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then(setUsers)
      .finally(() => setLoading(false));
  }, []);

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError("");
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Failed to create user");
        return;
      }
      setUsers((prev) => [data, ...prev]);
      setForm(emptyForm);
      setShowAdd(false);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRoleChange(userId: string, newRole: string) {
    setEditingRole(null);
    const u = users.find((x) => x.id === userId);
    const ok = await confirm({
      title: "Change this user's role?",
      message: `${u?.name ?? "This user"} will become "${newRole}" and be signed out so the new access takes effect.`,
      confirmLabel: "Change role",
    });
    if (!ok) return;
    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    if (res.ok) {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
      toast.show("Role updated", "success");
    } else {
      const msg = await res.json().catch(() => ({}));
      toast.show(msg.error || "Couldn't update role", "error");
    }
  }

  async function handleStatusToggle(userId: string, current: string) {
    const next = current === "active" ? "inactive" : "active";
    if (next === "inactive") {
      const u = users.find((x) => x.id === userId);
      const ok = await confirm({
        title: "Deactivate this user?",
        message: `${u?.name ?? "This user"} will be signed out and lose access immediately.`,
        confirmLabel: "Deactivate",
        danger: true,
      });
      if (!ok) return;
    }
    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (res.ok) {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, status: next } : u)));
      toast.show(next === "active" ? "User activated" : "User deactivated", "success");
    } else {
      const msg = await res.json().catch(() => ({}));
      toast.show(msg.error || "Couldn't update user", "error");
    }
  }

  async function handleWaiverToggle(userId: string, current: boolean) {
    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ can_approve_rent_waivers: !current }),
    });
    if (res.ok) {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, can_approve_rent_waivers: !current } : u)));
      toast.show("Permission updated", "success");
    } else {
      const msg = await res.json().catch(() => ({}));
      toast.show(msg.error || "Couldn't update permission", "error");
    }
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-primary text-2xl font-bold">Settings</h1>
          <p className="text-muted text-sm mt-1">Manage team members and their access levels</p>
        </div>
        <button
          onClick={() => { setShowAdd(!showAdd); setFormError(""); }}
          className="flex items-center gap-2 bg-accent-success hover:bg-accent-success text-primary text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add User
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {ROLES.map((r) => {
          const count = users.filter((u) => u.role === r).length;
          return (
            <div key={r} className="bg-surface border border-default rounded-xl px-4 py-3">
              <p className="text-[11px] text-muted uppercase tracking-wider mb-1">{roleLabel[r]}</p>
              <p className={`text-xl font-bold ${roleColor[r].split(" ")[1]}`}>{count}</p>
            </div>
          );
        })}
      </div>

      {/* Add User form */}
      {showAdd && (
        <div className="bg-surface border border-accent-success/19 rounded-xl p-5">
          <h2 className="text-primary font-semibold mb-4">New Team Member</h2>
          <form onSubmit={handleAddUser} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { key: "name", label: "Full Name", type: "text", placeholder: "Rahul Sharma" },
              { key: "email", label: "Email", type: "email", placeholder: "rahul@movegrid.in" },
              { key: "mobile", label: "Mobile", type: "text", placeholder: "+91 9876543210" },
            ].map((f) => (
              <div key={f.key}>
                <label className="block text-xs text-muted uppercase tracking-wider mb-1.5">{f.label}</label>
                <input
                  type={f.type}
                  value={form[f.key as keyof typeof form]}
                  onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                  required
                  placeholder={f.placeholder}
                  className="w-full bg-base border border-default rounded-xl px-4 py-2.5 text-primary text-sm placeholder-faint focus:outline-none focus:border-accent-success transition-colors"
                />
              </div>
            ))}

            <div>
              <label className="block text-xs text-muted uppercase tracking-wider mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                  required
                  placeholder="••••••••"
                  className="w-full bg-base border border-default rounded-xl px-4 py-2.5 pr-10 text-primary text-sm placeholder-faint focus:outline-none focus:border-accent-success transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-secondary transition-colors"
                >
                  {showPassword ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs text-muted uppercase tracking-wider mb-1.5">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
                className="w-full bg-base border border-default rounded-xl px-4 py-2.5 text-primary text-sm focus:outline-none focus:border-accent-success transition-colors"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{roleLabel[r]}</option>
                ))}
              </select>
            </div>

            <div className="flex items-end gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 py-2.5 rounded-xl bg-accent-success hover:bg-accent-success text-primary text-sm font-semibold disabled:opacity-60 transition-colors"
              >
                {submitting ? "Creating..." : "Create User"}
              </button>
              <button
                type="button"
                onClick={() => { setShowAdd(false); setFormError(""); }}
                className="px-4 py-2.5 rounded-xl border border-default text-muted hover:text-primary text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
          {formError && <p className="text-accent-danger-alt-text text-sm mt-3">{formError}</p>}
        </div>
      )}

      {/* Users table */}
      <div className="bg-surface border border-default rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-default flex items-center justify-between">
          <h2 className="text-primary font-semibold">Team Members ({users.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-default">
                {["Member", "Email", "Mobile", "Role", "Status", "Approve Waivers", "Created", "Actions"].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-muted uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-muted">Loading...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-muted">No users found</td></tr>
              ) : users.map((user) => (
                <tr key={user.id} className="border-b border-subtle hover:bg-overlay-hover">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-accent-success/20 flex items-center justify-center text-accent-success text-xs font-bold shrink-0">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-primary font-medium whitespace-nowrap">{user.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-secondary text-xs">{user.email}</td>
                  <td className="px-5 py-3.5 text-secondary text-xs whitespace-nowrap">{user.mobile}</td>
                  <td className="px-5 py-3.5">
                    {editingRole === user.id ? (
                      <select
                        defaultValue={user.role}
                        autoFocus
                        onBlur={() => setEditingRole(null)}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                        className="bg-base border border-accent-success rounded-lg px-2 py-1 text-primary text-xs focus:outline-none"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{roleLabel[r]}</option>
                        ))}
                      </select>
                    ) : (
                      <button
                        onClick={() => setEditingRole(user.id)}
                        title="Click to change role"
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap hover:opacity-75 transition-opacity ${roleColor[user.role] ?? "bg-muted/20 text-muted"}`}
                      >
                        {roleLabel[user.role] ?? user.role}
                      </button>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold capitalize whitespace-nowrap ${statusColor[user.status] ?? "bg-muted/20 text-muted"}`}>
                      {user.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={user.can_approve_rent_waivers}
                        onChange={() => handleWaiverToggle(user.id, user.can_approve_rent_waivers)}
                        className="w-3.5 h-3.5 accent-accent-success"
                      />
                      <span className="text-muted text-xs">{user.can_approve_rent_waivers ? "Yes" : "No"}</span>
                    </label>
                  </td>
                  <td className="px-5 py-3.5 text-muted text-xs whitespace-nowrap">
                    {new Date(user.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-5 py-3.5">
                    <button
                      onClick={() => handleStatusToggle(user.id, user.status)}
                      className={`text-xs font-medium transition-colors whitespace-nowrap ${user.status === "active" ? "text-muted hover:text-accent-danger-alt-text" : "text-muted hover:text-accent-success-text"}`}
                    >
                      {user.status === "active" ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
