import "@/app/globals.css";
import { UserProvider } from "@/context/userContext";
import { SessionProvider } from "next-auth/react";

export default function App({ Component, pageProps: { session, ...pageProps } }) {
    return (
        <SessionProvider session={session}>
            <UserProvider>
                <Component {...pageProps} />
            </UserProvider>
        </SessionProvider>
    );
}