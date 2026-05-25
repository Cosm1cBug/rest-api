'use client';
import Navbar from "@/components/navbar.jsx";
import Alert from "@/components/alert.jsx";
import { useState, useEffect } from "react";
import { useUser } from "@/contexts/userContext.jsx";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function Profile() { 
    const [form, setForm] = useState({ name: "", apikey: "" });
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

        setLoading(true);

        const result = await fetch("/api/user/update", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: user.email,
                name: form.name,
                apikey: form.apikey,
            }),
        });

        setLoading(false);

        const data = await result.json();

        if (data.success) {
            setEdit(false);
            alert(data.message, true);
            user.name = form.name;
            user.apikey = form.apikey;
        } else {
            alert(data.message, true);
        }
    };

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/auth/login");
        }
    }, [status, router]);

    useEffect(() => {
        if (!user) return;
        setForm({
            name: user.name || "",
            apikey: user.apikey || ""
        });
    }, [user]);

    if (!user) {
        return (
            <div className="h-screen flex items-center justify-center">
                <h1>Loading...</h1>
            </div>
        )
    };

    return (
        <div>
            <Navbar />
            <div className="bg-[#1f1f2e] rounded-lg p-5 shadow-lg m-5 md:m-10 flex flex-col items-center scrollbar-hidden">
                <h1 className="text-xl md:text-2xl lg:text-3xl mb-2 font-bold">User <span className="text-[#483AA0]">Profile</span></h1>
                <div className="mt-8">
                    <div className="mb-5 md:mb-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        <div className="bg-[#272149] rounded-lg p-5 px-10 shadow-lg">
                            <p className="text-gray-400 font-bold text-sm md:text-md">Name:</p>
                            <p className="text-md md:text-lg lg:text-xl font-bold overflow-x-auto">{user.name}</p>
                        </div>
                        <div className="bg-[#272149] rounded-lg p-5 px-10 shadow-lg">
                            <p className="text-gray-400 font-bold text-sm md:text-md">Email:</p>
                            <p className="text-md md:text-lg lg:text-xl font-bold overflow-x-auto">{user.email}</p>
                        </div>
                        <div className="bg-[#272149] rounded-lg p-5 px-10 shadow-lg">
                            <p className="text-gray-400 font-bold text-sm md:text-md">Apikey:</p>
                            <div className="flex items-center">
                                <p className="text-md md:text-lg lg:text-xl font-bold overflow-x-auto">{user.apikey}</p>
                                <button onClick={() => navigator.clipboard.writeText(user.apikey).then(() => alert("Copied to clipboard!", true))} className="text-md md:text-lg lg:text-xl font-bold hover:text-[#483AA0] pl-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div className="bg-[#272149] rounded-lg p-5 px-10 shadow-lg">
                            <p className="text-gray-400 font-bold text-sm md:text-md">Limit API:</p>
                            <p className="text-md md:text-lg lg:text-xl font-bold overflow-x-auto">{`${user.request_today} / ${limit[user.status]}`}</p>
                        </div>
                        <div className="bg-[#272149] rounded-lg p-5 px-10 shadow-lg">
                            <p className="text-gray-400 font-bold text-sm md:text-md">Status User:</p>
                            <p className="text-md md:text-lg lg:text-xl font-bold overflow-x-auto">{user.status}</p>
                        </div>
                        <div className="bg-[#272149] rounded-lg p-5 px-10 shadow-lg">
                            <p className="text-gray-400 font-bold text-sm md:text-md">Expired:</p>
                            <p className="text-md md:text-lg lg:text-xl font-bold overflow-x-auto">{/premium|vip/i.test(user.status) ? getRemainingTime(user.endDate) : "No Subscription"}</p>
                        </div>
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mx-5 md:mx-10 mb-10">
                <div className="bg-[#1f1f2e] rounded-lg p-5 shadow-lg flex flex-col items-center">
                    <h1 className="text-xl md:text-2xl lg:text-3xl mb-2 font-bold">Edit <span className="text-[#483AA0]">Profile</span></h1>
                    <div className="mt-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-20">
                            <div className="flex flex-col">
                                <label className="block text-sm md:text-md lg:text-xl mb-2" htmlFor="name">Username</label>
                                <div className="flex flex-row">
                                    <input
                                        type="text"
                                        id="name"
                                        name="name"
                                        className="w-full p-2 bg-[#2c2c3a] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#483AA0]"
                                        placeholder="Enter your name"
                                        value={form.name}
                                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                                        disabled={!edit}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="flex flex-col mb-5">
                                <label className="block text-sm md:text-md lg:text-xl mb-2" htmlFor="apikey">API Key</label>
                                <div className="flex flex-row">
                                    <input
                                        type="text"
                                        id="apikey"
                                        name="apikey"
                                        className="w-full p-2 bg-[#2c2c3a] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#483AA0]"
                                        placeholder="Enter your apikey"
                                        value={form.apikey}
                                        onChange={(e) => setForm({ ...form, apikey: e.target.value })}
                                        disabled={!edit}
                                        required
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                    <button disabled={loading} type="button" className={`h-[50px] w-1/2 mt-5 cursor-pointer bg-[#483AA0] hover:bg-[#372a7a] hover:scale-105 active:scale-95 p-3 px-5 rounded-full transition-all ${edit ? 'text-[#2c2c3a]' : ''}`} onClick={() => {
                        if (edit) {
                            handleSave();
                        } else {
                            setEdit(true);
                        }
                    }}>{loading ? 'Saving...' : edit ? 'Save' : 'Edit'}</button>
                </div>
                <div className="bg-[#1f1f2e] rounded-lg p-5 shadow-lg flex flex-col items-center">
                    <h1 className="text-xl md:text-2xl lg:text-3xl mb-2 font-bold">Subscription <span className="text-[#483AA0]">History</span></h1>
                    <div className="flex flex-col items-center justify-center mt-8">
                        <p>Coming soon...</p>
                    </div>
                </div>
            </div>
            <Alert message={showAlert.message} visible={showAlert.visible} onClose={() => setShowAlert({ message: "", visible: false })} />
        </div>
    )
}
const limit = {
    "basic": 100,
    "premium": 1000,
    "vip": 10000,
    "admin": 100000
}

function getRemainingTime(endDate) {
    const now = new Date();
    const end = new Date(endDate);
    const diffMs = end - now;

    if (diffMs <= 0) return "Expired";

    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
    const diffMinutes = Math.floor((diffMs / (1000 * 60)) % 60);

    return `${diffDays} hari, ${diffHours} jam, ${diffMinutes} menit`;
}
