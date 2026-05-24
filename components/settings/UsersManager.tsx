"use client";

import { useState, useEffect } from "react";

type User = {
  id: string;
  name: string;
  email: string;
  mobile: string;
  role: string;
  status: string;
  created_at: string;
};

const ROLES = ["admin", "ops_manager", "hub_incharge", "investor"];

const roleLabel: Record<string, string> = {
  admin: "Admin",
  ops_manager: "Ops Manager",
  hub_incharge: "Hub Incharge",
  investor: "Investor",
};

const roleColor: Record<string, string> = {
  admin: "bg-[#e1705520] text-[#e17055]",
  ops_manager: "bg-[#6C5CE720] text-[#6C5CE7]",
  hub_incharge: "bg-[#fdcb6e20] text-[#fdcb6e]",
  investor: "bg-[#00D1B220] text-[#00D1B2]",
};

const statusColor: Record<string, string> = {
  active: "bg-green-500/20 text-green-400",
  inactive: "bg-gray-500/20 text-gray-400",
  suspended: "bg-red-500/20 text-red-400",
};

const emptyForm = { name: "", email: "", mobile: "", password: "", role: "ops_manager" };

export default function UsersManager() {
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
    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    if (res.ok) {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
    }
  }

  async function handleStatusToggle(userId: string, current: string) {
    const next = current === "active" ? "inactive" : "active";
    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (res.ok) {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, status: next } : u)));
    }
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold">Settings</h1>
          <p className="text-[#666] text-sm mt-1">Manage team members and their access levels</p>
        </div>
        <button
          onClick={() => { setShowAdd(!showAdd); setFormError(""); }}
          className="flex items-center gap-2 bg-[#00C48C] hover:bg-[#00E0A0] text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
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
            <div key={r} className="bg-[#12121A] border border-[#1e1e2e] rounded-xl px-4 py-3">
              <p className="text-[11px] text-[#555] uppercase tracking-wider mb-1">{roleLabel[r]}</p>
              <p className={`text-xl font-bold ${roleColor[r].split(" ")[1]}`}>{count}</p>
            </div>
          );
        })}
      </div>

      {/* Add User form */}
      {showAdd && (
        <div className="bg-[#12121A] border border-[#00C48C30] rounded-xl p-5">
          <h2 className="text-white font-semibold mb-4">New Team Member</h2>
          <form onSubmit={handleAddUser} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { key: "name", label: "Full Name", type: "text", placeholder: "Rahul Sharma" },
              { key: "email", label: "Email", type: "email", placeholder: "rahul@movegrid.in" },
              { key: "mobile", label: "Mobile", type: "text", placeholder: "+91 9876543210" },
            ].map((f) => (
              <div key={f.key}>
                <label className="block text-xs text-[#555] uppercase tracking-wider mb-1.5">{f.label}</label>
                <input
                  type={f.type}
                  value={form[f.key as keyof typeof form]}
                  onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                  required
                  placeholder={f.placeholder}
                  className="w-full bg-[#0A0A0F] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#00C48C] transition-colors"
                />
              </div>
            ))}

            <div>
              <label className="block text-xs text-[#555] uppercase tracking-wider mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                  required
                  placeholder="••••••••"
                  className="w-full bg-[#0A0A0F] border border-white/10 rounded-xl px-4 py-2.5 pr-10 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#00C48C] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
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
              <label className="block text-xs text-[#555] uppercase tracking-wider mb-1.5">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
                className="w-full bg-[#0A0A0F] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#00C48C] transition-colors"
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
                className="flex-1 py-2.5 rounded-xl bg-[#00C48C] hover:bg-[#00E0A0] text-white text-sm font-semibold disabled:opacity-60 transition-colors"
              >
                {submitting ? "Creating..." : "Create User"}
              </button>
              <button
                type="button"
                onClick={() => { setShowAdd(false); setFormError(""); }}
                className="px-4 py-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
          {formError && <p className="text-red-400 text-sm mt-3">{formError}</p>}
        </div>
      )}

      {/* Users table */}
      <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1e1e2e] flex items-center justify-between">
          <h2 className="text-white font-semibold">Team Members ({users.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e1e2e]">
                {["Member", "Email", "Mobile", "Role", "Status", "Created", "Actions"].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-[#555] uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-[#555]">Loading...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-[#555]">No users found</td></tr>
              ) : users.map((user) => (
                <tr key={user.id} className="border-b border-[#1a1a2a] hover:bg-white/[0.02]">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-[#00C48C]/20 flex items-center justify-center text-[#00C48C] text-xs font-bold shrink-0">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-white font-medium whitespace-nowrap">{user.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-[#aaa] text-xs">{user.email}</td>
                  <td className="px-5 py-3.5 text-[#aaa] text-xs whitespace-nowrap">{user.mobile}</td>
                  <td className="px-5 py-3.5">
                    {editingRole === user.id ? (
                      <select
                        defaultValue={user.role}
                        autoFocus
                        onBlur={() => setEditingRole(null)}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                        className="bg-[#0A0A0F] border border-[#00C48C] rounded-lg px-2 py-1 text-white text-xs focus:outline-none"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{roleLabel[r]}</option>
                        ))}
                      </select>
                    ) : (
                      <button
                        onClick={() => setEditingRole(user.id)}
                        title="Click to change role"
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap hover:opacity-75 transition-opacity ${roleColor[user.role] ?? "bg-gray-500/20 text-gray-400"}`}
                      >
                        {roleLabel[user.role] ?? user.role}
                      </button>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold capitalize whitespace-nowrap ${statusColor[user.status] ?? "bg-gray-500/20 text-gray-400"}`}>
                      {user.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-[#555] text-xs whitespace-nowrap">
                    {new Date(user.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-5 py-3.5">
                    <button
                      onClick={() => handleStatusToggle(user.id, user.status)}
                      className={`text-xs font-medium transition-colors whitespace-nowrap ${user.status === "active" ? "text-[#555] hover:text-red-400" : "text-[#555] hover:text-green-400"}`}
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
