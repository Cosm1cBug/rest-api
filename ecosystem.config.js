export default {
    apps: [
        {
            name: 'orbitnode-api',
            script: 'npm',
            args: 'start -- -p 3000',
            instances: '1',
            exec_mode: 'fork',
            autorestart: true,
            watch: false,
            max_memory_restart: '1G',
            env: {
                NODE_ENV: 'production',
                PORT: 3000
            }
        },
        {
            name: 'orbitnode-dashboard',
            script: 'npm',
            args: 'run dashboard',
            autorestart: true,
            watch: false,
            env: {
                NODE_ENV: 'production',
                PORT: 3001
            }
        },
        {
            name: 'scraper-worker',
            script: 'workers/scraper.worker.js',
            autorestart: true,
            env: {
                NODE_ENV: 'production'
            }
        }
    ]
}