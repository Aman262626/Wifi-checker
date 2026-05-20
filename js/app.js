/**
 * WiFi Signal Checker - Main Application
 * Digital Compass & Signal Direction Finder
 */
(function () {
    'use strict';

    const compass = new DigitalCompass('compassCanvas');
    const speedTester = new SpeedTester();
    const networkScanner = new NetworkScanner();

    const elements = {
        signalValue: document.getElementById('signalValue'),
        signalLabel: document.getElementById('signalLabel'),
        bars: [
            document.getElementById('bar1'),
            document.getElementById('bar2'),
            document.getElementById('bar3'),
            document.getElementById('bar4'),
            document.getElementById('bar5')
        ],
        compassArrow: document.getElementById('compassArrow'),
        compassSpeed: document.getElementById('compassSpeed'),
        compassDirection: document.getElementById('compassDirection'),
        directionHint: document.getElementById('directionHint'),
        btnScan: document.getElementById('btnScan'),
        btnSpeedTest: document.getElementById('btnSpeedTest'),
        btnClear: document.getElementById('btnClear'),
        speedNumber: document.getElementById('speedNumber'),
        downloadSpeed: document.getElementById('downloadSpeed'),
        uploadSpeed: document.getElementById('uploadSpeed'),
        pingValue: document.getElementById('pingValue'),
        jitterValue: document.getElementById('jitterValue'),
        connType: document.getElementById('connType'),
        effType: document.getElementById('effType'),
        rttValue: document.getElementById('rttValue'),
        downlink: document.getElementById('downlink'),
        ipAddress: document.getElementById('ipAddress'),
        ispInfo: document.getElementById('ispInfo'),
        historyList: document.getElementById('historyList'),
        btnScanDevices: document.getElementById('btnScanDevices'),
        devicesCount: document.getElementById('devicesCount'),
        devicesProgress: document.getElementById('devicesProgress'),
        yourIp: document.getElementById('yourIp'),
        subnetRange: document.getElementById('subnetRange'),
        scanProgress: document.getElementById('scanProgress'),
        gatewayIp: document.getElementById('gatewayIp'),
        devicesList: document.getElementById('devicesList'),
        devicesListHeader: document.getElementById('devicesListHeader'),
        devicesListCount: document.getElementById('devicesListCount')
    };

    let scanHistory = [];
    let isScanning = false;

    function init() {
        updateConnectionInfo();
        startLiveMonitoring();
        setupEventListeners();
        setupDeviceOrientation();
        speedTester.drawGauge('speedGauge', 0, 100);
        fetchIpInfo();
    }

    function setupEventListeners() {
        elements.btnScan.addEventListener('click', toggleScan);
        elements.btnSpeedTest.addEventListener('click', runSpeedTest);
        elements.btnClear.addEventListener('click', clearHistory);
        elements.btnScanDevices.addEventListener('click', toggleDeviceScan);

        if ('connection' in navigator) {
            navigator.connection.addEventListener('change', updateConnectionInfo);
        }
    }

    function setupDeviceOrientation() {
        // Compass class handles sensor directly, but request iOS permission here via user gesture
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            elements.btnScan.addEventListener('click', async function requestOrientation() {
                await compass.requestPermission();
                elements.btnScan.removeEventListener('click', requestOrientation);
            }, { once: true });
        }
    }

    function updateConnectionInfo() {
        if ('connection' in navigator) {
            const conn = navigator.connection;
            elements.connType.textContent = conn.type || 'Unknown';
            elements.effType.textContent = (conn.effectiveType || 'Unknown').toUpperCase();
            elements.rttValue.textContent = conn.rtt ? conn.rtt + ' ms' : '--';
            elements.downlink.textContent = conn.downlink ? conn.downlink + ' Mbps' : '--';

            updateSignalStrength(conn.downlink || 0, conn.effectiveType || '');
        } else {
            elements.connType.textContent = 'N/A';
            elements.effType.textContent = 'N/A';
            elements.rttValue.textContent = 'N/A';
            elements.downlink.textContent = 'N/A';
        }
    }

    function updateSignalStrength(speed, effectiveType) {
        elements.signalValue.textContent = speed > 0 ? speed.toFixed(1) : '--';

        let quality, activeBars, barClass;
        if (effectiveType === '4g' || speed >= 10) {
            quality = 'Excellent';
            activeBars = 5;
            barClass = 'active';
        } else if (effectiveType === '3g' || speed >= 4) {
            quality = 'Good';
            activeBars = 4;
            barClass = 'active';
        } else if (effectiveType === '2g' || speed >= 1) {
            quality = 'Fair';
            activeBars = 3;
            barClass = 'warning';
        } else if (speed > 0) {
            quality = 'Poor';
            activeBars = 2;
            barClass = 'danger';
        } else {
            quality = 'Checking...';
            activeBars = 0;
            barClass = '';
        }

        elements.signalLabel.textContent = quality;

        elements.bars.forEach((bar, index) => {
            bar.className = 'bar bar-' + (index + 1);
            if (index < activeBars) {
                bar.classList.add(barClass);
            }
        });
    }

    function startLiveMonitoring() {
        setInterval(updateConnectionInfo, 3000);
    }

    async function toggleScan() {
        if (isScanning) {
            stopScan();
            return;
        }
        startScan();
    }

    async function startScan() {
        isScanning = true;
        elements.btnScan.classList.add('scanning');
        elements.btnScan.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg> Stop';
        compass.startScan();

        if (compass.sensorAvailable) {
            updateHint('Real sensor active! Phone ghuma kar har direction measure karein', false);
        } else {
            updateHint('Desktop mode - 8 directions scan ho rahi hain with real speed test', false);
        }

        var directions = [0, 45, 90, 135, 180, 225, 270, 315];

        for (var i = 0; i < directions.length && isScanning; i++) {
            var deg;

            if (compass.sensorAvailable) {
                // Use real sensor heading - wait for user to face this direction
                deg = compass.getRealHeading();
                var nearestSector = compass.getNearestSector(deg);
                var dirName = compass.getDirectionName(nearestSector);
                updateHint('Facing ' + dirName + ' (' + deg + '°) - Measuring real speed...', false);
                compass.setScanAngle(deg);
            } else {
                deg = directions[i];
                var dirNameFixed = compass.getDirectionName(deg);
                updateHint(dirNameFixed + ' - Real speed test ho rahi hai...', false);
                compass.setScanAngle(deg);
            }

            // Measure REAL speed with actual byte transfer
            var speed = await speedTester.quickSpeedCheck();

            if (!isScanning) break;

            var sectorDeg = compass.sensorAvailable ? compass.getNearestSector(deg) : deg;
            var result = compass.updateSector(sectorDeg, speed);

            addHistoryItem(sectorDeg, speed, result.bestDirection === sectorDeg);

            if (result.bestDirection !== null) {
                elements.compassArrow.style.transform = 'translateX(-50%) rotate(' + result.bestDirection + 'deg)';
                elements.compassSpeed.textContent = result.bestSpeed.toFixed(1);
                elements.compassDirection.textContent = compass.getShortDirection(result.bestDirection);
            }

            await sleep(800);
        }

        if (isScanning) {
            stopScan();
        }
    }

    function stopScan() {
        isScanning = false;
        compass.stopScan();
        elements.btnScan.classList.remove('scanning');
        elements.btnScan.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 12a9 9 0 1 1-9-9"></path><path d="M21 3v6h-6"></path></svg> Scan';

        if (compass.bestDirection !== null) {
            var bestDir = compass.getDirectionName(compass.bestDirection);
            var bestSpeed = compass.sectorData[compass.bestDirection].speed;
            updateHint('Best signal: ' + bestDir + ' - ' + bestSpeed.toFixed(1) + ' Mbps. Is taraf jaayein!', true);
        } else {
            updateHint('Scan complete. Koi strong direction nahi mili.', false);
        }
    }

    function updateHint(text, isSuccess) {
        const hint = elements.directionHint;
        hint.className = 'direction-hint' + (isSuccess ? ' success' : '');

        const iconSvg = isSuccess
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>';

        hint.innerHTML = iconSvg + '<span>' + text + '</span>';
    }

    async function runSpeedTest() {
        if (speedTester.isTesting) return;

        elements.btnSpeedTest.disabled = true;
        elements.btnSpeedTest.classList.add('testing');
        elements.btnSpeedTest.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20" style="animation: spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-9-9"></path><path d="M21 3v6h-6"></path></svg> Real Speed Test...';

        speedTester.onProgress = function (type, data) {
            switch (type) {
                case 'download':
                    elements.downloadSpeed.textContent = data.toFixed(2) + ' Mbps';
                    elements.speedNumber.textContent = data.toFixed(1);
                    speedTester.drawGauge('speedGauge', data, 100);
                    break;
                case 'upload':
                    elements.uploadSpeed.textContent = data.toFixed(2) + ' Mbps';
                    break;
                case 'ping':
                    elements.pingValue.textContent = data.ping + ' ms';
                    elements.jitterValue.textContent = data.jitter + ' ms';
                    break;
                case 'status':
                    elements.btnSpeedTest.querySelector('svg').nextSibling.textContent =
                        ' ' + data;
                    break;
            }
        };

        speedTester.onComplete = function (results) {
            elements.speedNumber.textContent = results.download.toFixed(1);
            elements.downloadSpeed.textContent = results.download.toFixed(2) + ' Mbps';
            elements.uploadSpeed.textContent = results.upload.toFixed(2) + ' Mbps';
            elements.pingValue.textContent = results.ping + ' ms';
            elements.jitterValue.textContent = results.jitter + ' ms';
            speedTester.drawGauge('speedGauge', results.download, 100);

            updateSignalStrength(results.download, '');
        };

        try {
            await speedTester.runFullTest();
        } catch (_e) {
            /* test failed */
        }

        elements.btnSpeedTest.disabled = false;
        elements.btnSpeedTest.classList.remove('testing');
        elements.btnSpeedTest.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Dobara Test Karein';
    }

    function addHistoryItem(degree, speed, isBest) {
        var entry = {
            direction: compass.getShortDirection(degree),
            directionFull: compass.getDirectionName(degree),
            speed: speed,
            time: new Date(),
            isBest: isBest
        };

        scanHistory.unshift(entry);
        renderHistory();
    }

    function renderHistory() {
        if (scanHistory.length === 0) {
            elements.historyList.innerHTML = '<div class="empty-history"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg><p>Abhi tak koi scan nahi hua</p></div>';
            return;
        }

        var speeds = scanHistory.map(function (e) { return e.speed; });
        var bestSpeed = Math.max.apply(null, speeds);

        elements.historyList.innerHTML = scanHistory.map(function (entry) {
            var timeStr = entry.time.toLocaleTimeString('hi-IN', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            var isBestEntry = entry.speed === bestSpeed && entry.speed > 0;

            return '<div class="history-item">' +
                '<span class="history-direction">' + entry.direction + '</span>' +
                '<span class="history-speed">' + entry.speed.toFixed(2) + ' Mbps</span>' +
                (isBestEntry ? '<span class="history-best">Best</span>' : '') +
                '<span class="history-time">' + timeStr + '</span>' +
            '</div>';
        }).join('');
    }

    function clearHistory() {
        scanHistory = [];
        compass.reset();
        elements.compassSpeed.textContent = '--';
        elements.compassDirection.textContent = 'N';
        elements.compassArrow.style.transform = 'translateX(-50%) rotate(0deg)';
        updateHint('Scanning shuru karne ke liye "Scan" button dabayein', false);
        renderHistory();
    }

    async function fetchIpInfo() {
        try {
            const response = await fetch('https://ipapi.co/json/');
            if (response.ok) {
                const data = await response.json();
                elements.ipAddress.textContent = data.ip || '--';
                elements.ispInfo.textContent =
                    (data.org || 'Unknown') +
                    (data.city ? ', ' + data.city : '');
            }
        } catch (_e) {
            elements.ipAddress.textContent = 'N/A';
            elements.ispInfo.textContent = 'N/A';
        }
    }

    /* ========== Network Device Scanner ========== */

    var isDeviceScanning = false;
    var currentLocalIp = null;

    async function toggleDeviceScan() {
        if (isDeviceScanning) {
            networkScanner.stop();
            isDeviceScanning = false;
            resetDeviceScanButton();
            return;
        }
        startDeviceScan();
    }

    async function startDeviceScan() {
        isDeviceScanning = true;
        elements.btnScanDevices.classList.add('scanning');
        elements.btnScanDevices.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg> Stop';
        elements.scanProgress.textContent = 'IP detect ho raha hai...';
        elements.devicesList.innerHTML = '<div class="empty-history"><p>Scanning & identifying devices...</p></div>';

        var localIp = await networkScanner.getLocalIp();
        currentLocalIp = localIp;

        if (!localIp) {
            elements.scanProgress.textContent = 'IP detect nahi hua';
            elements.devicesList.innerHTML = '<div class="empty-history"><p>Local IP detect nahi ho saka. WiFi se connect karein.</p></div>';
            isDeviceScanning = false;
            resetDeviceScanButton();
            return;
        }

        var subnet = networkScanner.parseSubnet(localIp);
        elements.yourIp.textContent = localIp;
        elements.subnetRange.textContent = subnet + '.1-254';
        elements.gatewayIp.textContent = subnet + '.1';
        elements.scanProgress.textContent = 'Scanning & fingerprinting...';

        networkScanner.onDeviceFound = function () {
            updateDevicesList(networkScanner.foundDevices, localIp);
        };

        networkScanner.onProgress = function (progress) {
            elements.scanProgress.textContent = progress.percent + '% (' + progress.found + ' devices)';
            elements.devicesCount.textContent = progress.found;
            updateDevicesRing(progress.percent);
        };

        networkScanner.onComplete = function (devices) {
            var onlineCount = devices.filter(function (d) { return d.status === 'online'; }).length;
            elements.scanProgress.textContent = 'Live: ' + onlineCount + ' / ' + devices.length + ' devices';
            elements.devicesCount.textContent = devices.length;
            updateDevicesRing(100);
            updateDevicesList(devices, localIp);
            isDeviceScanning = false;
            resetDeviceScanButton();

            networkScanner.onDeviceUpdated = function () {
                updateDevicesList(networkScanner.foundDevices, localIp);
                var online = networkScanner.foundDevices.filter(function (d) { return d.status === 'online'; }).length;
                elements.scanProgress.textContent = 'Live: ' + online + ' / ' + networkScanner.foundDevices.length + ' devices';
                elements.devicesCount.textContent = networkScanner.foundDevices.length;
            };

            networkScanner.onDeviceLost = function (device) {
                updateDevicesList(networkScanner.foundDevices, localIp);
            };

            networkScanner.startMonitoring(15000);
        };

        await networkScanner.scanSubnet(localIp);
    }

    function resetDeviceScanButton() {
        elements.btnScanDevices.classList.remove('scanning');
        elements.btnScanDevices.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 12a9 9 0 1 1-9-9"></path><path d="M21 3v6h-6"></path></svg> Scan Network';
    }

    function updateDevicesRing(percent) {
        var circumference = 327;
        var offset = circumference - (percent / 100) * circumference;
        elements.devicesProgress.setAttribute('stroke-dashoffset', offset);
    }

    function formatLastSeen(timestamp) {
        if (!timestamp) return '';
        var diff = Math.round((Date.now() - timestamp) / 1000);
        if (diff < 5) return 'just now';
        if (diff < 60) return diff + 's ago';
        if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
        return Math.floor(diff / 3600) + 'h ago';
    }

    function updateDevicesList(devices, localIp) {
        if (devices.length === 0) {
            elements.devicesListHeader.style.display = 'none';
            elements.devicesList.innerHTML = '<div class="empty-history"><p>Koi device nahi mila</p></div>';
            return;
        }

        elements.devicesListHeader.style.display = 'flex';
        elements.devicesListCount.textContent = devices.length;

        elements.devicesList.innerHTML = devices.map(function (device) {
            var isSelf = device.ip === localIp;
            var isGateway = device.ip.endsWith('.1');
            var isOffline = device.status === 'offline';

            var badgeClass = isSelf ? 'you' : isGateway ? 'gateway' : isOffline ? 'offline' : 'active';
            var badgeText = isSelf ? 'You' : isGateway ? 'Router' : isOffline ? 'Offline' : 'Online';
            var iconClass = isSelf ? 'self' : isGateway ? 'router' : isOffline ? 'offline' : '';

            var deviceName = device.type ? device.type.name : 'Unknown Device';
            var hostname = device.type && device.type.hostname ? device.type.hostname : '';
            var iconType = device.type ? device.type.icon : 'device';

            var portsInfo = '';
            if (device.openPorts && device.openPorts.length > 0) {
                portsInfo = ' <span class="device-ports">' + device.openPorts.join(', ') + '</span>';
            }

            var lastSeenText = formatLastSeen(device.lastSeen);

            return '<div class="device-item' + (isOffline ? ' device-offline' : '') + '">' +
                '<div class="device-item-icon ' + iconClass + '">' +
                    networkScanner.getDeviceIcon(iconType) +
                '</div>' +
                '<div class="device-item-info">' +
                    '<div class="device-item-name">' + deviceName + '</div>' +
                    '<div class="device-item-ip">' + device.ip +
                        (hostname ? ' &middot; ' + hostname : '') +
                    '</div>' +
                    (portsInfo ? '<div class="device-item-ports">Ports: ' + portsInfo + '</div>' : '') +
                '</div>' +
                '<div class="device-item-meta">' +
                    '<span class="device-item-badge ' + badgeClass + '">' + badgeText + '</span>' +
                    (device.responseTime > 0 ? '<span class="device-item-time">' + device.responseTime + 'ms</span>' : '') +
                    (lastSeenText ? '<span class="device-item-seen">' + lastSeenText + '</span>' : '') +
                '</div>' +
            '</div>';
        }).join('');
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
