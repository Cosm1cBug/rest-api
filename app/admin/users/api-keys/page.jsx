'use client';
import Navbar from "@/components/navbar";
import Alert from "@/components/alert";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

export default function ApiKeysPage() {
    const router = useRouter();
    const { status } = useSession();

    const [keys, setKeys] = useState([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [revokingId, setRevokingId] = useState(null);
    const [showAlert, setShowAlert] = useState({ message: "", visible: false });

    // One-time plaintext key reveal state
    const [newKey, setNewKey] = useState(null);          // { apiKey, keyId, label }
    const [copyLabel, setCopyLabel] = useState('Copy');

    // Create-form state
    const [label, setLabel] = useState('');

    const alert = (message, visible) => {
        setShowAlert({ message, visible });
        if (visible) {
            setTimeout(() => setShowAlert({ message: "", visible: false }), 3000);
        }
    };

    // Redirect to login when unauthenticated. We don't render the page
    // for anon users at all.
    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/auth/login?callbackUrl=/user/api-keys');
        }
    }, [status, router]);

    const loadKeys = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/user/api-keys', { cache: 'no-store' });
            const data = await res.json();
            if (res.ok) {
                setKeys(data.keys || []);
            } else {
                alert(data.error || 'Could not load API keys.', true);
            }
        } catch {
            alert('Network error. Please try again.', true);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (status === 'authenticated') {
            loadKeys();
        }
    }, [status]);

    const handleCreate = async (e) => {
        e.preventDefault();
        setCreating(true);
        try {
            const res = await fetch('/api/user/api-keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label: label.trim() })
            });
            const data = await res.json();

            if (res.ok) {
                setNewKey({
                    apiKey: data.apiKey,
                    keyId: data.keyId,
                    label: data.label || ''
                });
                setLabel('');
                // Refresh the list so the new key appears with metadata.
                loadKeys();
            } else {
                alert(data.message || 'Could not create key.', true);
            }
        } catch {
            alert('Network error. Please try again.', true);
        } finally {
            setCreating(false);
        }
    };

    const handleRevoke = async (keyId, legacy) => {
        const label = legacy ? 'legacy key' : keyId;
        if (!confirm(`Revoke ${label}? This cannot be undone.`)) return;

        setRevokingId(keyId);
        try {
            const res = await fetch(`/api/user/api-keys/${keyId}`, { method: 'DELETE' });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                alert(data.message || 'Key revoked.', true);
                loadKeys();
            } else {
                alert(data.error || data.message || 'Could not revoke key.', true);
            }
        } catch {
            alert('Network error. Please try again.', true);
        } finally {
            setRevokingId(null);
        }
    };

    const handleCopy = async () => {
        if (!newKey?.apiKey) return;
        try {
            await navigator.clipboard.writeText(newKey.apiKey);
            setCopyLabel('Copied!');
            setTimeout(() => setCopyLabel('Copy'), 2000);
        } catch {
            alert('Could not copy. Please select and copy manually.', true);
        }
    };

    const handleDismissNewKey = () => {
        setNewKey(null);
        setCopyLabel('Copy');
    };

    const formatDate = (d) => {
        if (!d) return '—';
        try { return new Date(d).toLocaleString(); } catch { return '—'; }
    };

    if (status === 'loading') return null;
    if (status === 'unauthenticated') return null;

    return (
        <div>
            <Navbar />
            <div className="max-w-3xl mx-auto p-5 md:p-10">
                <h1 className="text-xl md:text-2xl font-bold mb-1">API Keys</h1>
                <p className="text-gray-400 mb-6">
                    Use these keys in the <code className="text-[#483AA0]">x-api-key</code> request header.
                    Treat them like passwords.
                </p>

                {/* One-time plaintext reveal */}
                {newKey && (
                    <div className="bg-[#1f1f2e] border border-[#483AA0] rounded-lg p-5 shadow-lg mb-6">
                        <h2 className="text-lg font-bold mb-1">Save your new API key</h2>
                        <p className="text-gray-400 text-sm mb-3">
                            This is the only time we'll show this key. Store it in a
                            password manager now.
                        </p>

                        {newKey.label && (
                            <div className="mb-2">
                                <span className="text-gray-400 text-sm">Label: </span>
                                <span>{newKey.label}</span>
                            </div>
                        )}

                        <div className="mb-2">
                            <span className="text-gray-400 text-sm">Key ID: </span>
                            <code className="break-all">{newKey.keyId}</code>
                        </div>

                        <div className="flex items-center gap-2 mb-4">
                            <code className="flex-1 p-2 bg-[#2c2c3a] rounded-lg break-all text-sm">
                                {newKey.apiKey}
                            </code>
                            <button
                                type="button"
                                onClick={handleCopy}
                                className="px-3 py-2 bg-[#483AA0] hover:bg-[#372a7a] rounded-lg text-sm font-bold"
                            >
                                {copyLabel}
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={handleDismissNewKey}
                            className="px-4 py-2 bg-transparent border border-[#483AA0] text-[#483AA0] hover:bg-[#483AA0] hover:text-white rounded-lg text-sm"
                        >
                            I have saved my key
                        </button>
                    </div>
                )}

                {/* Create form */}
                <div className="bg-[#1f1f2e] rounded-lg p-5 shadow-lg mb-6">
                    <h2 className="text-lg font-bold mb-3">Create a New Key</h2>
                    <form onSubmit={handleCreate} className="flex flex-col md:flex-row gap-3">
                        <input
                            type="text"
                            maxLength={64}
                            className="flex-1 p-2 bg-[#2c2c3a] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#483AA0]"
                            placeholder="Optional label (e.g. production, ci-runner)"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                        />
                        <button
                            disabled={creating}
                            type="submit"
                            className="bg-[#483AA0] hover:bg-[#372a7a] hover:scale-105 active:scale-95 px-4 py-2 rounded-lg shadow-md transition duration-300 font-bold disabled:opacity-50"
                        >
                            {creating ? 'Creating...' : 'Create Key'}
                        </button>
                    </form>
                    <p className="text-gray-500 text-xs mt-2">
                        Up to 10 active keys per account.
                    </p>
                </div>

                {/* Existing keys list */}
                <div className="bg-[#1f1f2e] rounded-lg p-5 shadow-lg">
                    <h2 className="text-lg font-bold mb-3">Your Keys</h2>

                    {loading ? (
                        <p className="text-gray-400">Loading...</p>
                    ) : keys.length === 0 ? (
                        <p className="text-gray-400">No keys yet. Create your first one above.</p>
                    ) : (
                        <ul className="space-y-3">
                            {keys.map(k => (
                                <li
                                    key={k.keyId}
                                    className={`p-3 rounded-lg border ${k.revoked ? 'border-gray-700 opacity-60' : 'border-[#2c2c3a]'} bg-[#15151f]`}
                                >
                                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <code className="break-all text-sm">{k.keyId}</code>
                                                {k.label && (
                                                    <span className="text-xs bg-[#483AA0]/20 text-[#9b8bd9] px-2 py-0.5 rounded">
                                                        {k.label}
                                                    </span>
                                                )}
                                                {k.legacy && (
                                                    <span className="text-xs bg-yellow-900/40 text-yellow-300 px-2 py-0.5 rounded">
                                                        legacy
                                                    </span>
                                                )}
                                                {k.revoked && (
                                                    <span className="text-xs bg-red-900/40 text-red-300 px-2 py-0.5 rounded">
                                                        revoked
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs text-gray-500 mt-1">
                                                Created: {formatDate(k.createdAt)} ·
                                                {' '}Last used: {formatDate(k.lastUsedAt)}
                                                {k.revoked && <> · Revoked: {formatDate(k.revokedAt)}</>}
                                            </div>
                                        </div>
                                        {!k.revoked && (
                                            <button
                                                type="button"
                                                disabled={revokingId === k.keyId}
                                                onClick={() => handleRevoke(k.keyId, k.legacy)}
                                                className="px-3 py-1.5 bg-red-900/40 hover:bg-red-900/60 text-red-200 rounded text-sm disabled:opacity-50 self-start md:self-auto"
                                            >
                                                {revokingId === k.keyId ? 'Revoking...' : 'Revoke'}
                                            </button>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            <Alert
                message={showAlert.message}
                visible={showAlert.visible}
                onClose={() => setShowAlert({ message: "", visible: false })}
            />
        </div>
    );
}
