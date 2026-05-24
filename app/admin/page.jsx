import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/authOptions.js'
import connectDB from '@/lib/mongodb.js'
import User from '@/models/user.js'

/**
 * Admin dashboard page (server component).
 *
 * Security model:
 *   1. middleware.js blocks `/admin/*` at the edge for non-admin tokens.
 *   2. This component re-checks via getServerSession (defense in depth).
 *   3. Non-admin sessions are redirected; unauthenticated users go to login.
 *
 * No data is rendered until both checks pass.
 */
export default async function AdminPage() {

    const session = await getServerSession(authOptions)

    if (!session?.user) {
        redirect('/auth/login?callbackUrl=/admin')
    }

    if (session.user.role !== 'admin') {
        redirect('/')
    }

    await connectDB()

    // Aggregate user counts by role. We use the new `role` field but fall back
    // to legacy `status` for any unmigrated documents.
    const users = await User.find({}, 'username email role status createdAt').lean()

    const effectiveRole = (u) => u.role || u.status || 'basic'

    const totals = users.reduce((acc, u) => {
        const r = effectiveRole(u)
        acc.total += 1
        acc[r] = (acc[r] || 0) + 1
        return acc
    }, { total: 0 })

    return (
        <main style={{
            minHeight: '100vh',
            background: '#0f0f1a',
            color: '#e5e7eb',
            padding: '2rem',
            fontFamily: 'system-ui, sans-serif'
        }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                Admin Dashboard
            </h1>
            <p style={{ color: '#9ca3af', marginBottom: '2rem' }}>
                Signed in as <strong>{session.user.name}</strong> ({session.user.role})
            </p>

            <section style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '1rem',
                marginBottom: '2rem'
            }}>
                {[
                    ['Total Users', totals.total],
                    ['Basic', totals.basic || 0],
                    ['Standard', totals.standard || 0],
                    ['Premium', totals.premium || 0],
                    ['Admin', totals.admin || 0]
                ].map(([label, value]) => (
                    <div key={label} style={{
                        background: '#1f1f2e',
                        borderRadius: '0.5rem',
                        padding: '1rem',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.25)'
                    }}>
                        <div style={{ color: '#483AA0', fontSize: '0.8rem', textTransform: 'uppercase' }}>
                            {label}
                        </div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '0.5rem' }}>
                            {value}
                        </div>
                    </div>
                ))}
            </section>

            <section style={{
                background: '#1f1f2e',
                borderRadius: '0.5rem',
                padding: '1rem'
            }}>
                <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Recent Users</h2>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                        <thead>
                            <tr style={{ textAlign: 'left', color: '#9ca3af' }}>
                                <th style={{ padding: '0.5rem' }}>Username</th>
                                <th style={{ padding: '0.5rem' }}>Email</th>
                                <th style={{ padding: '0.5rem' }}>Role</th>
                                <th style={{ padding: '0.5rem' }}>Created</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.slice(-20).reverse().map(u => (
                                <tr key={u._id} style={{ borderTop: '1px solid #2c2c3a' }}>
                                    <td style={{ padding: '0.5rem' }}>{u.username}</td>
                                    <td style={{ padding: '0.5rem' }}>{u.email}</td>
                                    <td style={{ padding: '0.5rem' }}>{effectiveRole(u)}</td>
                                    <td style={{ padding: '0.5rem', color: '#9ca3af' }}>
                                        {u.createdAt ? new Date(u.createdAt).toISOString().slice(0, 10) : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </main>
    )
}
