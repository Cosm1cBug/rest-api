import { gracefulShutdown } from '@/lib/shutdown.js'

process.on('SIGINT', () => gracefulShutdown('SIGINT'))

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))