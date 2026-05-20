/**
 * Speed Test - Measures download speed, upload speed, ping, and jitter.
 */
class SpeedTester {
    constructor() {
        this.downloadSpeed = 0;
        this.uploadSpeed = 0;
        this.ping = 0;
        this.jitter = 0;
        this.isTesting = false;
        this.onProgress = null;
        this.onComplete = null;
    }

    async measurePing() {
        const pings = [];
        const testUrl = 'https://www.google.com/favicon.ico';
        const iterations = 5;

        for (let i = 0; i < iterations; i++) {
            const start = performance.now();
            try {
                await fetch(testUrl + '?t=' + Date.now() + Math.random(), {
                    mode: 'no-cors',
                    cache: 'no-store'
                });
                const end = performance.now();
                pings.push(end - start);
            } catch (_e) {
                pings.push(0);
            }
        }

        const validPings = pings.filter(p => p > 0);
        if (validPings.length === 0) return { ping: 0, jitter: 0 };

        this.ping = Math.round(
            validPings.reduce((a, b) => a + b, 0) / validPings.length
        );

        if (validPings.length > 1) {
            const diffs = [];
            for (let i = 1; i < validPings.length; i++) {
                diffs.push(Math.abs(validPings[i] - validPings[i - 1]));
            }
            this.jitter = Math.round(
                diffs.reduce((a, b) => a + b, 0) / diffs.length
            );
        }

        return { ping: this.ping, jitter: this.jitter };
    }

    async measureDownload() {
        const testUrls = [
            { url: 'https://speed.cloudflare.com/__down?bytes=500000', size: 500000 },
            { url: 'https://speed.cloudflare.com/__down?bytes=1000000', size: 1000000 },
            { url: 'https://speed.cloudflare.com/__down?bytes=2000000', size: 2000000 }
        ];

        let totalBytes = 0;
        let totalTime = 0;

        for (const test of testUrls) {
            if (!this.isTesting) break;

            try {
                const start = performance.now();
                const response = await fetch(test.url + '&t=' + Date.now(), {
                    cache: 'no-store'
                });

                if (response.ok) {
                    const blob = await response.blob();
                    const end = performance.now();
                    const duration = (end - start) / 1000;

                    totalBytes += blob.size;
                    totalTime += duration;

                    const currentSpeed = (totalBytes * 8) / (totalTime * 1000000);
                    this.downloadSpeed = parseFloat(currentSpeed.toFixed(2));

                    if (this.onProgress) {
                        this.onProgress('download', this.downloadSpeed);
                    }
                }
            } catch (_e) {
                break;
            }
        }

        if (this.downloadSpeed === 0) {
            this.downloadSpeed = await this.fallbackSpeedTest();
        }

        return this.downloadSpeed;
    }

    async measureUpload() {
        const sizes = [100000, 250000, 500000];
        let totalBytes = 0;
        let totalTime = 0;

        for (const size of sizes) {
            if (!this.isTesting) break;

            try {
                const data = new Blob([new ArrayBuffer(size)]);
                const start = performance.now();

                await fetch('https://speed.cloudflare.com/__up', {
                    method: 'POST',
                    body: data,
                    cache: 'no-store'
                });

                const end = performance.now();
                const duration = (end - start) / 1000;

                totalBytes += size;
                totalTime += duration;

                const currentSpeed = (totalBytes * 8) / (totalTime * 1000000);
                this.uploadSpeed = parseFloat(currentSpeed.toFixed(2));

                if (this.onProgress) {
                    this.onProgress('upload', this.uploadSpeed);
                }
            } catch (_e) {
                break;
            }
        }

        return this.uploadSpeed;
    }

    async fallbackSpeedTest() {
        const testUrl = 'https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png';
        const estimatedSize = 13504;

        try {
            const start = performance.now();
            const response = await fetch(testUrl + '?t=' + Date.now(), {
                cache: 'no-store'
            });
            if (response.ok) {
                await response.blob();
                const end = performance.now();
                const duration = (end - start) / 1000;
                return parseFloat(
                    ((estimatedSize * 8) / (duration * 1000000)).toFixed(2)
                );
            }
        } catch (_e) {
            /* no fallback available */
        }

        return this.getNetworkApiSpeed();
    }

    getNetworkApiSpeed() {
        if ('connection' in navigator) {
            const conn = navigator.connection;
            return conn.downlink || 0;
        }
        return 0;
    }

    async runFullTest() {
        this.isTesting = true;
        this.downloadSpeed = 0;
        this.uploadSpeed = 0;
        this.ping = 0;
        this.jitter = 0;

        if (this.onProgress) {
            this.onProgress('status', 'Ping test...');
        }
        await this.measurePing();

        if (this.onProgress) {
            this.onProgress('ping', { ping: this.ping, jitter: this.jitter });
        }

        if (this.onProgress) {
            this.onProgress('status', 'Download test...');
        }
        await this.measureDownload();

        if (this.onProgress) {
            this.onProgress('status', 'Upload test...');
        }
        await this.measureUpload();

        this.isTesting = false;

        const results = {
            download: this.downloadSpeed,
            upload: this.uploadSpeed,
            ping: this.ping,
            jitter: this.jitter
        };

        if (this.onComplete) {
            this.onComplete(results);
        }

        return results;
    }

    async quickSpeedCheck() {
        const start = performance.now();
        try {
            const response = await fetch(
                'https://speed.cloudflare.com/__down?bytes=200000&t=' + Date.now(),
                { cache: 'no-store' }
            );
            if (response.ok) {
                const blob = await response.blob();
                const end = performance.now();
                const duration = (end - start) / 1000;
                return parseFloat(
                    ((blob.size * 8) / (duration * 1000000)).toFixed(2)
                );
            }
        } catch (_e) {
            /* quick check failed */
        }

        return this.getNetworkApiSpeed();
    }

    stop() {
        this.isTesting = false;
    }

    drawGauge(canvasId, speed, maxSpeed) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        const cx = w / 2;
        const cy = h - 10;
        const r = Math.min(cx, cy) - 10;

        ctx.clearRect(0, 0, w, h);

        ctx.beginPath();
        ctx.arc(cx, cy, r, Math.PI, 0);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 12;
        ctx.lineCap = 'round';
        ctx.stroke();

        const progress = Math.min(speed / (maxSpeed || 100), 1);
        const endAngle = Math.PI + progress * Math.PI;

        const gradient = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
        gradient.addColorStop(0, '#ff4466');
        gradient.addColorStop(0.3, '#ffaa00');
        gradient.addColorStop(0.6, '#00d4ff');
        gradient.addColorStop(1, '#00ff88');

        ctx.beginPath();
        ctx.arc(cx, cy, r, Math.PI, endAngle);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 12;
        ctx.lineCap = 'round';
        ctx.stroke();

        const glow = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
        glow.addColorStop(0, 'rgba(255, 68, 102, 0.3)');
        glow.addColorStop(0.5, 'rgba(0, 212, 255, 0.3)');
        glow.addColorStop(1, 'rgba(0, 255, 136, 0.3)');

        ctx.beginPath();
        ctx.arc(cx, cy, r, Math.PI, endAngle);
        ctx.strokeStyle = glow;
        ctx.lineWidth = 18;
        ctx.lineCap = 'round';
        ctx.stroke();

        const labels = ['0', '25', '50', '75', '100'];
        ctx.font = '9px Orbitron';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.textAlign = 'center';

        labels.forEach((label, i) => {
            const angle = Math.PI + (i / (labels.length - 1)) * Math.PI;
            const lx = cx + (r + 14) * Math.cos(angle);
            const ly = cy + (r + 14) * Math.sin(angle);
            ctx.fillText(label, lx, ly);
        });
    }
}
