/**
 * Speed Test - Real speed measurement via actual byte transfers.
 * Downloads/uploads real data to/from Cloudflare speed test servers.
 * Measures actual bytes transferred over actual elapsed time.
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

    /**
     * Measure real ping by timing actual HTTP round-trips.
     * Sends 10 real requests and measures actual round-trip time.
     */
    async measurePing() {
        var pings = [];
        // Use Cloudflare's edge endpoint for accurate ping
        var testUrls = [
            'https://speed.cloudflare.com/__down?bytes=0',
            'https://www.google.com/generate_204',
            'https://www.gstatic.com/generate_204'
        ];
        var testUrl = testUrls[0];
        var iterations = 10;

        for (var i = 0; i < iterations; i++) {
            var start = performance.now();
            try {
                await fetch(testUrl + '&t=' + Date.now() + '_' + i, {
                    mode: 'no-cors',
                    cache: 'no-store',
                    credentials: 'omit'
                });
                var end = performance.now();
                pings.push(end - start);
            } catch (_e) {
                // Try alternate URL
                try {
                    var s2 = performance.now();
                    await fetch(testUrls[1] + '?t=' + Date.now(), {
                        mode: 'no-cors',
                        cache: 'no-store'
                    });
                    pings.push(performance.now() - s2);
                } catch (_e2) {
                    /* skip this iteration */
                }
            }
            // Small delay between pings for accuracy
            await this.delay(100);
        }

        var validPings = pings.filter(function (p) { return p > 0; });
        if (validPings.length === 0) return { ping: 0, jitter: 0 };

        // Remove highest and lowest for more accurate average
        validPings.sort(function (a, b) { return a - b; });
        if (validPings.length > 4) {
            validPings = validPings.slice(1, -1);
        }

        var sum = 0;
        for (var j = 0; j < validPings.length; j++) sum += validPings[j];
        this.ping = Math.round(sum / validPings.length);

        // Jitter = average deviation between consecutive pings
        if (validPings.length > 1) {
            var diffs = [];
            for (var k = 1; k < validPings.length; k++) {
                diffs.push(Math.abs(validPings[k] - validPings[k - 1]));
            }
            var jSum = 0;
            for (var m = 0; m < diffs.length; m++) jSum += diffs[m];
            this.jitter = Math.round(jSum / diffs.length);
        }

        return { ping: this.ping, jitter: this.jitter };
    }

    /**
     * Measure real download speed by transferring actual bytes from Cloudflare.
     * Uses progressively larger payloads and measures actual received bytes.
     */
    async measureDownload() {
        // Progressive download sizes: 500KB, 1MB, 2MB, 5MB, 10MB
        var tests = [
            { bytes: 500000 },
            { bytes: 1000000 },
            { bytes: 2000000 },
            { bytes: 5000000 },
            { bytes: 10000000 }
        ];

        var totalBytes = 0;
        var totalTime = 0;
        var speeds = [];

        for (var i = 0; i < tests.length; i++) {
            if (!this.isTesting) break;

            var test = tests[i];
            var url = 'https://speed.cloudflare.com/__down?bytes=' + test.bytes + '&ckSize=' + test.bytes + '&t=' + Date.now();

            try {
                var start = performance.now();
                var response = await fetch(url, { cache: 'no-store' });

                if (!response.ok) continue;

                // Read actual bytes from response
                var reader = response.body ? response.body.getReader() : null;
                var received = 0;

                if (reader) {
                    // Stream reading for accurate byte count
                    while (true) {
                        var chunk = await reader.read();
                        if (chunk.done) break;
                        received += chunk.value.length;

                        // Live progress update during download
                        var elapsed = (performance.now() - start) / 1000;
                        if (elapsed > 0 && this.onProgress) {
                            var liveSpeed = (received * 8) / (elapsed * 1000000);
                            this.onProgress('download', parseFloat(liveSpeed.toFixed(2)));
                        }
                    }
                } else {
                    // Fallback: read as blob
                    var blob = await response.blob();
                    received = blob.size;
                }

                var duration = (performance.now() - start) / 1000;

                if (duration > 0 && received > 0) {
                    totalBytes += received;
                    totalTime += duration;

                    var speed = (received * 8) / (duration * 1000000); // Mbps
                    speeds.push(speed);

                    // Cumulative average
                    this.downloadSpeed = parseFloat(((totalBytes * 8) / (totalTime * 1000000)).toFixed(2));

                    if (this.onProgress) {
                        this.onProgress('download', this.downloadSpeed);
                    }
                }
            } catch (_e) {
                // If Cloudflare fails, try measuring with a real file
                if (i === 0) {
                    var fallbackSpeed = await this.fallbackDownloadTest();
                    if (fallbackSpeed > 0) {
                        this.downloadSpeed = fallbackSpeed;
                        if (this.onProgress) {
                            this.onProgress('download', this.downloadSpeed);
                        }
                    }
                }
                break;
            }
        }

        // Use the best speed from later (larger) tests if available
        if (speeds.length >= 2) {
            // Average of the top measurements for more accurate result
            speeds.sort(function (a, b) { return b - a; });
            var topSpeeds = speeds.slice(0, Math.ceil(speeds.length / 2));
            var topSum = 0;
            for (var s = 0; s < topSpeeds.length; s++) topSum += topSpeeds[s];
            this.downloadSpeed = parseFloat((topSum / topSpeeds.length).toFixed(2));
        }

        return this.downloadSpeed;
    }

    /**
     * Measure real upload speed by sending actual bytes to Cloudflare.
     */
    async measureUpload() {
        var sizes = [100000, 250000, 500000, 1000000, 2000000];
        var totalBytes = 0;
        var totalTime = 0;

        for (var i = 0; i < sizes.length; i++) {
            if (!this.isTesting) break;
            var size = sizes[i];

            try {
                // Create real random data to upload
                var buffer = new ArrayBuffer(size);
                var view = new Uint8Array(buffer);
                for (var j = 0; j < Math.min(size, 1024); j++) {
                    view[j] = Math.floor(Math.random() * 256);
                }
                var data = new Blob([buffer]);

                var start = performance.now();

                var response = await fetch('https://speed.cloudflare.com/__up', {
                    method: 'POST',
                    body: data,
                    cache: 'no-store'
                });

                // Wait for actual response to ensure all bytes sent
                if (response.body) {
                    await response.text();
                }

                var duration = (performance.now() - start) / 1000;

                if (duration > 0) {
                    totalBytes += size;
                    totalTime += duration;

                    this.uploadSpeed = parseFloat(((totalBytes * 8) / (totalTime * 1000000)).toFixed(2));

                    if (this.onProgress) {
                        this.onProgress('upload', this.uploadSpeed);
                    }
                }
            } catch (_e) {
                break;
            }
        }

        return this.uploadSpeed;
    }

    async fallbackDownloadTest() {
        // Try with a known CDN file
        var testUrls = [
            'https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js',
            'https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js'
        ];

        for (var i = 0; i < testUrls.length; i++) {
            try {
                var start = performance.now();
                var response = await fetch(testUrls[i] + '?t=' + Date.now(), {
                    cache: 'no-store'
                });
                if (response.ok) {
                    var blob = await response.blob();
                    var duration = (performance.now() - start) / 1000;
                    if (duration > 0) {
                        return parseFloat(((blob.size * 8) / (duration * 1000000)).toFixed(2));
                    }
                }
            } catch (_e) {
                continue;
            }
        }

        return 0;
    }

    /**
     * Get real network info from the Network Information API (if supported).
     */
    getRealNetworkInfo() {
        var info = {
            type: 'Unknown',
            effectiveType: 'Unknown',
            downlink: 0,
            rtt: 0,
            saveData: false
        };

        if ('connection' in navigator) {
            var conn = navigator.connection;
            info.type = conn.type || 'Unknown';
            info.effectiveType = conn.effectiveType || 'Unknown';
            info.downlink = conn.downlink || 0;
            info.rtt = conn.rtt || 0;
            info.saveData = conn.saveData || false;
        }

        return info;
    }

    async runFullTest() {
        this.isTesting = true;
        this.downloadSpeed = 0;
        this.uploadSpeed = 0;
        this.ping = 0;
        this.jitter = 0;

        if (this.onProgress) {
            this.onProgress('status', 'Measuring real ping...');
        }
        await this.measurePing();

        if (this.onProgress) {
            this.onProgress('ping', { ping: this.ping, jitter: this.jitter });
            this.onProgress('status', 'Downloading real data...');
        }
        await this.measureDownload();

        if (this.onProgress) {
            this.onProgress('status', 'Uploading real data...');
        }
        await this.measureUpload();

        this.isTesting = false;

        var results = {
            download: this.downloadSpeed,
            upload: this.uploadSpeed,
            ping: this.ping,
            jitter: this.jitter,
            networkInfo: this.getRealNetworkInfo(),
            timestamp: Date.now()
        };

        if (this.onComplete) {
            this.onComplete(results);
        }

        return results;
    }

    /**
     * Quick speed check for compass scanning - downloads real 200KB from Cloudflare.
     */
    async quickSpeedCheck() {
        var url = 'https://speed.cloudflare.com/__down?bytes=200000&t=' + Date.now();
        var start = performance.now();
        try {
            var response = await fetch(url, { cache: 'no-store' });
            if (response.ok) {
                var blob = await response.blob();
                var duration = (performance.now() - start) / 1000;
                if (duration > 0) {
                    return parseFloat(((blob.size * 8) / (duration * 1000000)).toFixed(2));
                }
            }
        } catch (_e) {
            /* quick check failed */
        }

        // Fallback to Network Information API
        var info = this.getRealNetworkInfo();
        return info.downlink || 0;
    }

    stop() {
        this.isTesting = false;
    }

    delay(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    drawGauge(canvasId, speed, maxSpeed) {
        var canvas = document.getElementById(canvasId);
        if (!canvas) return;
        var ctx = canvas.getContext('2d');
        var w = canvas.width;
        var h = canvas.height;
        var cx = w / 2;
        var cy = h - 10;
        var r = Math.min(cx, cy) - 10;

        ctx.clearRect(0, 0, w, h);

        // Background arc
        ctx.beginPath();
        ctx.arc(cx, cy, r, Math.PI, 0);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 12;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Progress arc
        var progress = Math.min(speed / (maxSpeed || 100), 1);
        var endAngle = Math.PI + progress * Math.PI;

        var gradient = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
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

        // Glow effect
        var glow = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
        glow.addColorStop(0, 'rgba(255, 68, 102, 0.3)');
        glow.addColorStop(0.5, 'rgba(0, 212, 255, 0.3)');
        glow.addColorStop(1, 'rgba(0, 255, 136, 0.3)');

        ctx.beginPath();
        ctx.arc(cx, cy, r, Math.PI, endAngle);
        ctx.strokeStyle = glow;
        ctx.lineWidth = 18;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Scale labels
        var labels = ['0', '25', '50', '75', '100'];
        ctx.font = '9px Orbitron';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.textAlign = 'center';

        for (var i = 0; i < labels.length; i++) {
            var angle = Math.PI + (i / (labels.length - 1)) * Math.PI;
            var lx = cx + (r + 14) * Math.cos(angle);
            var ly = cy + (r + 14) * Math.sin(angle);
            ctx.fillText(labels[i], lx, ly);
        }
    }
}
