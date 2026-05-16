'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

const UserContext = createContext(null);

export const UserProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const { data: session } = useSession();

    useEffect(() => {
        if (session) {
            fetch('/api/user/data')
                .then((res) => res.json())
                .then((data) => setUser(data.user))
                .catch((err) => {
                    console.error('Failed to fetch user:', err);
                    setUser(null);
                });
        } else {
            setUser(null);
        }
    }, [session]);

    return (
        <UserContext.Provider value={user}>
            {children}
        </UserContext.Provider>
    );
};

export const useUser = () => useContext(UserContext);
