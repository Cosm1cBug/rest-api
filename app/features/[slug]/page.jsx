import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Navbar from "@/components/navbar.jsx";
import Link from "next/link";
import { useUser } from "@/context/userContext.jsx";

export default function Slug() {
    const router = useRouter();
    const [search, setSearch] = useState("");
    const [originalFolders, setOriginalFolders] = useState([]);
    const [folders, setFolders] = useState([]);
    const { slug } = router.query;
    const user = useUser();

    const handleSearch = (e) => {
        const value = e.target.value;
        setSearch(value);
        if (!value) {
            setFolders(originalFolders);
            return;
        }
        const filteredFolders = originalFolders.filter((folder) => folder.name.toLowerCase().includes(value.toLowerCase()) || folder.folder.toLowerCase().includes(value.toLowerCase()));
        setFolders(filteredFolders);
    }

    useEffect(() => {
        if (!slug) return;
        let url = "/api/features?type=" + slug;
        if (slug === "all") url = "/api/features";
        fetch(url, {
            method: "GET",
        }).then((res) => res.json())
            .then((data) => {
                setOriginalFolders(slug === "all" ? data.features : data);
                setFolders(slug === "all" ? data.features : data);
            });
    }, [slug]);

    return (
        <div>
            <Navbar />
            <div className="overflow-x-auto text-sm md:text-md lg:text-lg">
                <input type="search" value={search} placeholder="Search..." className="p-2 rounded-lg ml-5 md:ml-10 mt-5 md:mt-10 ring-1 hover:ring-[#483AA0] focus:ring-[#483AA0]" onChange={handleSearch} />
                <table className="w-full mt-5 md:mt-10 bg-[#1f1f2e] rounded-lg m-5 md:m-10 text-left">
                    <thead>
                        <tr>
                            <th scope="col" className="py-2 px-2 text-center">No</th>
                            <th scope="col" className="py-3 px-6">Feature Name</th>
                            <th scope="col" className="py-3 px-6">Category</th>
                            <th scope="col" className="py-3 px-6">Request Method</th>
                            <th scope="col" className="py-3 px-6">Description</th>
                            <th scope="col" className="py-3 px-6">Query Parameter</th>
                            <th scope="col" className="py-3 px-6">Status</th>
                            <th scope="col" className="py-3 px-6">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {folders.map((folder, index) => (
                            <tr key={index} className="border-b bg-gray-800 border-gray-700 hover:bg-gray-600">
                                <td className="py-2 px-2 text-center">{index + 1}</td>
                                <td className="py-4 px-6">{folder.name}</td>
                                <td className="py-4 px-6">{capitalize(folder.folder)}</td>
                                <td className={`py-4 px-6 font-bold ${folder.method == "GET" ? "text-green-500" : "text-red-500"}`}>{folder.method}</td>
                                <td className="py-4 px-6">{folder.desc}</td>
                                <td className="py-4 px-6">{folder.query}</td>
                                <td className={`py-4 px-6 font-bold ${folder.status == "true" ? "text-green-500" : "text-red-500"}`}>{folder.status == "true" ? "Active" : "Inactive"}</td>
                                <td className="py-6 px-8">
                                    <Link className="inline-block bg-[#483AA0] hover:bg-[#372a7a] hover:scale-105 active:scale-95 px-4 py-2 rounded-lg shadow-md transition duration-300 font-bold" href={`/api/features/${folder.folder}/${folder.name + folder.example}${folder.example ? "&apikey=" : "?apikey="}${user ? user.apikey : "APIKEY"}`}>
                                        View
                                    </Link>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

function capitalize(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}
