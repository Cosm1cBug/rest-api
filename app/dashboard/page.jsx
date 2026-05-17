'use client'
import Navbar from "@/components/navbar"
import { useState, useEffect } from "react"
import io from 'socket.io-client'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts"

export default function Dashboard() {
    const [totalViews, setTotalViews] = useState(null);
    const [totalRequestToday, setTotalRequestToday] = useState(null);
    const [totalRequests, setTotalRequests] = useState(null);
    const [time, setTime] = useState(null);
    const [liveRequests, setLiveRequests] = useState([]);
    const [topEndpoints, setTopEndpoints] = useState([]);
    const [topUsers, setTopUsers] = useState([]);
    const [systemStats, setSystemStats] = useState(null);    
    const [telemetry, setTelemetry] = useState(null);
    const [queueStats, setQueueStats] = useState(null);
    const [chartData, setChartData] = useState([]);
    const [ipAnalystics, setIPAnalytics] = useState([]);

    const formatTime = time?.toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    }).replace(/\./g, ":"); 

    useEffect(() => {
        setTime(new Date());
        const interval = setInterval(() => {
            setTime(new Date());
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const fetchViews = async () => {
            const cacheKey = "views_index_cache";
            const expireKey = "views_index_expire";
            const now = Date.now();

            const cached = localStorage.getItem(cacheKey);
            const expire = localStorage.getItem(expireKey);

            const isCacheValid = cached && expire && now < Number(expire);

            if (isCacheValid) {
                setTotalViews(Number(cached));
                return;
            }

            try {
                const res = await fetch("/api/views/index", { method: "POST" });
                if (!res.ok) throw new Error("Failed to fetch views");

                const data = await res.json();
                if (data?.views !== undefined) {
                    setTotalViews(data.views);
                    localStorage.setItem(cacheKey, data.views.toString());
                    localStorage.setItem(expireKey, (now + 1000 * 60 * 10).toString());
                }
            } catch (error) {
                console.error("Error fetching views:", error);
            }
        };

        fetchViews();
    }, []);


    useEffect(() => {
        const updateRequestCounts = () => {
            const now = Date.now();

            const todayCacheKey = "request_count_today_cache";
            const todayExpireKey = "request_count_today_expire";
            const cachedToday = localStorage.getItem(todayCacheKey);
            const expireToday = localStorage.getItem(todayExpireKey);

            const allCacheKey = "request_count_cache";
            const allExpireKey = "request_count_expire";
            const cachedAll = localStorage.getItem(allCacheKey);
            const expireAll = localStorage.getItem(allExpireKey);

            const isTodayCacheValid = cachedToday && expireToday && now < Number(expireToday);
            const isAllCacheValid = cachedAll && expireAll && now < Number(expireAll);

            if (isTodayCacheValid) {
                setTotalRequestToday(Number(cachedToday));
            }
            if (isAllCacheValid) {
                setTotalRequests(Number(cachedAll));
            }

            if (!isTodayCacheValid || !isAllCacheValid) {
                fetch("/api/stats/requests")
                    .then((res) => res.json())
                    .then((data) => {
                        if (data?.total_requests_today !== undefined) {
                            setTotalRequestToday(data.total_requests_today);
                            localStorage.setItem(todayCacheKey, data.total_requests_today.toString());
                            localStorage.setItem(todayExpireKey, (now + 1000 * 60 * 10).toString());
                        }

                        if (data?.total_requests_all !== undefined) {
                            setTotalRequests(data.total_requests_all);
                            localStorage.setItem(allCacheKey, data.total_requests_all.toString());
                            localStorage.setItem(allExpireKey, (now + 1000 * 60 * 10).toString());
                        }
                    })
                    .catch((err) => console.error("Fetch error:", err));
            }
        };

        updateRequestCounts();
        const interval = setInterval(updateRequestCounts, 1000 * 60 * 10);

        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        fetch('/api/socket');
        
        const socket = io();
        
        socket.on('api-request', (data) => {
            setLiveRequests(prev => [
                data,
                ...prev
            ].slice(0, 20));
        });

        socket.on('telemetry-update', data => {
            setTelemetry(data)
        })

        return () => {
            socket.disconnect();
        };
    }, []);

    useEffect(() => {
        const fetchAdvanced = async () => {
            try {
                const res = await fetch('/api/dashboard/advanced');
                const data = await res.json();

                setTopEndpoints(data.topEndpoints || []);
                setTopUsers(data.topUsers || []);

            } catch (err) {
                console.error(err);
            }
        };

        fetchAdvanced();

    }, []);

    useEffect(() => {
        const fetchTelemetry = async () => {
            try {
                const res = await fetch('/api/dashboard/telemetry')
                const data = await res.json()

                setTelemetry(data)

            } catch (err) {
                console.error(err)
            }
        }

        fetchTelemetry()

        const interval = setInterval(fetchTelemetry, 3000)

        return () => clearInterval(interval)

    }, [])

    useEffect(() => {
        const fetchQueue = async () => {
            try {
                const res = await fetch('/api/dashboard/queue')
                const data = await res.json()

                setQueueStats(data)
            } catch (err) {
                console.log(err)
            }
        }
        fetchQueue()

        const interval = setInterval(fetchQueue, 3000)

        return () => clearInterval(interval)
    }, [])

    useEffect(() => {
        const fetchCharts = async () => {
            try {
                const res = await fetch('/api/dashboard/charts')
                const data = await res.json()

                const formatted = data.hourly.map(item => ({
                    hour: item._id.hour,
                    requests: item.requests,
                    latency: Math.round(item.avgLatency)
                }))

                setChartData(formatted)
            } catch (err) {
                console.error(err)
            }
        }

        fetchCharts()

        const interval = setInterval(fetchCharts, 10000)

        return () => clearInterval(interval)

    }, [])

    useEffect(() => {
        const fetchIPs = async () => {
            try {
                const res = await fetch('/api/dashboard/ip')
                const data = await res.json()

                setIpAnalytics(data.topIPs || [])

            } catch (err) {
                console.error(err)
            }
        }

        fetchIPs()

        const interval = setInterval(fetchIPs, 5000)

        return () => clearInterval(interval)

    }, [])
    
    return (
        <div>
            <Navbar />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-5 p-5 md:p-10 w-full overflow-y-auto"> 
                <div className="bg-[#1f1f2e] rounded-lg p-5 shadow-lg mb-5">
                    <h2 className="text-sm md:text-md mb-2 text-[#483AA0]">Total Views</h2>
                    <div className="flex items-center justify-between mb-4 text-xl md:text-2xl font-bold">
                        <p className="text-gray-400">{totalViews !== null ? formatNumber(totalViews) : (
                            <span>Loading...</span>
                        )}</p>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6 text-[#483AA0]">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        </svg>
                    </div>  
                </div>
                <div className="bg-[#1f1f2e] rounded-lg p-5 shadow-lg mb-5">
                    <h2 className="text-sm md:text-md mb-2 text-[#483AA0]">Request Today</h2>
                    <div className="flex items-center justify-between mb-4 text-xl md:text-2xl font-bold">
                        <p className="text-gray-400">{totalRequestToday !== null ? formatNumber(totalRequestToday) : (
                            <span>Loading...</span>
                        )}</p>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-5 md:size-6 lg:size-7 text-[#483AA0]">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6 9 12.75l4.286-4.286a11.948 11.948 0 0 1 4.306 6.43l.776 2.898m0 0 3.182-5.511m-3.182 5.51-5.511-3.181" />
                        </svg>
                    </div>  
                </div>
                <div className="bg-[#1f1f2e] rounded-lg p-5 shadow-lg mb-5">
                    <h2 className="text-sm md:text-md mb-2 text-[#483AA0]">Total Requests</h2>
                    <div className="flex items-center justify-between mb-4 text-xl md:text-2xl font-bold">
                        <p className="text-gray-400">{totalRequests !== null ? formatNumber(totalRequests) : (
                            <span>Loading...</span>
                        )}</p>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-5 md:size-6 lg:size-7 text-[#483AA0]">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />
                        </svg>
                    </div>
                </div>
                <div className="bg-[#1f1f2e] rounded-lg p-5 shadow-lg mb-5">
                    <h2 className="text-sm md:text-md mb-2 text-[#483AA0]">Time</h2>
                    <div className="flex items-center justify-between mb-4 text-xl md:text-2xl font-bold">
                        <p className="text-gray-400">{formatTime}</p>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-5 md:size-6 lg:size-7 text-[#483AA0]">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                        </svg>
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mx-5 md:mx-10">
                <div className="w-full flex flex-col items-center">
                    <div className="bg-[#1f1f2e] rounded-lg shadow-lg mb-5 w-full">
                        <h1 className="text-xl md:text-2xl lg:text-3xl text-[#483AA0] p-5 font-bold">S&K</h1>
                        {rules.map((rule, index) => (
                            <div key={index} className={`px-5 pb-3 ${index + 1 === rules.length ? "pb-6" : ""}`}>
                                <p className="text-gray-400 text-sm lg:text-md">{index + 1}. {rule}</p>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="w-full flex flex-col items-center">
                    <div className="bg-[#1f1f2e] rounded-lg shadow-lg mb-5 w-full">
                        <h1 className="text-xl md:text-2xl lg:text-3xl text-[#483AA0] p-5 font-bold">Thanks to</h1>
                        {thanks.map((rule, index) => (
                            <div key={index} className={`px-5 pb-3 ${index + 1 === thanks.length ? "pb-6" : ""}`}>
                                <p className="text-gray-400 text-sm lg:text-md">{index + 1}. {rule}</p>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="mx-5 md:mx-10 mb-10">
                    <div className="bg-[#1f1f2e] rounded-lg p-5 shadow-lg">
                        <h2 className="text-2xl font-bold text-[#483AA0] mb-5">Live Requests</h2>
                        <div className="space-y-3 max-h-[400px] overflow-y-auto">{liveRequests.map((req, idx) => (
                            <div key={idx} className="bg-[#29293d] p-4 rounded">
                                <p className="text-gray-300"><strong>Endpoint:</strong>{' '}{req.endpoint}</p>
                                <p className="text-gray-300"><strong>Status:</strong>{' '}{req.status}</p>
                                <p className="text-gray-300"><strong>Duration:</strong>{' '}{req.duration}ms</p>
                            </div>
                        ))}
                    </div>
                </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mx-5 md:mx-10 mb-10">
                    <div className="bg-[#1f1f2e] rounded-lg p-5 shadow-lg">
                        <h2 className="text-2xl font-bold text-[#483AA0] mb-5">Top Endpoints</h2>
                        {topEndpoints.map((item, idx) => (
                            <div key={idx} className="flex justify-between py-2 border-b border-gray-700">
                                <span className="text-gray-300">{item._id} </span>
                                <span className="text-gray-400">{item.count}</span>
                            </div>
                        ))}
                    </div>
                    <div className="bg-[#1f1f2e] rounded-lg p-5 shadow-lg">
                        <h2 className="text-2xl font-bold text-[#483AA0] mb-5">Top Users</h2>
                        {topUsers.map((item, idx) => (
                            <div key={idx} className="flex justify-between py-2 border-b border-gray-700">
                                <span className="text-gray-300">{item._id}</span>
                                <span className="text-gray-400">{item.count}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="mx-5 md:mx-10 mb-10">
                    <div className="bg-[#1f1f2e] rounded-lg p-5 shadow-lg">
                        <h2 className="text-2xl font-bold text-[#483AA0] mb-5">System Telemetry</h2>
                        {telemetry && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                                <div className="bg-[#29293d] p-4 rounded">
                                    <p className="text-gray-400">Requests</p>
                                    <h3 className="text-2xl font-bold">{telemetry.requests}</h3>
                                </div>

                                <div className="bg-[#29293d] p-4 rounded">
                                    <p className="text-gray-400">Avg Latency</p>
                                    <h3 className="text-2xl font-bold">{Math.round(telemetry.avgLatency)}ms</h3>
                                </div>

                                <div className="bg-[#29293d] p-4 rounded">
                                    <p className="text-gray-400">Cache Hits</p>
                                    <h3 className="text-2xl font-bold">{telemetry.cacheHits}</h3>

                                </div>

                                <div className="bg-[#29293d] p-4 rounded">
                                    <p className="text-gray-400">Cache Misses</p>
                                    <h3 className="text-2xl font-bold">{telemetry.cacheMisses}</h3>
                                </div>

                                <div className="bg-[#29293d] p-4 rounded">
                                    <p className="text-gray-400">Cache Hit Ratio</p>
                                    <h3 className="text-2xl font-bold">{telemetry.cacheHitRatio}%</h3>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <div className="mx-5 md:mx-10 mb-10">
                    <div className="bg-[#1f1f2e] rounded-lg p-5 shadow-lg">
                        <h2 className="text-2xl font-bold text-[#483AA0] mb-5">Queue Metrics</h2>
                        {queueStats && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                                <div className="bg-[#29293d] p-4 rounded">
                                    <p className="text-gray-400">Waiting</p>
                                    <h3 className="text-2xl font-bold">{queueStats.waiting || 0}</h3>
                                </div>
                                <div className="bg-[#29293d] p-4 rounded">
                                    <p className="text-gray-400">Active</p>
                                    <h3 className="text-2xl font-bold">{queueStats.active || 0}</h3>
                                </div>
                                <div className="bg-[#29293d] p-4 rounded">
                                    <p className="text-gray-400">Completed</p>
                                    <h3 className="text-2xl font-bold">{queueStats.completed || 0}</h3>
                                </div>
                                <div className="bg-[#29293d] p-4 rounded">
                                    <p className="text-gray-400">Failed</p>
                                    <h3 className="text-2xl font-bold">{queueStats.failed || 0}</h3>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <div className="mx-5 md:mx-10 mb-10">
                    <div className="bg-[#1f1f2e] rounded-lg p-5 shadow-lg">
                        <h2 className="text-2xl font-bold text-[#483AA0] mb-5">Request Traffic</h2>
                        <div className="h-[400px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3"/>
                                    <XAxis dataKey="hour"/>
                                    <YAxis />
                                    <Tooltip />
                                    <Line type="monotone" dataKey="requests" stroke="#483AA0" strokeWidth={3}/>
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
                <div className="mx-5 md:mx-10 mb-10">
                    <div className="bg-[#1f1f2e] rounded-lg p-5 shadow-lg">
                        <h2 className="text-2xl font-bold text-[#483AA0] mb-5">Latency Analytics</h2>
                        <div className="h-[400px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3"/>
                                    <XAxis dataKey="hour"/>
                                    <YAxis />
                                    <Tooltip />
                                    <Line type="monotone" dataKey="latency" stroke="#00C49F" strokeWidth={3}/>
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
                <div className="mx-5 md:mx-10 mb-10">
                    <div className="bg-[#1f1f2e] rounded-lg p-5 shadow-lg">
                        <h2 className="text-2xl font-bold text-[#483AA0] mb-5">Top IP Analytics</h2>
                        <div className="space-y-3">{ipAnalytics.map(
                            ([ip, data], idx) => (
                                <div key={idx} className="bg-[#29293d] p-4 rounded" >
                                    <p className="text-gray-300"><strong>IP:</strong>{' '} {ip} </p>
                                    <p className="text-gray-300"><strong>Requests:</strong> {' '} {data.requests}</p>
                                </div>
                            )
                        )}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function formatNumber(number) {
    return number.toLocaleString('id-ID');
}

const rules = [
  "Keep your API key secure and do not expose it publicly or share it with others.",
  "Do not misuse or abuse the API for malicious, harmful, or unauthorized activities.",
  "Respect the assigned rate limits based on your account or usage tier.",
  "Report any bugs, vulnerabilities, or unexpected behavior to the development team.",
  "Do not use this API for illegal, unethical, or prohibited activities.",
  "Access to the API may be suspended or revoked if any violation of these rules is detected."
];

const thanks = [
  "Thank you to everyone who has supported and contributed to this project.",
  "Special appreciation to users who have provided valuable feedback and suggestions.",
  "We are committed to continuously improving and expanding this service to better serve your needs."
];