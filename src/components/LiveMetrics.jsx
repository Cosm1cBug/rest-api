'use client'

import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'

export default function LiveMetrics() {

    const [events, setEvents] = useState([])

    useEffect(() => {

        const socket = io('http://localhost:3000')

        socket.on('metric', data => {

            setEvents(prev => [
                data,
                ...prev.slice(0, 19)
            ])
        })

        return () => socket.disconnect()

    }, [])

    return (

        <div className='bg-zinc-900 p-5 rounded-xl'>

            <h2 className='text-2xl mb-5'>
                Live Requests
            </h2>

            <div className='space-y-3'>

                {events.map((event, index) => (

                    <div
                        key={index}
                        className='border-b border-zinc-800 pb-2'
                    >

                        <p>
                            {event.endpoint}
                        </p>

                        <p>
                            {event.latency} ms
                        </p>

                    </div>

                ))}

            </div>

        </div>
    )
}