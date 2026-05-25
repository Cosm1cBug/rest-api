'use client';
import Navbar from "@/components/navbar.jsx";
import Alert from "@/components/alert.jsx";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useUser } from "@/contexts/userContext.jsx";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function Profile() {
    const [form, setForm] = useState({ username: "" });
    const [edit, setEdit] = useState(false);
    const [showAlert, setShowAlert] = useState({ message: "", visible: false });
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const { status } = useSession();
    const user = useUser();

    const alert = (message, visible) => {
        setShowAlert({ message, visible });
        if (visible) {
            setTimeout(() => setShowAlert({ message: "", visible: false }), 3000);
        }
    };

    const handleSave = async () => {
        if (!edit) {
            alert("No changes made", true);
            return;
        }

        if (!form.username || form.username === user.username) {
            setEdit(false);
            alert("No changes to save", true);
            return;
        }

        setLoading(true);

        const res = await fetch("/api/user/update", {
            method: "POST", // /api/user/update expects POST per its Zod schema
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: form.username }),
        });

        setLoading(false);

        const data = await res.json().catch(() => ({}));

        if (res.ok) {
            setEdit(false);
            alert(data.message || "Profile updated", true);
            // The userContext will re-fetch on next navigation; for an
            // immediate visual reflection, update the local form.
            setForm({ username: data?.user?.username || form.username });
        } else {
            alert(data.message || "Could not update profile", true);
        }
    };

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/auth/login?callbackUrl=/user/profile");
        }
    }, [status, router]);

    useEffect(() => {
        if (!user) return;
        setForm({ username: user.username || "" });
    }, [user]);

    if (!user) {
        return (
            <div className="h-screen flex items-center justify-center">
                <h1>Loading...</h1>
            </div>
        );
    }

    const quota = user.requestQuotaDaily || 0;
    const used  = user.requestToday || 0;

    return (
        <div>
            <Navbar />
            <div className="bg-[#1f1f2e] rounded-lg p-5 shadow-lg m-5 md:m-10 flex flex-col items-center scrollbar-hidden">
                <h1 className="text-xl md:text-2xl lg:text-3xl mb-2 font-bold">
                    User <span className="text-[#483AA0]">Profile</span>
                </h1>
                <div className="mt-8 w-full">
                    <div className="mb-5 md:mb-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">

                        <div className="bg-[#272149] rounded-lg p-5 px-10 shadow-lg">
                            <p className="text-gray-400 font-bold text-sm md:text-md">Username:</p>
                            <p className="text-md md:text-lg lg:text-xl font-bold overflow-x-auto">{user.username}</p>
                        </div>

                        <div className="bg-[#272149] rounded-lg p-5 px-10 shadow-lg">
                            <p className="text-gray-400 font-bold text-sm md:text-md">Email:</p>
                            <p className="text-md md:text-lg lg:text-xl font-bold overflow-x-auto">{user.email}</p>
                        </div>

                        <div className="bg-[#272149] rounded-lg p-5 px-10 shadow-lg">
                            <p className="text-gray-400 font-bold text-sm md:text-md">Daily Quota:</p>
                            <p className="text-md md:text-lg lg:text-xl font-bold overflow-x-auto">
                                {used.toLocaleString()} / {quota.toLocaleString()}
                            </p>
                        </div>

                        <div className="bg-[#272149] rounded-lg p-5 px-10 shadow-lg">
                            <p className="text-gray-400 font-bold text-sm md:text-md">Lifetime Requests:</p>
                            <p className="text-md md:text-lg lg:text-xl font-bold overflow-x-auto">
                                {(user.requestAll || 0).toLocaleString()}
                            </p>
                        </div>

                        <div className="bg-[#272149] rounded-lg p-5 px-10 shadow-lg">
                            <p className="text-gray-400 font-bold text-sm md:text-md">Role:</p>
                            <p className="text-md md:text-lg lg:text-xl font-bold overflow-x-auto">{user.role || "basic"}</p>
                        </div>

                        <div className="bg-[#272149] rounded-lg p-5 px-10 shadow-lg">
                            <p className="text-gray-400 font-bold text-sm md:text-md">API Keys:</p>
                            <p className="text-md md:text-lg lg:text-xl font-bold overflow-x-auto">
                                <Link href="/user/api-keys" className="hover:text-[#483AA0] hover:underline">
                                    {user.apiKeysActive || 0} active →
                                </Link>
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mx-5 md:mx-10 mb-10">
                <div className="bg-[#1f1f2e] rounded-lg p-5 shadow-lg flex flex-col items-center">
                    <h1 className="text-xl md:text-2xl lg:text-3xl mb-2 font-bold">
                        Edit <span className="text-[#483AA0]">Profile</span>
                    </h1>
                    <div className="mt-8 w-full">
                        <div className="flex flex-col gap-5">
                            <div className="flex flex-col">
                                <label className="block text-sm md:text-md lg:text-xl mb-2" htmlFor="username">Username</label>
                                <input
                                    type="text"
                                    id="username"
                                    name="username"
                                    minLength={3}
                                    maxLength={30}
                                    pattern="[a-zA-Z0-9_.-]+"
                                    className="w-full p-2 bg-[#2c2c3a] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#483AA0] disabled:opacity-60"
                                    placeholder="Enter your username"
                                    value={form.username}
                                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                                    disabled={!edit}
                                    required
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Letters, numbers, dots, underscores, and hyphens. 3–30 characters.
                                </p>
                            </div>
                        </div>
                    </div>
                    <button
                        disabled={loading}
                        type="button"
                        className={`h-[50px] w-1/2 mt-5 cursor-pointer bg-[#483AA0] hover:bg-[#372a7a] hover:scale-105 active:scale-95 p-3 px-5 rounded-full transition-all ${edit ? 'text-[#2c2c3a]' : ''}`}
                        onClick={() => {
                            if (edit) handleSave();
                            else setEdit(true);
                        }}
                    >
                        {loading ? 'Saving...' : edit ? 'Save' : 'Edit'}
                    </button>
                </div>
                <div className="bg-[#1f1f2e] rounded-lg p-5 shadow-lg flex flex-col items-center">
                    <h1 className="text-xl md:text-2xl lg:text-3xl mb-2 font-bold">
                        Account <span className="text-[#483AA0]">Security</span>
                    </h1>
                    <div className="flex flex-col items-stretch w-full mt-8 gap-3">
                        <Link
                            href="/user/api-keys"
                            className="text-center p-3 rounded-lg border border-[#483AA0] text-[#483AA0] hover:bg-[#483AA0] hover:text-white transition"
                        >
                            Manage API Keys
                        </Link>
                        <Link
                            href="/auth/forgot-password"
                            className="text-center p-3 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700 transition"
                        >
                            Change Password
                        </Link>
                    </div>
                </div>
            </div>
            <Alert message={showAlert.message} visible={showAlert.visible} onClose={() => setShowAlert({ message: "", visible: false })} />
        </div>
    );
}
