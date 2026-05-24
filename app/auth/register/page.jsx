'use client';
import Navbar from "@/components/navbar";
import Alert from "@/components/alert";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export default function Register() {
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [loadingResend, setLoadingResend] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(30);
    const [showPassword, setShowPassword] = useState(false);
    const [form, setForm] = useState({ username: '', email: '', password: '', otp: '' });
    const [showAlert, setShowAlert] = useState({ message: "", visible: false });
    const [apiKey, setApiKey] = useState('');
    const [apiKeyId, setApiKeyId] = useState('');
    const [acknowledgedSaved, setAcknowledgedSaved] = useState(false);
    const [copyLabel, setCopyLabel] = useState('Copy');

    const router = useRouter();
    const { status } = useSession();

    const alert = (message, visible) => {
        setShowAlert({ message, visible });
        if (visible) {
            setTimeout(() => setShowAlert({ message: "", visible: false }), 3000);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        setLoading(true);

        const res = await fetch('/api/auth/send-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: form.email }),
        });

        setLoading(false);

        const data = await res.json();

        if (res.ok) {
            const expiredAt = Date.now() + 5 * 60 * 1000;
            sessionStorage.setItem('registerForm', JSON.stringify({ ...form, expiredAt }));

            alert(data.message, true);
            setStep(2);
        } else {
            alert(data.message, true);
        }
    };

    const handleVerify = async (e) => {
        e.preventDefault();
        if (form.otp.length !== 6 || isNaN(form.otp)) {
            return alert('OTP must be a 6-digit number.', true);
        }

        setLoading(true);

        const res = await fetch('/api/auth/verify-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...form }),
        });

        setLoading(false);

        const data = await res.json();

        if (res.ok) {
            // Clear cached form so the password is not left in sessionStorage.
            sessionStorage.removeItem('registerForm');

            if (data.apiKey) {
                setApiKey(data.apiKey);
                setApiKeyId(data.apiKeyId || '');
                setStep(3);
            } else {
                // Defensive fallback if the server response shape changes.
                alert(data.message || 'Account created.', true);
                await delay(2000);
                router.push('/auth/login');
            }
        } else {
            alert(data.message, true);
        }
    };

    const handleCopyApiKey = async () => {
        try {
            await navigator.clipboard.writeText(apiKey);
            setCopyLabel('Copied!');
            setTimeout(() => setCopyLabel('Copy'), 2000);
        } catch {
            alert('Could not copy. Please select and copy manually.', true);
        }
    };

    const handleProceedToLogin = () => {
        // Wipe the key from memory before navigating away.
        setApiKey('');
        setApiKeyId('');
        router.push('/auth/login');
    };

    const handleResend = async () => {
        if (!form?.email || resendCooldown > 0) return;

        setLoadingResend(true);

        const res = await fetch('/api/auth/send-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: form.email }),
        });

        setLoadingResend(false);

        const data = await res.json();

        if (res.ok) {
            const expiredAt = Date.now() + 5 * 60 * 1000;
            sessionStorage.setItem('registerForm', JSON.stringify({ ...form, expiredAt }));

            alert(data.message, true);
            setResendCooldown(30);
        } else {
            alert(data.message, true);
        }
    };

    const handleChangeEmail = () => {
        sessionStorage.removeItem('registerForm');
        setForm({ ...form, email: '' });
        setStep(1);
    };

    useEffect(() => {
        const storedForm = sessionStorage.getItem('registerForm');
        if (storedForm) {
            const parsed = JSON.parse(storedForm);

            if (parsed.expiredAt && parsed.expiredAt > Date.now()) {
                setForm(parsed);
                setStep(2);
            } else {
                sessionStorage.removeItem('registerForm');
            }
        }
    }, []);

    useEffect(() => {
        // Don't auto-redirect while the user is being shown their one-time key.
        if (status === "authenticated" && step !== 3) {
            router.push("/dashboard");
        }
    }, [status, router, step]);

    useEffect(() => {
        let interval;
        if (resendCooldown > 0) {
            interval = setInterval(() => {
                setResendCooldown(prev => prev - 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [resendCooldown]);

    return (
        <div>
            {step === 1 && (
                <div>
                    <Navbar />
                    <div className="flex flex-col items-center justify-center h-screen">
                        <div className="bg-[#1f1f2e] rounded-lg p-5 shadow-lg m-5 md:m-10">
                            <div>
                                <h1 className="text-xl md:text-2xl font-bold">Sign Up</h1>
                                <p className="text-gray-400">Create a new account by entering your details below</p>
                            </div>
                            <form onSubmit={handleSubmit} className="mt-4">
                                <div className="mb-4">
                                    <label className="block text-sm mb-2" htmlFor="email">Email</label>
                                    <input
                                        type="email"
                                        id="email"
                                        name="email"
                                        className="w-full p-2 bg-[#2c2c3a] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#483AA0]"
                                        placeholder="Enter your email"
                                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="mb-4">
                                    <label className="block text-sm mb-2" htmlFor="username">Username</label>
                                    <input
                                        type="text"
                                        id="username"
                                        name="username"
                                        className="w-full p-2 bg-[#2c2c3a] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#483AA0]"
                                        placeholder="Enter your username"
                                        onChange={(e) => setForm({ ...form, username: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="mb-4">
                                    <label className="block text-sm mb-2" htmlFor="password">Password</label>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            id="password"
                                            name="password"
                                            className="w-full p-2 bg-[#2c2c3a] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#483AA0]"
                                            placeholder="Enter your password"
                                            onChange={(e) => setForm({ ...form, password: e.target.value })}
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
                                <button disabled={loading} type="submit" className="w-full bg-[#483AA0] hover:bg-[#372a7a] hover:scale-105 active:scale-95 px-4 py-2 rounded-lg shadow-md transition duration-300 font-bold">
                                    {loading ? 'Loading...' : 'Sign Up'}
                                </button>
                                <p className="text-gray-400 mt-4">Already have an account? <Link href="/auth/login" className="text-[#483AA0] hover:underline">Sign In</Link></p>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {step === 2 && (
                <div>
                    <div className="flex flex-col items-center justify-center h-screen">
                        <div className="bg-[#1f1f2e] rounded-lg p-5 shadow-lg m-5 md:m-10">
                            <div className="mb-4">
                                <h1 className="text-xl md:text-2xl font-bold">Check Your Email</h1>
                                <p className="text-gray-400">Please Enter 6 digit OTP</p>
                            </div>
                            <div className="mb-4 flex flex-col">
                                <p className="text-gray-400 mb-2">We have sent an OTP to <span className="text-[#483AA0]">{form.email}</span>. Please enter the OTP below to verify your email.</p>
                                <button
                                    onClick={() => handleChangeEmail()}
                                    className="text-[#483AA0] hover:underline mb-2 text-left"
                                >
                                    Change Email?
                                </button>
                                <form onSubmit={handleVerify}>
                                    <input
                                        type="text"
                                        value={form.otp}
                                        onChange={(e) => setForm({ ...form, otp: e.target.value })}
                                        className="w-full p-2 bg-[#2c2c3a] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#483AA0]"
                                        placeholder="Enter your OTP"
                                        required
                                    />
                                    <div className='flex flex-col'>
                                        <button
                                            type="submit"
                                            disabled={loading}
                                            className="mt-4 bg-[#483AA0] hover:bg-[#372a7a] hover:scale-105 active:scale-95 px-4 py-2 rounded-lg shadow-md transition duration-300 font-bold"
                                        >
                                            {loading ? 'Loading...' : 'Verify OTP'}
                                        </button>
                                        <button
                                            type='button'
                                            onClick={handleResend}
                                            className={`mt-2 bg-transparent ${resendCooldown > 0 ? 'text-gray-500' : ''} hover:underline`}
                                            disabled={loadingResend || resendCooldown > 0}
                                        >
                                            {loadingResend ? 'Loading...' : resendCooldown === 0 ? 'Resend OTP' : `Resend OTP in ${resendCooldown} seconds`}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {step === 3 && (
                <div>
                    <div className="flex flex-col items-center justify-center min-h-screen">
                        <div className="bg-[#1f1f2e] rounded-lg p-5 shadow-lg m-5 md:m-10 w-full max-w-xl">
                            <div className="mb-4">
                                <h1 className="text-xl md:text-2xl font-bold">Save Your API Key</h1>
                                <p className="text-gray-400 mt-1">
                                    This is the <strong>only time</strong> we will show you this key.
                                    Store it somewhere safe (a password manager is ideal).
                                    If you lose it, you must generate a new one.
                                </p>
                            </div>

                            {apiKeyId && (
                                <div className="mb-3">
                                    <label className="block text-sm text-gray-400 mb-1">Key ID</label>
                                    <code className="block w-full p-2 bg-[#2c2c3a] rounded-lg break-all text-sm">
                                        {apiKeyId}
                                    </code>
                                </div>
                            )}

                            <div className="mb-4">
                                <label className="block text-sm text-gray-400 mb-1">API Key</label>
                                <div className="flex items-center gap-2">
                                    <code className="block flex-1 p-2 bg-[#2c2c3a] rounded-lg break-all text-sm">
                                        {apiKey}
                                    </code>
                                    <button
                                        type="button"
                                        onClick={handleCopyApiKey}
                                        className="px-3 py-2 bg-[#483AA0] hover:bg-[#372a7a] rounded-lg text-sm font-bold"
                                    >
                                        {copyLabel}
                                    </button>
                                </div>
                            </div>

                            <label className="flex items-start gap-2 mb-4 text-sm text-gray-300 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={acknowledgedSaved}
                                    onChange={(e) => setAcknowledgedSaved(e.target.checked)}
                                    className="mt-1"
                                />
                                <span>
                                    I have saved my API key. I understand it will not be shown again
                                    and that the server has no way to recover it.
                                </span>
                            </label>

                            <button
                                type="button"
                                disabled={!acknowledgedSaved}
                                onClick={handleProceedToLogin}
                                className="w-full bg-[#483AA0] hover:bg-[#372a7a] disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg shadow-md transition duration-300 font-bold"
                            >
                                Continue to Sign In
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <Alert message={showAlert.message} visible={showAlert.visible} onClose={() => setShowAlert({ message: "", visible: false })} />
        </div>
    );
}
