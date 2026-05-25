'use client';
import Navbar from "@/components/navbar";
import Alert from "@/components/alert";
import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

/**
 * Admin audit log viewer.
 *
 * Consumes GET /api/admin/audit-log with the supported filters:
 *   actorId, targetId, action, page, limit
 *
 * Each entry is shown with actor, action, target, IP, and a "details"
 * expander that pretty-prints the before/after diff stored on the row.
 *
 * Page is read-only — there is no UI to mutate audit entries because
 * the audit log is append-only by design.
 */

const PAGE_SIZE = 25;

// Known action strings we render with friendly labels. Unknown actions
// fall back to the raw string so a new audit action lands here without
// requiring a UI update.
const ACTION_LABELS = {
    'user.update':         'Updated user',
    'user.disable':        'Disabled account',
    'user.enable':         'Enabled account',
    'user.apikey_revoke':  'Revoked API key',
    'user.delete':         'Deleted user'
};

export default function AdminAuditLogPage() {
    const router = useRouter();
    const { data: session, status: sessionStatus } = useSession();

    const [entries, setEntries] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [loading, setLoading] = useState(true);

    // Filters
    const [actionFilter, setActionFilter] = useState('');

    const [expanded, setExpanded] = useState({});  // { entryId: true }

    const [showAlert, setShowAlert] = useState({ message: "", visible: false });
    const alert = (message) => {
        setShowAlert({ message, visible: true });
        setTimeout(() => setShowAlert({ message: "", visible: false }), 3000);
    };

    useEffect(() => {
        if (sessionStatus === 'unauthenticated') {
            router.push('/auth/login?callbackUrl=/admin/audit-log');
        } else if (sessionStatus === 'authenticated' && session?.user?.role !== 'admin') {
            router.push('/');
        }
    }, [sessionStatus, session, router]);

    const load = useCallback(async () => {
        setLoading(true);
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('limit', String(PAGE_SIZE));
        if (actionFilter) params.set('action', actionFilter);

        try {
            const res = await fetch(`/api/admin/audit-log?${params}`, { cache: 'no-store' });
            const data = await res.json();
            if (res.ok) {
                setEntries(data.entries || []);
                setTotal(data.total || 0);
                setPages(data.pages || 1);
            } else {
                alert(data.error || data.message || 'Could not load audit log.');
            }
        } catch {
            alert('Network error.');
        } finally {
            setLoading(false);
        }
    }, [page, actionFilter]);

    useEffect(() => {
        if (sessionStatus === 'authenticated' && session?.user?.role === 'admin') {
            load();
        }
    }, [sessionStatus, session, load]);

    const formatDate = (d) => {
        if (!d) return '—';
        try { return new Date(d).toLocaleString(); } catch { return '—'; }
    };

    const toggle = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

    if (sessionStatus === 'loading' || (sessionStatus === 'authenticated' && session?.user?.role !== 'admin')) {
        return null;
    }
    if (sessionStatus === 'unauthenticated') return null;

    return (
        <div>
            <Navbar />
            <div className="max-w-6xl mx-auto p-5 md:p-10">

                <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-3">
                    <div>
                        <h1 className="text-xl md:text-2xl font-bold">Audit Log</h1>
                        <p className="text-gray-400 text-sm">{total} total entries · append-only</p>
                    </div>
                    <div className="flex gap-2">
                        <Link
                            href="/admin/users"
                            className="px-3 py-2 bg-transparent border border-[#483AA0] text-[#483AA0] hover:bg-[#483AA0] hover:text-white rounded-lg text-sm"
                        >
                            ← Users
                        </Link>
                        <Link
                            href="/admin"
                            className="px-3 py-2 bg-[#483AA0] hover:bg-[#372a7a] rounded-lg text-sm font-bold"
                        >
                            Admin Home
                        </Link>
                    </div>
                </div>

                <div className="bg-[#1f1f2e] rounded-lg p-4 shadow-lg mb-5">
                    <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
                        <label className="text-sm text-gray-400">Action:</label>
                        <select
                            value={actionFilter}
                            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
                            className="p-2 bg-[#2c2c3a] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#483AA0] flex-1 md:max-w-xs"
                        >
                            <option value="">All actions</option>
                            {Object.entries(ACTION_LABELS).map(([k, v]) =>
                                <option key={k} value={k}>{v} ({k})</option>
                            )}
                        </select>
                        {actionFilter && (
                            <button
                                onClick={() => { setActionFilter(''); setPage(1); }}
                                className="px-3 py-2 bg-transparent border border-gray-600 text-gray-300 hover:bg-gray-700 rounded-lg text-sm"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                </div>

                <div className="bg-[#1f1f2e] rounded-lg shadow-lg overflow-hidden">
                    {loading ? (
                        <div className="p-6 text-gray-400">Loading…</div>
                    ) : entries.length === 0 ? (
                        <div className="p-6 text-gray-400">No audit entries yet.</div>
                    ) : (
                        <ul className="divide-y divide-[#2c2c3a]">
                            {entries.map(e => (
                                <li key={e.id} className="p-4 hover:bg-[#15151f]">
                                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-sm font-bold">
                                                    {ACTION_LABELS[e.action] || e.action}
                                                </span>
                                                <span className="text-xs text-gray-500 font-mono">{e.action}</span>
                                            </div>
                                            <div className="text-sm text-gray-400 mt-1">
                                                <span className="text-[#9b8bd9]">{e.actorEmail || 'unknown'}</span>
                                                {e.targetLabel && (
                                                    <>
                                                        {' '}→ <span className="text-gray-300">{e.targetLabel}</span>
                                                    </>
                                                )}
                                            </div>
                                            <div className="text-xs text-gray-500 mt-1">
                                                {formatDate(e.createdAt)} · {e.ip || 'unknown ip'}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => toggle(e.id)}
                                            className="px-3 py-1 text-xs bg-[#2c2c3a] hover:bg-[#3a3a4a] rounded self-start md:self-auto"
                                        >
                                            {expanded[e.id] ? 'Hide' : 'Details'}
                                        </button>
                                    </div>

                                    {expanded[e.id] && (
                                        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                            <div>
                                                <div className="text-gray-500 mb-1">Before</div>
                                                <pre className="bg-[#0f0f1a] p-2 rounded overflow-x-auto">
{JSON.stringify(e.before, null, 2)}
                                                </pre>
                                            </div>
                                            <div>
                                                <div className="text-gray-500 mb-1">After</div>
                                                <pre className="bg-[#0f0f1a] p-2 rounded overflow-x-auto">
{JSON.stringify(e.after, null, 2)}
                                                </pre>
                                            </div>
                                            <div className="md:col-span-2 text-gray-500 break-all">
                                                User-Agent: <span className="text-gray-400">{e.userAgent || 'unknown'}</span>
                                            </div>
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

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
