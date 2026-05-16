export default {
    apps: [
        {
            name: 'rest-api',
            script: 'npm',
            args: 'start',
            instances: '1',
            exec_mode: 'fork', //cluster
            watch: false
        },
        {
            name: 'scraper-worker',
            script: 'workers/scraper.worker.js'
        }
    ]
}