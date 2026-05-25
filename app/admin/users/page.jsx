'use client';
import Navbar from "@/components/navbar";
import Alert from "@/components/alert";
import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

/**
 * Admin users management page.
 *
 * Consumes the Stage 4 APIs:
 *   GET    /api/admin/users
 *   PATCH  /api/admin/users/[id]            (role change)
 *   POST   /api/admin/users/[id]/disable
 *   POST   /api/admin/users/[id]/enable
 *
 * Notes:
 *   - The page is also gated at the edge by middleware.js and again by
 *     the API routes via requireAdmin, so even if a non-admin somehow
 *     loaded this code in the browser they would see empty data.
 *   - We still bail early client-side on missing session for UX (avoids
 *     a flash of "Loading..." that resolves to 401).
 */

const ROLES = ['basic', 'standard', 'premium', 'admin'];
const PAGE_SIZE = 20;

export default function AdminUsersPage() {
    const router = useRouter();
    const { data: session, status: sessionStatus } = useSession();

    const [users, setUsers] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [loading, setLoading] = useState(true);

    // Filters
    const [q, setQ] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [disabledFilter, setDisabledFilter] = useState('');

    // Per-row action state
    const [busyId, setBusyId] = useState(null);

    const [showAlert, setShowAlert] = useState({ message: "", visible: false });
    const alert = (message) => {
        setShowAlert({ message, visible: true });
        setTimeout(() => setShowAlert({ message: "", visible: false }), 3000);
    };

    // Bounce non-admins
    useEffect(() => {
        if (sessionStatus === 'unauthenticated') {
            router.push('/auth/login?callbackUrl=/admin/users');
        } else if (sessionStatus === 'authenticated' && session?.user?.role !== 'admin') {
            router.push('/');
        }
    }, [sessionStatus, session, router]);

    const load = useCallback(async () => {
        setLoading(true);
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('limit', String(PAGE_SIZE));
        if (q.trim()) params.set('q', q.trim());
        if (roleFilter) params.set('role', roleFilter);
        if (disabledFilter) params.set('disabled', disabledFilter);

        try {
            const res = await fetch(`/api/admin/users?${params}`, { cache: 'no-store' });
            const data = await res.json();
            if (res.ok) {
                setUsers(data.users || []);
                setTotal(data.total || 0);
                setPages(data.pages || 1);
            } else {
                alert(data.error || data.message || 'Could not load users.');
            }
        } catch {
            alert('Network error.');
        } finally {
            setLoading(false);
        }
    }, [page, q, roleFilter, disabledFilter]);

    useEffect(() => {
        if (sessionStatus === 'authenticated' && session?.user?.role === 'admin') {
            load();
        }
    }, [sessionStatus, session, load]);

    // ---------- Actions ----------
    const handleRoleChange = async (id, newRole) => {
        setBusyId(id);
        try {
            const res = await fetch(`/api/admin/users/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: newRole })
            });
            const data = await res.json();
            if (res.ok) {
                alert(`Role updated to ${newRole}.`);
                load();
            } else {
                alert(data.message || data.error || 'Could not update role.');
            }
        } catch {
            alert('Network error.');
        } finally {
            setBusyId(null);
        }
    };

    const handleToggleDisabled = async (id, currentlyDisabled, email) => {
        const action = currentlyDisabled ? 'enable' : 'disable';
        if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${email}?`)) return;

        setBusyId(id);
        try {
            const res = await fetch(`/api/admin/users/${id}/${action}`, { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                alert(data.message || `Account ${action}d.`);
                load();
            } else {
                alert(data.message || data.error || `Could not ${action} account.`);
            }
        } catch {
            alert('Network error.');
        } finally {
            setBusyId(null);
        }
    };

    const formatDate = (d) => {
        if (!d) return '—';
        try { return new Date(d).toLocaleDateString(); } catch { return '—'; }
    };

    // While next-auth is resolving, render nothing (avoids flash of unauth content)
    if (sessionStatus === 'loading' || (sessionStatus === 'authenticated' && session?.user?.role !== 'admin')) {
        return null;
    }
    if (sessionStatus === 'unauthenticated') return null;

    return (
        <div>
            <Navbar />
            <div className="max-w-6xl mx-auto p-5 md:p-10">

                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-3">
                    <div>
                        <h1 className="text-xl md:text-2xl font-bold">User Management</h1>
                        <p className="text-gray-400 text-sm">{total} total users</p>
                    </div>
                    <div className="flex gap-2">
                        <Link
                            href="/admin"
                            className="px-3 py-2 bg-transparent border border-[#483AA0] text-[#483AA0] hover:bg-[#483AA0] hover:text-white rounded-lg text-sm"
                        >
                            ← Admin Home
                        </Link>
                        <Link
                            href="/admin/audit-log"
                            className="px-3 py-2 bg-[#483AA0] hover:bg-[#372a7a] rounded-lg text-sm font-bold"
                        >
                            Audit Log →
                        </Link>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-[#1f1f2e] rounded-lg p-4 shadow-lg mb-5">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <input
                            type="search"
                            placeholder="Search username or email…"
                            value={q}
                            onChange={(e) => { setQ(e.target.value); setPage(1); }}
                            className="p-2 bg-[#2c2c3a] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#483AA0]"
                        />
                        <select
                            value={roleFilter}
                            onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
                            className="p-2 bg-[#2c2c3a] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#483AA0]"
                        >
                            <option value="">All roles</option>
                            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <select
                            value={disabledFilter}
                            onChange={(e) => { setDisabledFilter(e.target.value); setPage(1); }}
                            className="p-2 bg-[#2c2c3a] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#483AA0]"
                        >
                            <option value="">All accounts</option>
                            <option value="false">Active only</option>
                            <option value="true">Disabled only</option>
                        </select>
                        <button
                            onClick={() => { setQ(''); setRoleFilter(''); setDisabledFilter(''); setPage(1); }}
                            className="px-3 py-2 bg-transparent border border-gray-600 text-gray-300 hover:bg-gray-700 rounded-lg text-sm"
                        >
                            Clear filters
                        </button>
                    </div>
                </div>

                {/* Users table */}
                <div className="bg-[#1f1f2e] rounded-lg shadow-lg overflow-hidden">
                    {loading ? (
                        <div className="p-6 text-gray-400">Loading…</div>
                    ) : users.length === 0 ? (
                        <div className="p-6 text-gray-400">No users match those filters.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-gray-400 border-b border-[#2c2c3a]">
                                        <th className="p-3">Username</th>
                                        <th className="p-3">Email</th>
                                        <th className="p-3">Role</th>
                                        <th className="p-3">Status</th>
                                        <th className="p-3">Joined</th>
                                        <th className="p-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map(u => {
                                        const isSelf = session?.user?.id === u.id;
                                        const isLocked = u.lockedUntil && new Date(u.lockedUntil).getTime() > Date.now();
                                        return (
                                            <tr key={u.id} className="border-b border-[#2c2c3a] hover:bg-[#15151f]">
                                                <td className="p-3 font-mono">{u.username}</td>
                                                <td className="p-3 text-gray-300">{u.email}</td>
                                                <td className="p-3">
                                                    <select
                                                        value={u.role}
                                                        disabled={isSelf || busyId === u.id}
                                                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                                                        className="p-1 bg-[#2c2c3a] rounded text-xs disabled:opacity-50"
                                                        title={isSelf ? "You can't change your own role" : ''}
                                                    >
                                                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                                                    </select>
                                                </td>
                                                <td className="p-3">
                                                    {u.disabled ? (
                                                        <span className="text-xs bg-red-900/40 text-red-300 px-2 py-0.5 rounded">disabled</span>
                                                    ) : isLocked ? (
                                                        <span className="text-xs bg-yellow-900/40 text-yellow-300 px-2 py-0.5 rounded">locked</span>
                                                    ) : (
                                                        <span className="text-xs bg-green-900/40 text-green-300 px-2 py-0.5 rounded">active</span>
                                                    )}
                                                    {u.failedLoginAttempts > 0 && (
                                                        <span className="text-xs text-gray-500 ml-1">({u.failedLoginAttempts} fail)</span>
                                                    )}
                                                </td>
                                                <td className="p-3 text-gray-500 text-xs">{formatDate(u.createdAt)}</td>
                                                <td className="p-3 text-right">
                                                    {!isSelf && (
                                                        <button
                                                            disabled={busyId === u.id}
                                                            onClick={() => handleToggleDisabled(u.id, u.disabled, u.email)}
                                                            className={`px-3 py-1 rounded text-xs disabled:opacity-50 ${u.disabled
                                                                ? 'bg-green-900/40 hover:bg-green-900/60 text-green-200'
                                                                : 'bg-red-900/40 hover:bg-red-900/60 text-red-200'}`}
                                                        >
                                                            {busyId === u.id ? '…' : (u.disabled ? 'Enable' : 'Disable')}
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Pagination */}
                {pages > 1 && (
                    <div className="flex items-center justify-between mt-4 text-sm">
                        <span className="text-gray-400">Page {page} of {pages}</span>
                        <div className="flex gap-2">
                            <button
                                disabled={page <= 1}
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                className="px-3 py-1 bg-[#1f1f2e] border border-[#2c2c3a] rounded disabled:opacity-30 hover:bg-[#15151f]"
                            >
                                ← Prev
                            </button>
                            <button
                                disabled={page >= pages}
                                onClick={() => setPage(p => Math.min(pages, p + 1))}
                                className="px-3 py-1 bg-[#1f1f2e] border border-[#2c2c3a] rounded disabled:opacity-30 hover:bg-[#15151f]"
                            >
                                Next →
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <Alert
                message={showAlert.message}
                visible={showAlert.visible}
                onClose={() => setShowAlert({ message: "", visible: false })}
            />
        </div>
    );
}
