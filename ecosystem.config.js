module.exports = {
    apps: [
        {
            name: 'rest-api',
            script: 'node_modules/next/dist/bin/next',
            args: 'start',
            instances: 'max',
            exec_mode: 'cluster'
        },
        {
            name: 'scraper-worker',
            script: 'workers/scraper.worker.js'
        }
    ]
}