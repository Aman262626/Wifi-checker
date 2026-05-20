/**
 * WiFi Signal Checker - Main Application
 * Digital Compass & Signal Direction Finder
 */
(function () {
    'use strict';

    const compass = new DigitalCompass('compassCanvas');
    const speedTester = new SpeedTester();

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
        historyList: document.getElementById('historyList')
    };

    let scanHistory = [];
    let isScanning = false;
    let deviceHeading = null;

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

        if ('connection' in navigator) {
            navigator.connection.addEventListener('change', updateConnectionInfo);
        }
    }

    function setupDeviceOrientation() {
        if ('DeviceOrientationEvent' in window) {
            if (typeof DeviceOrientationEvent.requestPermission === 'function') {
                elements.btnScan.addEventListener('click', async function requestOrientation() {
                    try {
                        const permission = await DeviceOrientationEvent.requestPermission();
                        if (permission === 'granted') {
                            window.addEventListener('deviceorientation', handleOrientation);
                        }
                    } catch (_e) {
                        /* permission denied or not supported */
                    }
                    elements.btnScan.removeEventListener('click', requestOrientation);
                }, { once: true });
            } else {
                window.addEventListener('deviceorientation', handleOrientation);
            }
        }
    }

    function handleOrientation(event) {
        if (event.alpha !== null) {
            deviceHeading = Math.round(event.alpha);
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
        elements.btnScan.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <rect x="6" y="6" width="12" height="12" rx="2"></rect>
            </svg>
            Stop
        `;
        compass.startScan();

        updateHint('Scanning shuru ho gaya... Apna phone ghuma kar dekhein', false);

        const totalSteps = 8;
        const directions = [0, 45, 90, 135, 180, 225, 270, 315];

        for (let i = 0; i < totalSteps && isScanning; i++) {
            const deg = directions[i];

            compass.setScanAngle(deg);

            const dirName = compass.getDirectionName(deg);
            updateHint(`${dirName} direction check ho rahi hai...`, false);

            const speed = await speedTester.quickSpeedCheck();

            if (!isScanning) break;

            const result = compass.updateSector(deg, speed);

            addHistoryItem(deg, speed, result.bestDirection === deg);

            if (result.bestDirection !== null) {
                elements.compassArrow.style.transform =
                    `translateX(-50%) rotate(${result.bestDirection}deg)`;
                elements.compassSpeed.textContent = result.bestSpeed.toFixed(1);
                elements.compassDirection.textContent =
                    compass.getShortDirection(result.bestDirection);
            }

            await sleep(500);
        }

        if (isScanning) {
            stopScan();
        }
    }

    function stopScan() {
        isScanning = false;
        compass.stopScan();
        elements.btnScan.classList.remove('scanning');
        elements.btnScan.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="M21 12a9 9 0 1 1-9-9"></path>
                <path d="M21 3v6h-6"></path>
            </svg>
            Scan
        `;

        if (compass.bestDirection !== null) {
            const bestDir = compass.getDirectionName(compass.bestDirection);
            const bestSpeed = compass.sectorData[compass.bestDirection].speed;
            updateHint(
                `Best signal: ${bestDir} - ${bestSpeed.toFixed(1)} Mbps. Is taraf jaayein!`,
                true
            );
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
        elements.btnSpeedTest.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20" style="animation: spin 1s linear infinite">
                <path d="M21 12a9 9 0 1 1-9-9"></path>
                <path d="M21 3v6h-6"></path>
            </svg>
            Testing...
        `;

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
        elements.btnSpeedTest.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            Dobara Test Karein
        `;
    }

    function addHistoryItem(degree, speed, isBest) {
        const entry = {
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
            elements.historyList.innerHTML = `
                <div class="empty-history">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                    <p>Abhi tak koi scan nahi hua</p>
                </div>
            `;
            return;
        }

        let bestSpeed = Math.max(...scanHistory.map(e => e.speed));

        elements.historyList.innerHTML = scanHistory
            .map(entry => {
                const timeStr = entry.time.toLocaleTimeString('hi-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });
                const isBestEntry = entry.speed === bestSpeed && entry.speed > 0;

                return `
                    <div class="history-item">
                        <span class="history-direction">${entry.direction}</span>
                        <span class="history-speed">${entry.speed.toFixed(2)} Mbps</span>
                        ${isBestEntry ? '<span class="history-best">Best</span>' : ''}
                        <span class="history-time">${timeStr}</span>
                    </div>
                `;
            })
            .join('');
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

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
