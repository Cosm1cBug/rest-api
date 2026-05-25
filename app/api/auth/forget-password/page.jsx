'use client';
import Navbar from "@/components/navbar";
import Alert from "@/components/alert";
import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [showAlert, setShowAlert] = useState({ message: "", visible: false });

    const alert = (message, visible) => {
        setShowAlert({ message, visible });
        if (visible) {
            setTimeout(() => setShowAlert({ message: "", visible: false }), 3000);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!email) return alert("Please enter your email.", true);

        setLoading(true);
        try {
            const res = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim() }),
            });

            const data = await res.json().catch(() => ({}));

            if (res.status === 429) {
                // Surface rate limit explicitly so users know to wait.
                alert(data.message || 'Too many requests. Please wait and try again.', true);
                return;
            }

            // For 200/400/500 we show the same generic success screen.
            // The server already collapses outcomes; we just mirror that.
            setSubmitted(true);
        } catch {
            alert('Network error. Please try again.', true);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <Navbar />
            <div className="flex flex-col items-center justify-center h-screen">
                <div className="bg-[#1f1f2e] rounded-lg p-5 shadow-lg m-5 md:m-10 w-full max-w-md">

                    {!submitted ? (
                        <>
                            <div>
                                <h1 className="text-xl md:text-2xl font-bold">Forgot Password</h1>
                                <p className="text-gray-400 mt-1">
                                    Enter your email and we'll send you a link to reset your password.
                                </p>
                            </div>

                            <form onSubmit={handleSubmit} className="mt-4">
                                <div className="mb-4">
                                    <label className="block text-sm mb-2" htmlFor="email">Email</label>
                                    <input
                                        type="email"
                                        id="email"
                                        name="email"
                                        autoComplete="email"
                                        className="w-full p-2 bg-[#2c2c3a] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#483AA0]"
                                        placeholder="Enter your email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                    />
                                </div>
                                <button
                                    disabled={loading}
                                    type="submit"
                                    className="w-full bg-[#483AA0] hover:bg-[#372a7a] hover:scale-105 active:scale-95 px-4 py-2 rounded-lg shadow-md transition duration-300 font-bold disabled:opacity-50"
                                >
                                    {loading ? 'Sending...' : 'Send Reset Link'}
                                </button>
                                <p className="text-gray-400 mt-4 text-sm">
                                    Remembered it?{' '}
                                    <Link href="/auth/login" className="text-[#483AA0] hover:underline">Sign In</Link>
                                </p>
                            </form>
                        </>
                    ) : (
                        <>
                            <h1 className="text-xl md:text-2xl font-bold">Check your email</h1>
                            <p className="text-gray-400 mt-2">
                                If an account exists for <strong>{email}</strong>, we've sent it a
                                password reset link. The link is valid for 1 hour.
                            </p>
                            <p className="text-gray-500 text-sm mt-3">
                                Not seeing it? Check your spam folder, or wait a minute and try again.
                            </p>
                            <div className="flex gap-2 mt-5">
                                <button
                                    onClick={() => { setSubmitted(false); setEmail(''); }}
                                    className="flex-1 bg-transparent border border-[#483AA0] text-[#483AA0] hover:bg-[#483AA0] hover:text-white px-4 py-2 rounded-lg transition duration-300"
                                >
                                    Use a different email
                                </button>
                                <Link
                                    href="/auth/login"
                                    className="flex-1 text-center bg-[#483AA0] hover:bg-[#372a7a] px-4 py-2 rounded-lg shadow-md transition duration-300 font-bold"
                                >
                                    Back to Sign In
                                </Link>
                            </div>
                        </>
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
