/**
 * Network Scanner - Discovers devices on the local WiFi network.
 * Uses WebRTC for local IP detection and subnet scanning via timed fetch/image probes.
 */
class NetworkScanner {
    constructor() {
        this.localIp = null;
        this.subnet = null;
        this.gateway = null;
        this.foundDevices = [];
        this.isScanning = false;
        this.onDeviceFound = null;
        this.onProgress = null;
        this.onComplete = null;
        this.scanTimeout = 1500;
    }

    async getLocalIp() {
        try {
            const ip = await this.getIpViaWebRTC();
            if (ip) return ip;
        } catch (_e) {
            /* WebRTC not available */
        }

        try {
            const ip = await this.getIpViaApi();
            if (ip) return ip;
        } catch (_e) {
            /* API fallback failed */
        }

        return null;
    }

    getIpViaWebRTC() {
        return new Promise((resolve, reject) => {
            const pc = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });
            const ips = new Set();
            let resolved = false;

            pc.createDataChannel('');

            pc.onicecandidate = function (event) {
                if (resolved) return;
                if (!event || !event.candidate) {
                    pc.close();
                    if (ips.size === 0) {
                        reject(new Error('No local IP found'));
                    }
                    return;
                }

                const candidate = event.candidate.candidate;
                const match = candidate.match(
                    /([0-9]{1,3}\.){3}[0-9]{1,3}/
                );
                if (match) {
                    const ip = match[0];
                    if (
                        ip.startsWith('192.168.') ||
                        ip.startsWith('10.') ||
                        ip.startsWith('172.')
                    ) {
                        ips.add(ip);
                        resolved = true;
                        pc.close();
                        resolve(ip);
                    }
                }
            };

            pc.createOffer()
                .then(offer => pc.setLocalDescription(offer))
                .catch(() => reject(new Error('WebRTC offer failed')));

            setTimeout(() => {
                if (!resolved) {
                    pc.close();
                    const ipArr = Array.from(ips);
                    if (ipArr.length > 0) {
                        resolve(ipArr[0]);
                    } else {
                        reject(new Error('Timeout'));
                    }
                }
            }, 3000);
        });
    }

    async getIpViaApi() {
        const response = await fetch('https://api.ipify.org?format=json');
        if (response.ok) {
            const data = await response.json();
            return data.ip;
        }
        return null;
    }

    parseSubnet(ip) {
        const parts = ip.split('.');
        if (parts.length !== 4) return null;
        return parts.slice(0, 3).join('.');
    }

    async probeDevice(ip) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.scanTimeout);

        try {
            const start = performance.now();
            await fetch('http://' + ip + '/', {
                mode: 'no-cors',
                cache: 'no-store',
                signal: controller.signal
            });
            const elapsed = performance.now() - start;
            clearTimeout(timeout);

            if (elapsed < this.scanTimeout) {
                return { ip, responseTime: Math.round(elapsed), method: 'fetch' };
            }
        } catch (e) {
            clearTimeout(timeout);

            if (e.name !== 'AbortError') {
                return { ip, responseTime: 0, method: 'error-response' };
            }
        }

        return null;
    }

    async probeDeviceImage(ip) {
        return new Promise(resolve => {
            const img = new Image();
            const start = performance.now();
            let done = false;

            const cleanup = function (result) {
                if (done) return;
                done = true;
                img.src = '';
                resolve(result);
            };

            const timer = setTimeout(() => cleanup(null), this.scanTimeout);

            img.onload = function () {
                clearTimeout(timer);
                cleanup({ ip, responseTime: Math.round(performance.now() - start), method: 'img-load' });
            };
            img.onerror = function () {
                clearTimeout(timer);
                const elapsed = performance.now() - start;
                if (elapsed < 800) {
                    cleanup({ ip, responseTime: Math.round(elapsed), method: 'img-error' });
                } else {
                    cleanup(null);
                }
            };

            img.src = 'http://' + ip + '/favicon.ico?t=' + Date.now();
        });
    }

    async scanSubnet(ip) {
        this.isScanning = true;
        this.foundDevices = [];
        this.localIp = ip;
        this.subnet = this.parseSubnet(ip);

        if (!this.subnet) {
            this.isScanning = false;
            return [];
        }

        this.gateway = this.subnet + '.1';

        const totalHosts = 254;
        let scanned = 0;
        const batchSize = 20;

        for (let batchStart = 1; batchStart <= totalHosts && this.isScanning; batchStart += batchSize) {
            const batchEnd = Math.min(batchStart + batchSize - 1, totalHosts);
            const promises = [];

            for (let i = batchStart; i <= batchEnd; i++) {
                const targetIp = this.subnet + '.' + i;
                promises.push(this.probeHost(targetIp));
            }

            const results = await Promise.all(promises);

            results.forEach(result => {
                if (result) {
                    const exists = this.foundDevices.some(d => d.ip === result.ip);
                    if (!exists) {
                        result.type = this.classifyDevice(result.ip);
                        this.foundDevices.push(result);
                        if (this.onDeviceFound) {
                            this.onDeviceFound(result);
                        }
                    }
                }
            });

            scanned = batchEnd;
            if (this.onProgress) {
                this.onProgress({
                    scanned: scanned,
                    total: totalHosts,
                    found: this.foundDevices.length,
                    percent: Math.round((scanned / totalHosts) * 100)
                });
            }
        }

        this.isScanning = false;

        this.foundDevices.sort((a, b) => {
            const aNum = parseInt(a.ip.split('.')[3], 10);
            const bNum = parseInt(b.ip.split('.')[3], 10);
            return aNum - bNum;
        });

        if (this.onComplete) {
            this.onComplete(this.foundDevices);
        }

        return this.foundDevices;
    }

    async probeHost(ip) {
        const fetchResult = await this.probeDevice(ip);
        if (fetchResult) return fetchResult;

        const imgResult = await this.probeDeviceImage(ip);
        if (imgResult) return imgResult;

        return null;
    }

    classifyDevice(ip) {
        const lastOctet = parseInt(ip.split('.')[3], 10);

        if (lastOctet === 1) {
            return { name: 'Router / Gateway', icon: 'router' };
        }

        if (ip === this.localIp) {
            return { name: 'This Device (You)', icon: 'self' };
        }

        if (lastOctet <= 10) {
            return { name: 'Network Device', icon: 'network' };
        }

        if (lastOctet >= 200) {
            return { name: 'Connected Device', icon: 'device' };
        }

        return { name: 'Connected Device', icon: 'device' };
    }

    getDeviceIcon(type) {
        switch (type) {
            case 'router':
                return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12.55a11 11 0 0 1 14.08 0"></path><path d="M1.42 9a16 16 0 0 1 21.16 0"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg>';
            case 'self':
                return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>';
            case 'network':
                return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>';
            default:
                return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line></svg>';
        }
    }

    stop() {
        this.isScanning = false;
    }
}
