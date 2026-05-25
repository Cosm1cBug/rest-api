'use client';
import Navbar from "@/components/navbar";
import Alert from "@/components/alert";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function ResetPasswordForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const tokenFromUrl = searchParams.get('token') || '';

    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [showAlert, setShowAlert] = useState({ message: "", visible: false });
    const [done, setDone] = useState(false);

    // Basic client-side token-shape sanity check. The server re-validates.
    const tokenLooksValid = /^[a-f0-9]{64}$/.test(tokenFromUrl);

    const alert = (message, visible) => {
        setShowAlert({ message, visible });
        if (visible) {
            setTimeout(() => setShowAlert({ message: "", visible: false }), 3500);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (password.length < 8) {
            return alert('Password must be at least 8 characters.', true);
        }
        if (password !== confirm) {
            return alert('Passwords do not match.', true);
        }

        setLoading(true);
        try {
            const res = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: tokenFromUrl, password }),
            });

            const data = await res.json().catch(() => ({}));

            if (res.ok) {
                // Clear sensitive state before navigating.
                setPassword('');
                setConfirm('');
                setDone(true);
                // Auto-redirect after a few seconds so the user has time to
                // read the success message.
                setTimeout(() => router.push('/auth/login'), 2500);
            } else {
                alert(data.message || 'Could not reset password.', true);
            }
        } catch {
            alert('Network error. Please try again.', true);
        } finally {
            setLoading(false);
        }
    };

    // No token at all → tell the user how to get here.
    if (!tokenFromUrl) {
        return (
            <div className="bg-[#1f1f2e] rounded-lg p-5 shadow-lg m-5 md:m-10 w-full max-w-md">
                <h1 className="text-xl md:text-2xl font-bold">Reset link required</h1>
                <p className="text-gray-400 mt-2">
                    This page expects a one-time link sent to your email. If you
                    need to start the reset, request a new link below.
                </p>
                <Link
                    href="/auth/forgot-password"
                    className="block mt-5 text-center bg-[#483AA0] hover:bg-[#372a7a] px-4 py-2 rounded-lg shadow-md transition duration-300 font-bold"
                >
                    Request a Reset Link
                </Link>
            </div>
        );
    }

    // Token present but malformed.
    if (!tokenLooksValid) {
        return (
            <div className="bg-[#1f1f2e] rounded-lg p-5 shadow-lg m-5 md:m-10 w-full max-w-md">
                <h1 className="text-xl md:text-2xl font-bold">Invalid reset link</h1>
                <p className="text-gray-400 mt-2">
                    The link you used looks wrong or was truncated. Please request
                    a fresh one.
                </p>
                <Link
                    href="/auth/forgot-password"
                    className="block mt-5 text-center bg-[#483AA0] hover:bg-[#372a7a] px-4 py-2 rounded-lg shadow-md transition duration-300 font-bold"
                >
                    Request a New Link
                </Link>
            </div>
        );
    }

    // Success screen.
    if (done) {
        return (
            <div className="bg-[#1f1f2e] rounded-lg p-5 shadow-lg m-5 md:m-10 w-full max-w-md">
                <h1 className="text-xl md:text-2xl font-bold">Password updated</h1>
                <p className="text-gray-400 mt-2">
                    Your password has been changed. Redirecting you to sign in…
                </p>
                <Link
                    href="/auth/login"
                    className="block mt-5 text-center bg-[#483AA0] hover:bg-[#372a7a] px-4 py-2 rounded-lg shadow-md transition duration-300 font-bold"
                >
                    Continue to Sign In
                </Link>
            </div>
        );
    }

    return (
        <div className="bg-[#1f1f2e] rounded-lg p-5 shadow-lg m-5 md:m-10 w-full max-w-md">
            <h1 className="text-xl md:text-2xl font-bold">Choose a New Password</h1>
            <p className="text-gray-400 mt-1">
                Enter a new password for your account. Minimum 8 characters.
            </p>

            <form onSubmit={handleSubmit} className="mt-4">
                <div className="mb-4">
                    <label className="block text-sm mb-2" htmlFor="password">New password</label>
                    <div className="relative">
                        <input
                            type={showPassword ? 'text' : 'password'}
                            id="password"
                            name="password"
                            autoComplete="new-password"
                            minLength={8}
                            maxLength={100}
                            className="w-full p-2 bg-[#2c2c3a] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#483AA0]"
                            placeholder="At least 8 characters"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                        <button
                            type="button"
                            className="absolute mt-2 right-2 text-sm text-gray-400 hover:text-gray-200"
                            onClick={() => setShowPassword(!showPassword)}
                        >
                            {showPassword ? 'Hide' : 'Show'}
                        </button>
                    </div>
                </div>

                <div className="mb-4">
                    <label className="block text-sm mb-2" htmlFor="confirm">Confirm new password</label>
                    <input
                        type={showPassword ? 'text' : 'password'}
                        id="confirm"
                        name="confirm"
                        autoComplete="new-password"
                        minLength={8}
                        maxLength={100}
                        className="w-full p-2 bg-[#2c2c3a] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#483AA0]"
                        placeholder="Re-enter your new password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        required
                    />
                </div>

                <button
                    disabled={loading}
                    type="submit"
                    className="w-full bg-[#483AA0] hover:bg-[#372a7a] hover:scale-105 active:scale-95 px-4 py-2 rounded-lg shadow-md transition duration-300 font-bold disabled:opacity-50"
                >
                    {loading ? 'Updating...' : 'Update Password'}
                </button>

                <p className="text-gray-400 mt-4 text-sm">
                    Changed your mind? <Link href="/auth/login" className="text-[#483AA0] hover:underline">Back to Sign In</Link>
                </p>
            </form>

            <Alert
                message={showAlert.message}
                visible={showAlert.visible}
                onClose={() => setShowAlert({ message: "", visible: false })}
            />
        </div>
    );
}

export default function ResetPasswordPage() {
    return (
        <div>
            <Navbar />
            <div className="flex flex-col items-center justify-center h-screen">
                <Suspense fallback={
                    <div className="bg-[#1f1f2e] rounded-lg p-5 shadow-lg m-5 md:m-10 w-full max-w-md">
                        <p className="text-gray-400">Loading…</p>
                    </div>
                }>
                    <ResetPasswordForm />
                </Suspense>
            </div>
        </div>
    );
}
