'use client';
import Navbar from "@/components/navbar";
import Alert from "@/components/alert";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";

// Display labels + simple inline SVG marks for the OAuth providers
// we currently support. Keeping the icons inline (rather than fetching
// from a CDN) avoids the sandboxed-preview CSP / image issues and means
// the login page stays fully functional with no external network deps.
const OAUTH_PROVIDER_META = {
    google: {
        label: 'Sign in with Google',
        // Google "G" mark, simplified to a single-color path to keep
        // the markup small. Full multicolor logo requires a license note.
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/>
            </svg>
        )
    },
    github: {
        label: 'Sign in with GitHub',
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.4 3-.405 1.02.005 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
            </svg>
        )
    }
};

export default function Login() {
    const [form, setForm] = useState({ email: '', password: '' });
    const [showPassword, setShowPassword] = useState(false);
    const [showAlert, setShowAlert] = useState({ message: "", visible: false });
    const [loading, setLoading] = useState(false);
    const [oauthLoadingId, setOauthLoadingId] = useState(null);
    const [enabledOAuth, setEnabledOAuth] = useState([]);
    const router = useRouter();
    const { status } = useSession();

    const alert = (message, visible) => {
        setShowAlert({ message, visible });
        if (visible) {
            setTimeout(() => setShowAlert({ message: "", visible: false }), 3000);
        }
    };

    // Fetch the list of configured OAuth providers on mount.
    // The endpoint is cached for 60s by the CDN so this is cheap.
    useEffect(() => {
        let cancelled = false;
        fetch('/api/auth/oauth-providers')
            .then(r => (r.ok ? r.json() : { providers: [] }))
            .then(data => {
                if (!cancelled && Array.isArray(data.providers)) {
                    setEnabledOAuth(data.providers);
                }
            })
            .catch(() => { /* swallow — show only credentials form */ });
        return () => { cancelled = true; };
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();

        setLoading(true);

        const res = await signIn("credentials", {
            redirect: false,
            email: form.email,
            password: form.password,
        });

        setLoading(false);

        if (res.ok) {
            router.push("/dashboard");
        } else {
            alert("Invalid email or password.", true);
        }
    };

    // OAuth sign-in. callbackUrl is /dashboard so users land in the
    // same place credentials users do. We let NextAuth do the redirect
    // (redirect: true is default) because OAuth flows REQUIRE a full
    // browser navigation to the provider's consent screen.
    const handleOAuth = async (providerId) => {
        setOauthLoadingId(providerId);
        try {
            await signIn(providerId, { callbackUrl: '/dashboard' });
        } catch {
            setOauthLoadingId(null);
            alert('Could not start sign-in. Please try again.', true);
        }
    };

    useEffect(() => {
        if (status === "authenticated") {
            router.push("/dashboard");
        }
    }, [status, router]);

    return (
        <div>
            <Navbar />
            <div className="flex flex-col items-center justify-center h-screen">
                <div className="bg-[#1f1f2e] rounded-lg p-5 shadow-lg m-5 md:m-10">
                    <div>
                        <h1 className="text-xl md:text-2xl font-bold">Sign In</h1>
                        <p className="text-gray-400">Enter your email and password, or sign up if you don&apos;t have an account</p>
                    </div>

                    {/* OAuth buttons, shown only if at least one provider is configured */}
                    {enabledOAuth.length > 0 && (
                        <>
                            <div className="mt-5 space-y-2">
                                {enabledOAuth.map((providerId) => {
                                    const meta = OAUTH_PROVIDER_META[providerId];
                                    if (!meta) return null;
                                    const busy = oauthLoadingId === providerId;
                                    return (
                                        <button
                                            key={providerId}
                                            type="button"
                                            disabled={busy || loading}
                                            onClick={() => handleOAuth(providerId)}
                                            className="w-full flex items-center justify-center gap-2 bg-[#2c2c3a] hover:bg-[#3a3a4a] px-4 py-2 rounded-lg shadow-md transition duration-200 font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                                            aria-label={meta.label}
                                        >
                                            {meta.icon}
                                            <span>{busy ? 'Redirecting…' : meta.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="flex items-center my-4">
                                <div className="flex-1 h-px bg-gray-600" />
                                <span className="px-3 text-xs text-gray-500 uppercase">or</span>
                                <div className="flex-1 h-px bg-gray-600" />
                            </div>
                        </>
                    )}

                    <form onSubmit={handleSubmit} className={enabledOAuth.length > 0 ? "" : "mt-4"}>
                        <div className="mb-4">
                            <label className="block text-sm mb-2" htmlFor="email">Email</label>
                            <input
                                type="email"
                                id="email"
                                name="email"
                                className="w-full p-2 bg-[#2c2c3a] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#483AA0]"
                                placeholder="Enter your email"
                                value={form.email}
                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                                required
                            />
                        </div>
                        <div className="mb-4">
                            <div className="flex justify-between items-center mb-2">
                                <label className="block text-sm mb-2" htmlFor="password">Password</label>
                                <Link href="/reset-password" className="text-sm text-[#483AA0] hover:underline">Forgot Password?</Link>
                            </div>
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    id="password"
                                    name="password"
                                    className="w-full p-2 bg-[#2c2c3a] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#483AA0]"
                                    placeholder="Enter your password"
                                    value={form.password}
                                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                                    required
                                />
                                <button type="button" className="absolute mt-2 right-2 text-sm text-gray-400 hover:text-gray-200" onClick={() => setShowPassword(!showPassword)}>{showPassword ? "Hide" : "Show"}</button>
                            </div>
                        </div>
                        <button disabled={loading || !!oauthLoadingId} type="submit" className="w-full bg-[#483AA0] hover:bg-[#372a7a] hover:scale-105 active:scale-95 px-4 py-2 rounded-lg shadow-md transition duration-300 font-bold disabled:opacity-60 disabled:cursor-not-allowed">
                            {loading ? 'Loading...' : 'Sign In'}
                        </button>
                        <p className="text-gray-400 mt-4">Don&apos;t have an account? <Link href="/auth/register" className="text-[#483AA0] hover:underline">Sign Up</Link></p>
                    </form>
                </div>
            </div>
            <Alert message={showAlert.message} visible={showAlert.visible} onClose={() => setShowAlert({ message: "", visible: false })} />
        </div>
    );
}
