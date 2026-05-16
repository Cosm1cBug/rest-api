'use client'

import { SessionProvider } from "next-auth/react"
import { UserProvider } from "@/contexts/userContext.jsx"

export default function Providers({
    children
}) {
    return (
        <SessionProvider>
            <UserProvider>
                {children}
            </UserProvider>
        </SessionProvider>
    )
}