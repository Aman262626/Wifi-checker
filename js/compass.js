/**
 * Digital Compass - Real sensor-based compass with signal heatmap.
 * Uses DeviceOrientationEvent (magnetometer/gyroscope) for real heading.
 * The entire compass ring rotates based on actual device orientation.
 */
class DigitalCompass {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.centerX = this.canvas.width / 2;
        this.centerY = this.canvas.height / 2;
        this.radius = Math.min(this.centerX, this.centerY) - 20;

        this.sectorData = {};
        this.bestDirection = null;
        this.currentAngle = 0;
        this.isScanning = false;

        // Real sensor data
        this.heading = 0;           // Real compass heading from magnetometer (0-360)
        this.headingSmooth = 0;     // Smoothed heading for animation
        this.sensorAvailable = false;
        this.sensorPermission = 'unknown'; // 'unknown', 'granted', 'denied'

        for (var i = 0; i < 360; i += 45) {
            this.sectorData[i] = { speed: 0, samples: 0 };
        }

        this.initSensor();
        this.startRenderLoop();
    }

    initSensor() {
        var self = this;

        if (!('DeviceOrientationEvent' in window)) {
            this.sensorAvailable = false;
            this.draw();
            return;
        }

        // iOS 13+ requires explicit permission
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            this.sensorPermission = 'needs-request';
        } else {
            // Android / desktop - listen directly
            window.addEventListener('deviceorientation', function (e) {
                self.handleSensorData(e);
            }, true);

            // Also try deviceorientationabsolute for true north on Android
            window.addEventListener('deviceorientationabsolute', function (e) {
                self.handleSensorData(e);
            }, true);
        }

        this.draw();
    }

    async requestPermission() {
        if (typeof DeviceOrientationEvent.requestPermission !== 'function') {
            return this.sensorAvailable;
        }

        try {
            var permission = await DeviceOrientationEvent.requestPermission();
            if (permission === 'granted') {
                this.sensorPermission = 'granted';
                var self = this;
                window.addEventListener('deviceorientation', function (e) {
                    self.handleSensorData(e);
                }, true);
                return true;
            } else {
                this.sensorPermission = 'denied';
                return false;
            }
        } catch (_e) {
            this.sensorPermission = 'denied';
            return false;
        }
    }

    handleSensorData(event) {
        // event.alpha = compass heading (0-360), 0 = North
        // event.beta = front-back tilt (-180 to 180)
        // event.gamma = left-right tilt (-90 to 90)
        if (event.alpha !== null && event.alpha !== undefined) {
            this.sensorAvailable = true;
            this.sensorPermission = 'granted';

            // For compass: alpha is rotation around Z-axis
            // On Android with webkitCompassHeading
            if (event.webkitCompassHeading !== undefined) {
                this.heading = event.webkitCompassHeading;
            } else {
                // Standard: alpha is degrees relative to initial orientation
                // For true compass: heading = 360 - alpha
                this.heading = (360 - event.alpha) % 360;
            }
        }
    }

    startRenderLoop() {
        var self = this;
        function loop() {
            // Smooth heading interpolation for fluid compass rotation
            var diff = self.heading - self.headingSmooth;
            // Handle wrap-around (e.g., 350 -> 10)
            if (diff > 180) diff -= 360;
            if (diff < -180) diff += 360;
            self.headingSmooth += diff * 0.15; // Smoothing factor
            if (self.headingSmooth < 0) self.headingSmooth += 360;
            if (self.headingSmooth >= 360) self.headingSmooth -= 360;

            self.draw();
            requestAnimationFrame(loop);
        }
        requestAnimationFrame(loop);
    }

    draw() {
        var ctx = this.ctx;
        var cx = this.centerX;
        var cy = this.centerY;
        var r = this.radius;

        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Save context and rotate the entire compass based on real heading
        ctx.save();
        ctx.translate(cx, cy);
        if (this.sensorAvailable) {
            ctx.rotate((-this.headingSmooth * Math.PI) / 180);
        }
        ctx.translate(-cx, -cy);

        this.drawOuterRing(ctx, cx, cy, r);
        this.drawSectorHeatmap(ctx, cx, cy, r);
        this.drawTickMarks(ctx, cx, cy, r);

        ctx.restore();

        // Inner circle and scan beam don't rotate
        this.drawInnerCircle(ctx, cx, cy, r);

        if (this.isScanning) {
            ctx.save();
            ctx.translate(cx, cy);
            if (this.sensorAvailable) {
                ctx.rotate((-this.headingSmooth * Math.PI) / 180);
            }
            ctx.translate(-cx, -cy);
            this.drawScanBeam(ctx, cx, cy, r);
            ctx.restore();
        }

        // Draw sensor status indicator
        this.drawSensorStatus(ctx, cx, cy, r);
    }

    drawSensorStatus(ctx, cx, cy, r) {
        ctx.font = '8px Orbitron';
        ctx.textAlign = 'center';

        if (this.sensorAvailable) {
            ctx.fillStyle = 'rgba(0, 255, 136, 0.6)';
            ctx.fillText('SENSOR: LIVE  ' + Math.round(this.heading) + '°', cx, cy + r + 14);
        } else {
            ctx.fillStyle = 'rgba(255, 170, 0, 0.5)';
            ctx.fillText('SENSOR: N/A (Desktop mode)', cx, cy + r + 14);
        }
    }

    drawOuterRing(ctx, cx, cy, r) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 212, 255, 0.15)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, r - 8, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 212, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.stroke();

        var gradient = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r);
        gradient.addColorStop(0, 'transparent');
        gradient.addColorStop(1, 'rgba(0, 212, 255, 0.03)');
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
    }

    drawSectorHeatmap(ctx, cx, cy, r) {
        var directions = Object.keys(this.sectorData);
        var speeds = directions.map(function (d) { return this.sectorData[d].speed; }.bind(this));
        var maxSpeed = Math.max.apply(null, speeds.concat([1]));

        for (var idx = 0; idx < directions.length; idx++) {
            var deg = directions[idx];
            var data = this.sectorData[deg];
            if (data.speed <= 0) continue;

            var intensity = data.speed / maxSpeed;
            var startAngle = ((parseInt(deg) - 22.5) * Math.PI) / 180 - Math.PI / 2;
            var endAngle = ((parseInt(deg) + 22.5) * Math.PI) / 180 - Math.PI / 2;

            var color = this.getHeatColor(intensity);

            var gradient = ctx.createRadialGradient(cx, cy, r * 0.35, cx, cy, r - 10);
            gradient.addColorStop(0, 'transparent');
            gradient.addColorStop(0.5, color.replace(')', ', ' + (intensity * 0.15) + ')').replace('rgb', 'rgba'));
            gradient.addColorStop(1, color.replace(')', ', ' + (intensity * 0.4) + ')').replace('rgb', 'rgba'));

            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, r - 10, startAngle, endAngle);
            ctx.closePath();
            ctx.fillStyle = gradient;
            ctx.fill();
        }
    }

    drawTickMarks(ctx, cx, cy, r) {
        for (var i = 0; i < 360; i += 5) {
            var angle = (i * Math.PI) / 180 - Math.PI / 2;
            var isMain = i % 45 === 0;
            var isMid = i % 15 === 0;

            var outerR = r - 2;
            var innerR = isMain ? r - 18 : isMid ? r - 12 : r - 8;

            ctx.beginPath();
            ctx.moveTo(cx + outerR * Math.cos(angle), cy + outerR * Math.sin(angle));
            ctx.lineTo(cx + innerR * Math.cos(angle), cy + innerR * Math.sin(angle));

            if (isMain) {
                ctx.strokeStyle = 'rgba(0, 212, 255, 0.6)';
                ctx.lineWidth = 2;
            } else if (isMid) {
                ctx.strokeStyle = 'rgba(0, 212, 255, 0.3)';
                ctx.lineWidth = 1;
            } else {
                ctx.strokeStyle = 'rgba(0, 212, 255, 0.1)';
                ctx.lineWidth = 1;
            }
            ctx.stroke();
        }

        // Direction labels (N, NE, E, etc.) - these rotate with compass
        var labels = [
            { deg: 0, text: 'N', color: '#ff4466' },
            { deg: 45, text: 'NE', color: 'rgba(0, 212, 255, 0.5)' },
            { deg: 90, text: 'E', color: 'rgba(0, 212, 255, 0.7)' },
            { deg: 135, text: 'SE', color: 'rgba(0, 212, 255, 0.5)' },
            { deg: 180, text: 'S', color: 'rgba(0, 212, 255, 0.7)' },
            { deg: 225, text: 'SW', color: 'rgba(0, 212, 255, 0.5)' },
            { deg: 270, text: 'W', color: 'rgba(0, 212, 255, 0.7)' },
            { deg: 315, text: 'NW', color: 'rgba(0, 212, 255, 0.5)' }
        ];

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (var j = 0; j < labels.length; j++) {
            var lbl = labels[j];
            var lblAngle = (lbl.deg * Math.PI) / 180 - Math.PI / 2;
            var labelR = r - 26;

            ctx.font = lbl.deg % 90 === 0 ? 'bold 11px Orbitron' : '9px Orbitron';
            ctx.fillStyle = lbl.color;
            ctx.fillText(lbl.text, cx + labelR * Math.cos(lblAngle), cy + labelR * Math.sin(lblAngle));
        }
    }

    drawInnerCircle(ctx, cx, cy, r) {
        var innerR = r * 0.32;
        var gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, innerR);
        gradient.addColorStop(0, 'rgba(17, 24, 39, 0.95)');
        gradient.addColorStop(1, 'rgba(17, 24, 39, 0.8)');

        ctx.beginPath();
        ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 212, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Fixed north pointer (red triangle at top) - doesn't rotate
        ctx.beginPath();
        ctx.moveTo(cx, cy - innerR - 6);
        ctx.lineTo(cx - 5, cy - innerR + 2);
        ctx.lineTo(cx + 5, cy - innerR + 2);
        ctx.closePath();
        ctx.fillStyle = '#ff4466';
        ctx.fill();
    }

    drawScanBeam(ctx, cx, cy, r) {
        var angle = (this.currentAngle * Math.PI) / 180 - Math.PI / 2;
        var beamWidth = 0.15;

        var gradient = ctx.createRadialGradient(cx, cy, r * 0.35, cx, cy, r - 10);
        gradient.addColorStop(0, 'rgba(0, 212, 255, 0)');
        gradient.addColorStop(0.6, 'rgba(0, 212, 255, 0.1)');
        gradient.addColorStop(1, 'rgba(0, 212, 255, 0.3)');

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r - 10, angle - beamWidth, angle + beamWidth);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();
    }

    getHeatColor(intensity) {
        if (intensity > 0.75) return 'rgb(0, 255, 136)';
        if (intensity > 0.5) return 'rgb(0, 212, 255)';
        if (intensity > 0.25) return 'rgb(255, 170, 0)';
        return 'rgb(255, 68, 102)';
    }

    getRealHeading() {
        return Math.round(this.heading);
    }

    getNearestSector(heading) {
        return Math.round(heading / 45) * 45 % 360;
    }

    updateSector(degree, speed) {
        var normalizedDeg = Math.round(degree / 45) * 45 % 360;
        var sector = this.sectorData[normalizedDeg];
        sector.samples++;
        sector.speed = (sector.speed * (sector.samples - 1) + speed) / sector.samples;

        var bestDeg = null;
        var bestSpeed = 0;
        var keys = Object.keys(this.sectorData);
        for (var i = 0; i < keys.length; i++) {
            if (this.sectorData[keys[i]].speed > bestSpeed) {
                bestSpeed = this.sectorData[keys[i]].speed;
                bestDeg = parseInt(keys[i]);
            }
        }
        this.bestDirection = bestDeg;

        return { bestDirection: this.bestDirection, bestSpeed: bestSpeed };
    }

    setScanAngle(angle) {
        this.currentAngle = angle;
    }

    startScan() {
        this.isScanning = true;
    }

    stopScan() {
        this.isScanning = false;
    }

    reset() {
        var keys = Object.keys(this.sectorData);
        for (var i = 0; i < keys.length; i++) {
            this.sectorData[keys[i]] = { speed: 0, samples: 0 };
        }
        this.bestDirection = null;
        this.isScanning = false;
    }

    getDirectionName(deg) {
        var directions = {
            0: 'North (N)', 45: 'North-East (NE)', 90: 'East (E)',
            135: 'South-East (SE)', 180: 'South (S)', 225: 'South-West (SW)',
            270: 'West (W)', 315: 'North-West (NW)'
        };
        return directions[deg] || deg + '°';
    }

    getShortDirection(deg) {
        var directions = {
            0: 'N', 45: 'NE', 90: 'E', 135: 'SE',
            180: 'S', 225: 'SW', 270: 'W', 315: 'NW'
        };
        return directions[deg] || deg + '°';
    }
}
