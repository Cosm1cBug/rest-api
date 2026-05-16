import "./globals.css";
import Providers from '@/components/providers.jsx'

export const metadata = {
    title: 'ORBITNODE API',
    description: 'A platform for all your API needs.'
}


export default function App({
    children
}) {
    return (
        <html lang='en'>
            <body>
                <Providers>
                    {children}
                </Providers>
            </body>
        </html>
    )
}