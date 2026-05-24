'use client';
import Navbar from "@/components/navbar";
import Alert from "@/components/alert";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";

export default function Login() {
    const [form, setForm] = useState({ email: '', password: '' });
    const [showPassword, setShowPassword] = useState(false);
    const [showAlert, setShowAlert] = useState({ message: "", visible: false });
    const [loading, setLoading] = useState(false);
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
                    <form onSubmit={handleSubmit} className="mt-4">
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
                        <button disabled={loading} type="submit" className="w-full bg-[#483AA0] hover:bg-[#372a7a] hover:scale-105 active:scale-95 px-4 py-2 rounded-lg shadow-md transition duration-300 font-bold">
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