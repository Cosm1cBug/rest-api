import { gracefulShutdown } from '@/lib/shutdown.js'
import { assertSecrets } from '@/lib/auth/env.js'

// Fail-fast before accepting any traffic.
assertSecrets()

process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
