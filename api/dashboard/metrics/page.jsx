'use client'

import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell
} from 'recharts'

import { useEffect, useState } from 'react'

export default function MetricsDashboard() {

    const [data, setData] = useState(null)

    useEffect(() => {
        fetch('/api/dashboard/metrics')
            .then(res => res.json())
            .then(setData)
    }, [])

    if (!data) {
        return (
            <div className='p-10'>
                Loading...
            </div>
        )
    }

    const pieData = [
        {
            name: 'Success',
            value: data.successHits
        },
        {
            name: 'Failed',
            value: data.failedHits
        }
    ]

    return (
        <div className='p-8 space-y-10'>

            <h1 className='text-4xl font-bold'>
                Metrics Dashboard
            </h1>

            <div className='grid grid-cols-2 md:grid-cols-3 gap-5'>

                <Card
                    title='Total Hits'
                    value={data.totalHits}
                />

                <Card
                    title='Today Hits'
                    value={data.todayHits}
                />

                <Card
                    title='Week Hits'
                    value={data.weekHits}
                />

                <Card
                    title='Month Hits'
                    value={data.monthHits}
                />

                <Card
                    title='Success Hits'
                    value={data.successHits}
                />

                <Card
                    title='Failed Hits'
                    value={data.failedHits}
                />
            </div>

            <div className='grid md:grid-cols-2 gap-10'>

                <div className='bg-zinc-900 rounded-xl p-5 h-[400px]'>

                    <h2 className='text-xl mb-4'>
                        Top API Endpoints
                    </h2>

                    <ResponsiveContainer width='100%' height='100%'>

                        <BarChart data={data.topEndpoints}>

                            <XAxis dataKey='_id' />

                            <YAxis />

                            <Tooltip />

                            <Bar dataKey='count' />

                        </BarChart>

                    </ResponsiveContainer>

                </div>

                <div className='bg-zinc-900 rounded-xl p-5 h-[400px]'>

                    <h2 className='text-xl mb-4'>
                        Success vs Failed
                    </h2>

                    <ResponsiveContainer width='100%' height='100%'>

                        <PieChart>

                            <Pie
                                data={pieData}
                                dataKey='value'
                                outerRadius={120}
                                label
                            >

                                <Cell />

                                <Cell />

                            </Pie>

                            <Tooltip />

                        </PieChart>

                    </ResponsiveContainer>

                </div>

            </div>

            <div className='bg-zinc-900 rounded-xl p-5'>

                <h2 className='text-2xl mb-5'>
                    Top Users
                </h2>

                <table className='w-full'>

                    <thead>

                        <tr className='text-left border-b border-zinc-700'>

                            <th className='p-3'>
                                User
                            </th>

                            <th className='p-3'>
                                Hits
                            </th>

                        </tr>

                    </thead>

                    <tbody>

                        {data.topUsers.map(user => (

                            <tr
                                key={user._id}
                                className='border-b border-zinc-800'
                            >

                                <td className='p-3'>
                                    {user._id}
                                </td>

                                <td className='p-3'>
                                    {user.count}
                                </td>

                            </tr>

                        ))}

                    </tbody>

                </table>

            </div>

        </div>
    )
}

function Card({ title, value }) {

    return (
        <div className='bg-zinc-900 p-5 rounded-xl'>

            <h2 className='text-zinc-400'>
                {title}
            </h2>

            <p className='text-3xl font-bold mt-2'>
                {value}
            </p>

        </div>
    )
}