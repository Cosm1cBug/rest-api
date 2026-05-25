'use client';
import Navbar from "@/components/navbar.jsx";
import Alert from "@/components/alert.jsx";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

/**
 * /user/change-password
 *
 * Two-field form: current password + new password (confirmed via repeat).
 * POSTs to /api/user/change-password. On success, redirects back to
 * the profile page after a short confirmation.
 *
 * Security UX details:
 *   - The new password input has minLength=8 client-side; the server
 *     enforces the same via Zod.
 *   - We do NOT show different messages for "current password wrong"
 *     vs other errors — we surface whatever the server returns, which
 *     is intentionally generic for the wrong-password case.
 */
export default function ChangePasswordPage() {
    const router = useRouter();
    const { status } = useSession();

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword,     setNewPassword]     = useState('');
    const [confirm,         setConfirm]         = useState('');
    const [show,            setShow]            = useState(false);
    const [loading,         setLoading]         = useState(false);
    const [done,            setDone]            = useState(false);
    const [showAlert,       setShowAlert]       = useState({ message: '', visible: false });

    const alert = (message) => {
        setShowAlert({ message, visible: true });
        setTimeout(() => setShowAlert({ message: '', visible: false }), 3500);
    };

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/auth/login?callbackUrl=/user/change-password');
        }
    }, [status, router]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (newPassword.length < 8)        return alert('New password must be at least 8 characters.');
        if (newPassword !== confirm)       return alert('New passwords do not match.');
        if (newPassword === currentPassword) return alert('New password must differ from the current one.');

        setLoading(true);
        try {
            const res = await fetch('/api/user/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword, newPassword })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                setCurrentPassword(''); setNewPassword(''); setConfirm('');
                setDone(true);
                setTimeout(() => router.push('/user/profile'), 2000);
            } else {
                alert(data.message || 'Could not change password.');
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
                <div className="bg-[#1f1f2e] rounded-lg p-5 shadow-lg m-5 md:m-10 w-full max-w-md">
                    {done ? (
                        <>
                            <h1 className="text-xl md:text-2xl font-bold">Password updated</h1>
                            <p className="text-gray-400 mt-2">Redirecting to your profile…</p>
                        </>
                    ) : (
                        <>
                            <h1 className="text-xl md:text-2xl font-bold">Change Password</h1>
                            <p className="text-gray-400 mt-1">
                                Enter your current password and a new one. Minimum 8 characters.
                            </p>

                            <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
                                <input
                                    type={show ? 'text' : 'password'}
                                    autoComplete="current-password"
                                    placeholder="Current password"
                                    className="p-2 bg-[#2c2c3a] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#483AA0]"
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    required
                                />
                                <input
                                    type={show ? 'text' : 'password'}
                                    autoComplete="new-password"
                                    placeholder="New password"
                                    minLength={8}
                                    maxLength={100}
                                    className="p-2 bg-[#2c2c3a] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#483AA0]"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    required
                                />
                                <input
                                    type={show ? 'text' : 'password'}
                                    autoComplete="new-password"
                                    placeholder="Confirm new password"
                                    minLength={8}
                                    maxLength={100}
                                    className="p-2 bg-[#2c2c3a] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#483AA0]"
                                    value={confirm}
                                    onChange={(e) => setConfirm(e.target.value)}
                                    required
                                />
                                <label className="flex items-center gap-2 text-sm text-gray-400">
                                    <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
                                    Show passwords
                                </label>
                                <button
                                    disabled={loading}
                                    type="submit"
                                    className="bg-[#483AA0] hover:bg-[#372a7a] hover:scale-105 active:scale-95 px-4 py-2 rounded-lg shadow-md transition font-bold disabled:opacity-50"
                                >
                                    {loading ? 'Updating...' : 'Update Password'}
                                </button>
                                <Link href="/user/profile" className="text-sm text-gray-400 hover:underline text-center">
                                    Back to profile
                                </Link>
                            </form>
                        </>
                    )}
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
