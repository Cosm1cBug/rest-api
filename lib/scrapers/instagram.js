import axios from "axios";
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';
import crypto from 'crypto';

class Instagram {
    /**
     * Create a new instance of the Instagram scraper.
     *
     * Initializes a new instance of the scraper with a new CookieJar
     * instance and a new Axios client that uses that CookieJar.
     */
    constructor() {
        this.jar = new CookieJar();
        this.client = wrapper(axios.create({ jar: this.jar }));
    }

    /**
     * Download a video from Instagram.
     *
     * @param {string} url The URL of the video to download.
     * @return {Promise<Object>} A promise that resolves with the response from the
     * server, which will contain the URL of the video.
     */
    async download(url) {
        const { data } = await axios.get('https://sssinstagram.com/msec');
        const time = Math.floor(data.msec * 1000) || Date.now();
        const ab = Date.now() - (time ? Date.now() - time : 0);
    
        const hash = process.env.INSTAGRAM_HASH_SECRET || crypto.createHash('sha256')
            .update(`${url}${ab}19e08ff42f18559b51825685d917c5c9e9d89f8a5c1ab147f820f46e94c3df26`)
            .digest('hex');
    
        const { data: response } = await axios.post('https://sssinstagram.com/api/convert', {
            url, ts: ab, _ts: 1739186038417, _tsc: Date.now() - time, _s: hash
        }, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://sssinstagram.com/',
                'Origin': 'https://sssinstagram.com/'
            }
        });
    
        return response
    }
}

export default Instagram