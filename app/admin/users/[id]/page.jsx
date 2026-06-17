'use client';
import Navbar from "@/components/navbar";
import Alert from "@/components/alert";
import Confirm from "@/components/confirm";
import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

/**
 * Admin user detail page — V13 batch item #1.
 *
 * Consumes:
 *   GET    /api/admin/users/[id]                   — user state + V11 oauth + recent API keys
 *   PATCH  /api/admin/users/[id]                   — role / disabled / endDate
 *   POST   /api/admin/users/[id]/disable           — quick toggle
 *   POST   /api/admin/users/[id]/enable            — quick toggle (also clears lockout)
 *   DELETE /api/admin/users/[id]/api-keys/[keyId]  — admin-side key revoke
 *   GET    /api/admin/audit-log?targetId=[id]      — scoped audit log
 *
 * Defense-in-depth:
 *   - Edge middleware gates /admin/* for admin role
 *   - Each consumed API route ALSO does requireAdmin / requireAdminWithToken
 *   - The page itself does no auth check; UX-only redirect if session is
 *     missing client-side. A non-admin who somehow loads this code will
 *     see empty data because every fetch will 401.
 *
 * Self-modification guards (mirroring the API):
 *   - Admin cannot change their own role
 *   - Admin cannot disable themselves
 *   - Admin CAN revoke their own API keys (that's fine — they can
 *     issue new ones from /user/api-keys)
 */

const ROLES = ['basic', 'standard', 'premium', 'admin'];

function formatDate(d) {
    if (!d) return '—';
    try { return new Date(d).toLocaleString(); } catch { return String(d); }
}

function isLockedNow(lockedUntil) {
    if (!lockedUntil) return false;
    return new Date(lockedUntil).getTime() > Date.now();
}

export default function AdminUserDetailPage() {
    const params = useParams();
    const router = useRouter();
    const userId = params?.id;
    const { data: session, status: sessionStatus } = useSession();

    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [audit, setAudit] = useState([]);
    const [auditLoading, setAuditLoading] = useState(true);
    const [busy, setBusy] = useState(null);  // 'role', 'disable', 'enable', 'revoke-<keyId>'
    const [confirmState, setConfirmState] = useState(null);

    const [showAlert, setShowAlert] = useState({ message: "", visible: false });
    const alert = (message) => {
        setShowAlert({ message, visible: true });
        setTimeout(() => setShowAlert({ message: "", visible: false }), 3000);
    };

    const loadUser = useCallback(async () => {
        if (!userId) return;
        setLoading(true);
        try {
            const r = await fetch(`/api/admin/users/${userId}`);
            if (r.status === 401 || r.status === 403) {
                router.push('/auth/login');
                return;
            }
            if (r.status === 404) {
                setUser(null);
                return;
            }
            const j = await r.json();
            if (j.success) setUser(j.user);
        } catch {
            alert('Failed to load user.');
        } finally {
            setLoading(false);
        }
    }, [userId, router]);

    const loadAudit = useCallback(async () => {
        if (!userId) return;
        setAuditLoading(true);
        try {
            const r = await fetch(`/api/admin/audit-log?targetId=${userId}&limit=25`);
            if (!r.ok) {
                setAudit([]);
                return;
            }
            const j = await r.json();
            if (j.success && Array.isArray(j.entries)) setAudit(j.entries);
        } catch {
            // silent — audit log is secondary; the main user info is what matters
        } finally {
            setAuditLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        if (sessionStatus === 'unauthenticated') {
            router.push('/auth/login');
            return;
        }
        loadUser();
        loadAudit();
    }, [sessionStatus, loadUser, loadAudit, router]);

    if (loading) {
        return (
            <div>
                <Navbar />
                <div className="p-6 text-gray-400">Loading user…</div>
            </div>
        );
    }

    if (!user) {
        return (
            <div>
                <Navbar />
                <div className="p-6">
                    <p className="text-gray-400">User not found.</p>
                    <Link href="/admin/users" className="text-[#483AA0] hover:underline">← Back to users</Link>
                </div>
            </div>
        );
    }

    const isSelf = session?.user?.id === user.id;
    const locked = isLockedNow(user.lockedUntil);

    // ─── Action handlers ─────────────────────────────────────────────
    const handleRoleChange = async (newRole) => {
        if (newRole === user.role) return;
        if (isSelf) { alert('You cannot change your own role.'); return; }
        setBusy('role');
        try {
            const r = await fetch(`/api/admin/users/${userId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: newRole })
            });
            const j = await r.json();
            if (j.success) {
                alert(`Role updated to ${newRole}.`);
                loadUser();
                loadAudit();
            } else {
                alert(j.message || 'Role update failed.');
            }
        } finally {
            setBusy(null);
        }
    };

    const handleToggleDisabled = async () => {
        if (isSelf && !user.disabled) { alert('You cannot disable your own account.'); return; }
        setBusy(user.disabled ? 'enable' : 'disable');
        try {
            const endpoint = user.disabled ? 'enable' : 'disable';
            const r = await fetch(`/api/admin/users/${userId}/${endpoint}`, { method: 'POST' });
            const j = await r.json();
            if (j.success) {
                alert(user.disabled ? 'Account enabled.' : 'Account disabled.');
                loadUser();
                loadAudit();
            } else {
                alert(j.message || 'Action failed.');
            }
        } finally {
            setBusy(null);
        }
    };

    const handleRevokeKey = (keyId) => {
        setConfirmState({
            message: `Revoke API key ${keyId}? This cannot be undone.`,
            confirmLabel: 'Revoke',
            destructive: true,
            onConfirm: () => doRevokeKey(keyId)
        });
    };

    const doRevokeKey = async (keyId) => {
        setBusy(`revoke-${keyId}`);
        try {
            const r = await fetch(`/api/admin/users/${userId}/api-keys/${keyId}`, { method: 'DELETE' });
            const j = await r.json();
            if (j.success) {
                alert(`Key ${keyId} revoked.`);
                loadUser();
                loadAudit();
            } else {
                alert(j.message || 'Revoke failed.');
            }
        } finally {
            setBusy(null);
        }
    };

    return (
        <div>
            <Navbar />

            <div className="max-w-6xl mx-auto p-4 md:p-6">

                {/* ─── Breadcrumb + header ─────────────────────── */}
                <div className="mb-4 text-sm text-gray-400">
                    <Link href="/admin/users" className="hover:underline">← Users</Link>
                    <span className="mx-2">/</span>
                    <span className="text-gray-200 font-mono">{user.username}</span>
                </div>

                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold">{user.username}</h1>
                        <p className="text-gray-400 text-sm">{user.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {user.disabled ? (
                            <span className="text-xs bg-red-900/40 text-red-300 px-2 py-1 rounded">disabled</span>
                        ) : locked ? (
                            <span className="text-xs bg-yellow-900/40 text-yellow-300 px-2 py-1 rounded">locked</span>
                        ) : (
                            <span className="text-xs bg-green-900/40 text-green-300 px-2 py-1 rounded">active</span>
                        )}
                        {isSelf && <span className="text-xs bg-blue-900/40 text-blue-300 px-2 py-1 rounded">this is you</span>}
                    </div>
                </div>

                {/* ─── Top cards: identity / state / actions ──── */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">

                    {/* Identity card */}
                    <div className="bg-[#1f1f2e] rounded-lg p-4">
                        <h2 className="text-sm font-semibold text-gray-300 mb-3">Identity</h2>
                        <dl className="space-y-2 text-sm">
                            <div className="flex justify-between"><dt className="text-gray-400">ID</dt><dd className="font-mono text-xs text-gray-300 truncate ml-2" title={user.id}>{user.id.slice(-12)}</dd></div>
                            <div className="flex justify-between"><dt className="text-gray-400">Role</dt><dd>
                                <select
                                    value={user.role}
                                    disabled={isSelf || busy === 'role'}
                                    onChange={(e) => handleRoleChange(e.target.value)}
                                    className="p-1 bg-[#2c2c3a] rounded text-xs disabled:opacity-50"
                                    title={isSelf ? "You can't change your own role" : ''}
                                >
                                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                            </dd></div>
                            <div className="flex justify-between"><dt className="text-gray-400">Created</dt><dd className="text-gray-300">{formatDate(user.createdAt)}</dd></div>
                            <div className="flex justify-between"><dt className="text-gray-400">End date</dt><dd className="text-gray-300">{user.endDate ? formatDate(user.endDate) : 'none'}</dd></div>
                            <div className="flex justify-between"><dt className="text-gray-400">Email verified</dt><dd className="text-gray-300">{user.emailVerifiedAt ? formatDate(user.emailVerifiedAt) : 'not via OAuth'}</dd></div>
                        </dl>
                    </div>

                    {/* Security card */}
                    <div className="bg-[#1f1f2e] rounded-lg p-4">
                        <h2 className="text-sm font-semibold text-gray-300 mb-3">Security state</h2>
                        <dl className="space-y-2 text-sm">
                            <div className="flex justify-between"><dt className="text-gray-400">Failed logins</dt><dd className="text-gray-300">{user.failedLoginAttempts}</dd></div>
                            <div className="flex justify-between"><dt className="text-gray-400">Locked until</dt><dd className="text-gray-300">{locked ? formatDate(user.lockedUntil) : '—'}</dd></div>
                            <div className="flex justify-between"><dt className="text-gray-400">Active API keys</dt><dd className="text-gray-300">{user.apiKeysActive}</dd></div>
                            <div className="flex justify-between"><dt className="text-gray-400">OAuth providers</dt><dd className="text-gray-300">
                                {user.oauthProviders.length === 0
                                    ? <span className="text-gray-500 text-xs">none</span>
                                    : user.oauthProviders.map(p => (
                                        <span key={p} className="text-xs bg-[#2c2c3a] px-2 py-0.5 rounded ml-1">{p}</span>
                                    ))
                                }
                            </dd></div>
                        </dl>
                    </div>

                    {/* Actions card */}
                    <div className="bg-[#1f1f2e] rounded-lg p-4">
                        <h2 className="text-sm font-semibold text-gray-300 mb-3">Actions</h2>
                        <div className="space-y-2">
                            <button
                                disabled={busy !== null || (isSelf && !user.disabled)}
                                onClick={handleToggleDisabled}
                                className={`w-full px-3 py-2 rounded text-sm disabled:opacity-50 ${user.disabled
                                    ? 'bg-green-900/40 hover:bg-green-900/60 text-green-200'
                                    : 'bg-red-900/40 hover:bg-red-900/60 text-red-200'}`}
                                title={isSelf && !user.disabled ? "You can't disable yourself" : ''}
                            >
                                {busy === 'disable' || busy === 'enable' ? '…' : (user.disabled ? 'Enable account' : 'Disable account')}
                            </button>
                            <p className="text-xs text-gray-500">
                                {user.disabled
                                    ? 'Enabling also clears any active lockout.'
                                    : 'Disabling prevents all sign-ins (credentials + OAuth).'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* ─── API keys table ──────────────────────────── */}
                <div className="bg-[#1f1f2e] rounded-lg p-4 mb-6">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-semibold text-gray-300">API keys (10 most recent)</h2>
                        <span className="text-xs text-gray-500">{user.apiKeysActive} active</span>
                    </div>
                    {user.apiKeys.length === 0 ? (
                        <p className="text-sm text-gray-500">No API keys.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="text-xs text-gray-400 border-b border-[#2c2c3a]">
                                    <tr>
                                        <th className="text-left p-2">Key ID</th>
                                        <th className="text-left p-2">Label</th>
                                        <th className="text-left p-2">Scopes</th>
                                        <th className="text-left p-2">Last used</th>
                                        <th className="text-left p-2">Expires</th>
                                        <th className="text-left p-2">Status</th>
                                        <th className="text-right p-2"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {user.apiKeys.map(k => (
                                        <tr key={k.keyId} className="border-b border-[#2c2c3a]/50">
                                            <td className="p-2 font-mono text-xs">{k.keyId}</td>
                                            <td className="p-2 text-gray-300">{k.label || <span className="text-gray-500">—</span>}</td>
                                            <td className="p-2 text-xs">
                                                {k.scopes.length === 0
                                                    ? <span className="text-gray-500">all</span>
                                                    : k.scopes.map(s => <span key={s} className="bg-[#2c2c3a] px-1.5 py-0.5 rounded mr-1">{s}</span>)
                                                }
                                            </td>
                                            <td className="p-2 text-gray-400 text-xs">{k.lastUsedAt ? formatDate(k.lastUsedAt) : 'never'}</td>
                                            <td className="p-2 text-gray-400 text-xs">{k.expiresAt ? formatDate(k.expiresAt) : 'no expiry'}</td>
                                            <td className="p-2">
                                                {k.revoked ? (
                                                    <span className="text-xs bg-gray-700/60 text-gray-300 px-2 py-0.5 rounded">revoked</span>
                                                ) : (
                                                    <span className="text-xs bg-green-900/40 text-green-300 px-2 py-0.5 rounded">active</span>
                                                )}
                                            </td>
                                            <td className="p-2 text-right">
                                                {!k.revoked && (
                                                    <button
                                                        disabled={busy === `revoke-${k.keyId}`}
                                                        onClick={() => handleRevokeKey(k.keyId)}
                                                        className="text-xs px-2 py-1 bg-red-900/40 hover:bg-red-900/60 text-red-200 rounded disabled:opacity-50"
                                                    >
                                                        {busy === `revoke-${k.keyId}` ? '…' : 'Revoke'}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* ─── Scoped audit log ────────────────────────── */}
                <div className="bg-[#1f1f2e] rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-semibold text-gray-300">Recent audit events for this user</h2>
                        <Link
                            href={`/admin/audit-log?targetId=${userId}`}
                            className="text-xs text-[#483AA0] hover:underline"
                        >
                            view all →
                        </Link>
                    </div>
                    {auditLoading ? (
                        <p className="text-sm text-gray-500">Loading audit log…</p>
                    ) : audit.length === 0 ? (
                        <p className="text-sm text-gray-500">No audit events recorded for this user.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="text-xs text-gray-400 border-b border-[#2c2c3a]">
                                    <tr>
                                        <th className="text-left p-2">When</th>
                                        <th className="text-left p-2">Action</th>
                                        <th className="text-left p-2">Actor</th>
                                        <th className="text-left p-2">IP</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {audit.map(e => (
                                        <tr key={e._id || e.id} className="border-b border-[#2c2c3a]/50">
                                            <td className="p-2 text-xs text-gray-400">{formatDate(e.createdAt)}</td>
                                            <td className="p-2 font-mono text-xs">{e.action}</td>
                                            <td className="p-2 text-gray-300 text-xs">{e.actorEmail || e.actorId || '—'}</td>
                                            <td className="p-2 text-gray-400 text-xs font-mono">{e.ip || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            <Alert
                message={showAlert.message}
                visible={showAlert.visible}
                onClose={() => setShowAlert({ message: "", visible: false })}
            />

            <Confirm
                state={confirmState}
                onClose={() => setConfirmState(null)}
            />
        </div>
    );
}
