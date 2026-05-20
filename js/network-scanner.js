/**
 * Network Scanner - Discovers devices on the local WiFi network.
 * Uses WebRTC for local IP detection, subnet scanning via timed probes,
 * port fingerprinting for device identification, and real-time monitoring.
 */
class NetworkScanner {
    constructor() {
        this.localIp = null;
        this.subnet = null;
        this.gateway = null;
        this.foundDevices = [];
        this.isScanning = false;
        this.isMonitoring = false;
        this.monitorInterval = null;
        this.onDeviceFound = null;
        this.onDeviceUpdated = null;
        this.onDeviceLost = null;
        this.onProgress = null;
        this.onComplete = null;
        this.scanTimeout = 1500;

        this.PORT_SIGNATURES = [
            { port: 80,    name: 'HTTP',        category: 'web' },
            { port: 443,   name: 'HTTPS',       category: 'web' },
            { port: 8080,  name: 'HTTP-Alt',    category: 'web' },
            { port: 62078, name: 'iDevice',     category: 'apple' },
            { port: 548,   name: 'AFP',         category: 'apple' },
            { port: 5353,  name: 'mDNS',        category: 'mdns' },
            { port: 8008,  name: 'Chromecast',  category: 'cast' },
            { port: 8009,  name: 'Chromecast',  category: 'cast' },
            { port: 8443,  name: 'Smart-TV',    category: 'tv' },
            { port: 9080,  name: 'Smart-TV',    category: 'tv' },
            { port: 7000,  name: 'AirPlay',     category: 'apple' },
            { port: 9100,  name: 'Printer',     category: 'printer' },
            { port: 631,   name: 'IPP-Print',   category: 'printer' },
            { port: 515,   name: 'LPR-Print',   category: 'printer' },
            { port: 445,   name: 'SMB',         category: 'windows' },
            { port: 139,   name: 'NetBIOS',     category: 'windows' },
            { port: 3389,  name: 'RDP',         category: 'windows' },
            { port: 22,    name: 'SSH',         category: 'linux' },
            { port: 5000,  name: 'UPnP',        category: 'iot' },
            { port: 1883,  name: 'MQTT',        category: 'iot' },
            { port: 8883,  name: 'MQTT-TLS',    category: 'iot' },
            { port: 554,   name: 'RTSP',        category: 'camera' },
            { port: 8554,  name: 'RTSP-Alt',    category: 'camera' },
            { port: 49152, name: 'UPnP-Alt',    category: 'iot' }
        ];

        this.DEVICE_PROFILES = {
            apple: {
                name: 'Apple Device',
                variants: {
                    62078: 'iPhone / iPad',
                    548: 'Mac (File Sharing)',
                    7000: 'Apple TV / AirPlay'
                },
                icon: 'phone'
            },
            cast: {
                name: 'Chromecast / Google Device',
                icon: 'tv'
            },
            tv: {
                name: 'Smart TV',
                icon: 'tv'
            },
            printer: {
                name: 'Printer',
                icon: 'printer'
            },
            windows: {
                name: 'Windows PC',
                variants: {
                    3389: 'Windows PC (Remote Desktop)',
                    445: 'Windows PC',
                    139: 'Windows PC'
                },
                icon: 'laptop'
            },
            linux: {
                name: 'Linux / Server',
                icon: 'server'
            },
            camera: {
                name: 'IP Camera',
                icon: 'camera'
            },
            iot: {
                name: 'IoT / Smart Device',
                icon: 'iot'
            },
            mdns: {
                name: 'Network Device (mDNS)',
                icon: 'network'
            },
            web: {
                name: 'Web Server / Device',
                icon: 'device'
            }
        };
    }

    async getLocalIp() {
        try {
            var ip = await this.getIpViaWebRTC();
            if (ip) return ip;
        } catch (_e) {
            /* WebRTC not available */
        }

        try {
            var ip2 = await this.getIpViaApi();
            if (ip2) return ip2;
        } catch (_e) {
            /* API fallback failed */
        }

        return null;
    }

    getIpViaWebRTC() {
        return new Promise(function (resolve, reject) {
            var pc = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });
            var ips = new Set();
            var resolved = false;

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

                var candidate = event.candidate.candidate;
                var match = candidate.match(/([0-9]{1,3}\.){3}[0-9]{1,3}/);
                if (match) {
                    var ip = match[0];
                    if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
                        ips.add(ip);
                        resolved = true;
                        pc.close();
                        resolve(ip);
                    }
                }
            };

            pc.createOffer()
                .then(function (offer) { return pc.setLocalDescription(offer); })
                .catch(function () { reject(new Error('WebRTC offer failed')); });

            setTimeout(function () {
                if (!resolved) {
                    pc.close();
                    var ipArr = Array.from(ips);
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
        var response = await fetch('https://api.ipify.org?format=json');
        if (response.ok) {
            var data = await response.json();
            return data.ip;
        }
        return null;
    }

    parseSubnet(ip) {
        var parts = ip.split('.');
        if (parts.length !== 4) return null;
        return parts.slice(0, 3).join('.');
    }

    async probePort(ip, port, timeout) {
        var ms = timeout || 800;
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, ms);

        try {
            var start = performance.now();
            await fetch('http://' + ip + ':' + port + '/', {
                mode: 'no-cors',
                cache: 'no-store',
                signal: controller.signal
            });
            var elapsed = performance.now() - start;
            clearTimeout(timer);
            return elapsed < ms ? { port: port, open: true, time: Math.round(elapsed) } : null;
        } catch (e) {
            clearTimeout(timer);
            if (e.name !== 'AbortError') {
                return { port: port, open: true, time: 0 };
            }
        }
        return null;
    }

    async probeDevice(ip) {
        var controller = new AbortController();
        var timeout = setTimeout(function () { controller.abort(); }, this.scanTimeout);

        try {
            var start = performance.now();
            await fetch('http://' + ip + '/', {
                mode: 'no-cors',
                cache: 'no-store',
                signal: controller.signal
            });
            var elapsed = performance.now() - start;
            clearTimeout(timeout);

            if (elapsed < this.scanTimeout) {
                return { ip: ip, responseTime: Math.round(elapsed), method: 'fetch' };
            }
        } catch (e) {
            clearTimeout(timeout);
            if (e.name !== 'AbortError') {
                return { ip: ip, responseTime: 0, method: 'error-response' };
            }
        }
        return null;
    }

    async probeDeviceImage(ip) {
        var scanTimeout = this.scanTimeout;
        return new Promise(function (resolve) {
            var img = new Image();
            var start = performance.now();
            var done = false;

            var cleanup = function (result) {
                if (done) return;
                done = true;
                img.src = '';
                resolve(result);
            };

            var timer = setTimeout(function () { cleanup(null); }, scanTimeout);

            img.onload = function () {
                clearTimeout(timer);
                cleanup({ ip: ip, responseTime: Math.round(performance.now() - start), method: 'img-load' });
            };
            img.onerror = function () {
                clearTimeout(timer);
                var elapsed = performance.now() - start;
                if (elapsed < 800) {
                    cleanup({ ip: ip, responseTime: Math.round(elapsed), method: 'img-error' });
                } else {
                    cleanup(null);
                }
            };

            img.src = 'http://' + ip + '/favicon.ico?t=' + Date.now();
        });
    }

    async fingerprint(ip) {
        var keyPorts = [80, 443, 62078, 548, 7000, 8008, 9100, 631, 445, 22, 554, 3389, 8080, 5353];
        var promises = [];
        for (var i = 0; i < keyPorts.length; i++) {
            promises.push(this.probePort(ip, keyPorts[i], 600));
        }
        var results = await Promise.all(promises);
        var openPorts = [];
        for (var j = 0; j < results.length; j++) {
            if (results[j] && results[j].open) {
                openPorts.push(results[j].port);
            }
        }
        return openPorts;
    }

    identifyDevice(ip, openPorts) {
        var lastOctet = parseInt(ip.split('.')[3], 10);

        if (lastOctet === 1) {
            return { name: 'Router / Gateway', icon: 'router', hostname: 'gateway', category: 'router' };
        }

        if (ip === this.localIp) {
            var selfName = this.detectSelfDevice();
            return { name: selfName, icon: 'self', hostname: 'this-device', category: 'self' };
        }

        if (!openPorts || openPorts.length === 0) {
            var genericName = 'Device-' + ip.split('.')[3];
            return { name: genericName, icon: 'device', hostname: genericName.toLowerCase(), category: 'unknown' };
        }

        var portSet = {};
        for (var i = 0; i < openPorts.length; i++) {
            portSet[openPorts[i]] = true;
        }

        if (portSet[62078]) {
            return { name: 'iPhone / iPad', icon: 'phone', hostname: 'iphone-' + lastOctet, category: 'apple' };
        }
        if (portSet[7000] && portSet[548]) {
            return { name: 'Apple TV', icon: 'tv', hostname: 'apple-tv-' + lastOctet, category: 'apple' };
        }
        if (portSet[7000]) {
            return { name: 'AirPlay Device', icon: 'tv', hostname: 'airplay-' + lastOctet, category: 'apple' };
        }
        if (portSet[548]) {
            return { name: 'Mac / MacBook', icon: 'laptop', hostname: 'mac-' + lastOctet, category: 'apple' };
        }

        if (portSet[8008] || portSet[8009]) {
            return { name: 'Chromecast / Google Home', icon: 'tv', hostname: 'chromecast-' + lastOctet, category: 'cast' };
        }

        if (portSet[9100] || portSet[631] || portSet[515]) {
            return { name: 'Printer', icon: 'printer', hostname: 'printer-' + lastOctet, category: 'printer' };
        }

        if (portSet[554] || portSet[8554]) {
            return { name: 'IP Camera', icon: 'camera', hostname: 'camera-' + lastOctet, category: 'camera' };
        }

        if (portSet[445] || portSet[139]) {
            var winName = portSet[3389] ? 'Windows PC (RDP)' : 'Windows PC';
            return { name: winName, icon: 'laptop', hostname: 'windows-pc-' + lastOctet, category: 'windows' };
        }
        if (portSet[3389]) {
            return { name: 'Windows PC (RDP)', icon: 'laptop', hostname: 'windows-pc-' + lastOctet, category: 'windows' };
        }

        if (portSet[22]) {
            var sshName = portSet[80] ? 'Linux Server' : 'Linux Device';
            return { name: sshName, icon: 'server', hostname: 'linux-' + lastOctet, category: 'linux' };
        }

        if (portSet[1883] || portSet[8883] || portSet[5000] || portSet[49152]) {
            return { name: 'Smart / IoT Device', icon: 'iot', hostname: 'iot-' + lastOctet, category: 'iot' };
        }

        if (portSet[8443] || portSet[9080]) {
            return { name: 'Smart TV', icon: 'tv', hostname: 'smart-tv-' + lastOctet, category: 'tv' };
        }

        if (portSet[80] || portSet[443] || portSet[8080]) {
            return { name: 'Network Device', icon: 'network', hostname: 'device-' + lastOctet, category: 'web' };
        }

        var fallbackName = 'Device-' + lastOctet;
        return { name: fallbackName, icon: 'device', hostname: fallbackName.toLowerCase(), category: 'unknown' };
    }

    detectSelfDevice() {
        var ua = navigator.userAgent || '';
        if (/iPhone/.test(ua)) return 'This iPhone (You)';
        if (/iPad/.test(ua)) return 'This iPad (You)';
        if (/Android/.test(ua) && /Mobile/.test(ua)) return 'This Android Phone (You)';
        if (/Android/.test(ua)) return 'This Android Tablet (You)';
        if (/Macintosh/.test(ua)) return 'This Mac (You)';
        if (/Windows/.test(ua)) return 'This Windows PC (You)';
        if (/Linux/.test(ua)) return 'This Linux PC (You)';
        return 'This Device (You)';
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

        var totalHosts = 254;
        var batchSize = 20;

        for (var batchStart = 1; batchStart <= totalHosts && this.isScanning; batchStart += batchSize) {
            var batchEnd = Math.min(batchStart + batchSize - 1, totalHosts);
            var promises = [];

            for (var i = batchStart; i <= batchEnd; i++) {
                var targetIp = this.subnet + '.' + i;
                promises.push(this.probeHost(targetIp));
            }

            var results = await Promise.all(promises);
            var newDevices = [];

            for (var r = 0; r < results.length; r++) {
                var result = results[r];
                if (result) {
                    var exists = this.foundDevices.some(function (d) { return d.ip === result.ip; });
                    if (!exists) {
                        newDevices.push(result);
                    }
                }
            }

            if (newDevices.length > 0) {
                var fpPromises = [];
                for (var n = 0; n < newDevices.length; n++) {
                    fpPromises.push(this.identifyNewDevice(newDevices[n]));
                }
                await Promise.all(fpPromises);
            }

            if (this.onProgress) {
                this.onProgress({
                    scanned: batchEnd,
                    total: totalHosts,
                    found: this.foundDevices.length,
                    percent: Math.round((batchEnd / totalHosts) * 100)
                });
            }
        }

        this.isScanning = false;

        this.foundDevices.sort(function (a, b) {
            var aNum = parseInt(a.ip.split('.')[3], 10);
            var bNum = parseInt(b.ip.split('.')[3], 10);
            return aNum - bNum;
        });

        if (this.onComplete) {
            this.onComplete(this.foundDevices);
        }

        return this.foundDevices;
    }

    async identifyNewDevice(device) {
        var openPorts = await this.fingerprint(device.ip);
        device.openPorts = openPorts;
        device.type = this.identifyDevice(device.ip, openPorts);
        device.lastSeen = Date.now();
        device.status = 'online';
        this.foundDevices.push(device);
        if (this.onDeviceFound) {
            this.onDeviceFound(device);
        }
    }

    async probeHost(ip) {
        var fetchResult = await this.probeDevice(ip);
        if (fetchResult) return fetchResult;

        var imgResult = await this.probeDeviceImage(ip);
        if (imgResult) return imgResult;

        return null;
    }

    startMonitoring(intervalMs) {
        var self = this;
        var ms = intervalMs || 15000;
        this.isMonitoring = true;

        this.monitorInterval = setInterval(function () {
            if (!self.isScanning && self.localIp) {
                self.refreshDevices();
            }
        }, ms);
    }

    stopMonitoring() {
        this.isMonitoring = false;
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }
    }

    async refreshDevices() {
        if (!this.subnet) return;

        for (var i = 0; i < this.foundDevices.length; i++) {
            var device = this.foundDevices[i];
            var alive = await this.probeDevice(device.ip);

            if (alive) {
                device.lastSeen = Date.now();
                device.responseTime = alive.responseTime;
                if (device.status !== 'online') {
                    device.status = 'online';
                    if (this.onDeviceUpdated) {
                        this.onDeviceUpdated(device);
                    }
                }
            } else {
                var timeSince = Date.now() - device.lastSeen;
                if (timeSince > 30000) {
                    device.status = 'offline';
                    if (this.onDeviceLost) {
                        this.onDeviceLost(device);
                    }
                }
            }
        }

        var quickScanIps = [];
        var existing = {};
        for (var j = 0; j < this.foundDevices.length; j++) {
            existing[this.foundDevices[j].ip] = true;
        }
        for (var k = 1; k <= 254; k += 10) {
            var checkIp = this.subnet + '.' + k;
            if (!existing[checkIp]) {
                quickScanIps.push(checkIp);
            }
        }

        var promises = [];
        for (var q = 0; q < quickScanIps.length; q++) {
            promises.push(this.probeHost(quickScanIps[q]));
        }
        var results = await Promise.all(promises);
        for (var r = 0; r < results.length; r++) {
            if (results[r] && !existing[results[r].ip]) {
                await this.identifyNewDevice(results[r]);
            }
        }

        if (this.onDeviceUpdated) {
            this.onDeviceUpdated(null);
        }
    }

    getDeviceIcon(iconType) {
        var icons = {
            router: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12.55a11 11 0 0 1 14.08 0"></path><path d="M1.42 9a16 16 0 0 1 21.16 0"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg>',
            self: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>',
            phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>',
            laptop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="2" y1="20" x2="22" y2="20"></line></svg>',
            tv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect><polyline points="17 2 12 7 7 2"></polyline></svg>',
            printer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>',
            camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>',
            server: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></svg>',
            iot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="2"></circle><path d="M16.24 7.76a6 6 0 0 1 0 8.49"></path><path d="M7.76 16.24a6 6 0 0 1 0-8.49"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path><path d="M4.93 19.07a10 10 0 0 1 0-14.14"></path></svg>',
            network: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>',
            device: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line></svg>'
        };
        return icons[iconType] || icons.device;
    }

    stop() {
        this.isScanning = false;
        this.stopMonitoring();
    }
}
