'use client';
import Navbar from "@/components/navbar.jsx";
import Alert from "@/components/alert.jsx";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

/**
 * /user/delete-account
 *
 * Destructive. Three guards before we'll send the DELETE:
 *   1. The current password (proves the session isn't a hijack)
 *   2. The literal phrase "DELETE" typed into a confirm box
 *   3. A final native confirm() dialog
 *
 * On success we call NextAuth's signOut() so the now-orphaned cookie
 * is cleared client-side — the server-side User row is already gone,
 * so any further request that hits requireSession + a User.findById
 * would 401 anyway.
 */
export default function DeleteAccountPage() {
    const router = useRouter();
    const { status } = useSession();

    const [currentPassword, setCurrentPassword] = useState('');
    const [confirm,         setConfirm]         = useState('');
    const [loading,         setLoading]         = useState(false);
    const [showAlert,       setShowAlert]       = useState({ message: '', visible: false });

    const alert = (message) => {
        setShowAlert({ message, visible: true });
        setTimeout(() => setShowAlert({ message: '', visible: false }), 3500);
    };

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/auth/login?callbackUrl=/user/delete-account');
        }
    }, [status, router]);

    const canSubmit = currentPassword.length > 0 && confirm === 'DELETE';

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!canSubmit) return;

        // Final native confirm so an accidental Enter-press can't nuke
        // an account with the form already filled in.
        if (!window.confirm('Delete your account permanently? This cannot be undone.')) return;

        setLoading(true);
        try {
            const res = await fetch('/api/user/delete-account', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword, confirm })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                // Clear our session client-side too. NextAuth's signOut
                // wipes the cookie and redirects.
                await signOut({ callbackUrl: '/' });
            } else {
                alert(data.message || 'Could not delete account.');
            }
        } catch {
            alert('Network error.');
        } finally {
            setLoading(false);
        }
    };

    if (status === 'loading' || status === 'unauthenticated') return null;

    return (
        <div>
            <Navbar />
            <div className="flex flex-col items-center justify-center h-screen">
                <div className="bg-[#1f1f2e] rounded-lg p-5 shadow-lg m-5 md:m-10 w-full max-w-md border border-red-900/60">
                    <h1 className="text-xl md:text-2xl font-bold text-red-300">Delete Account</h1>
                    <p className="text-gray-400 mt-2 text-sm">
                        This permanently removes your user record, all your API keys, and any
                        outstanding password-reset tokens. Your request history is kept until its
                        90-day retention expires. <strong className="text-red-200">This cannot be undone.</strong>
                    </p>

                    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
                        <input
                            type="password"
                            autoComplete="current-password"
                            placeholder="Current password"
                            className="p-2 bg-[#2c2c3a] rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            required
                        />
                        <div>
                            <label className="text-sm text-gray-400">
                                Type <code className="text-red-300">DELETE</code> to confirm:
                            </label>
                            <input
                                type="text"
                                placeholder="DELETE"
                                className="mt-1 w-full p-2 bg-[#2c2c3a] rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                value={confirm}
                                onChange={(e) => setConfirm(e.target.value)}
                                required
                            />
                        </div>
                        <button
                            disabled={loading || !canSubmit}
                            type="submit"
                            className="bg-red-700 hover:bg-red-800 hover:scale-105 active:scale-95 px-4 py-2 rounded-lg shadow-md transition font-bold disabled:opacity-40 disabled:hover:scale-100"
                        >
                            {loading ? 'Deleting…' : 'Permanently delete my account'}
                        </button>
                        <Link href="/user/profile" className="text-sm text-gray-400 hover:underline text-center">
                            Back to profile
                        </Link>
                    </form>
                </div>
            </div>
            <Alert
                message={showAlert.message}
                visible={showAlert.visible}
                onClose={() => setShowAlert({ message: '', visible: false })}
            />
        </div>
    );
}
