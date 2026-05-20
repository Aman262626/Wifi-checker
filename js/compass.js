/**
 * Digital Compass - Draws the compass ring with signal heatmap sectors.
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

        for (let i = 0; i < 360; i += 45) {
            this.sectorData[i] = { speed: 0, samples: 0 };
        }

        this.draw();
    }

    draw() {
        const ctx = this.ctx;
        const cx = this.centerX;
        const cy = this.centerY;
        const r = this.radius;

        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.drawOuterRing(ctx, cx, cy, r);
        this.drawSectorHeatmap(ctx, cx, cy, r);
        this.drawTickMarks(ctx, cx, cy, r);
        this.drawInnerCircle(ctx, cx, cy, r);

        if (this.isScanning) {
            this.drawScanBeam(ctx, cx, cy, r);
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

        const gradient = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r);
        gradient.addColorStop(0, 'transparent');
        gradient.addColorStop(1, 'rgba(0, 212, 255, 0.03)');
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
    }

    drawSectorHeatmap(ctx, cx, cy, r) {
        const directions = Object.keys(this.sectorData);
        const maxSpeed = Math.max(
            ...directions.map(d => this.sectorData[d].speed),
            1
        );

        directions.forEach(deg => {
            const data = this.sectorData[deg];
            if (data.speed <= 0) return;

            const intensity = data.speed / maxSpeed;
            const startAngle = ((parseInt(deg) - 22.5) * Math.PI) / 180 - Math.PI / 2;
            const endAngle = ((parseInt(deg) + 22.5) * Math.PI) / 180 - Math.PI / 2;

            const color = this.getHeatColor(intensity);

            const gradient = ctx.createRadialGradient(cx, cy, r * 0.35, cx, cy, r - 10);
            gradient.addColorStop(0, 'transparent');
            gradient.addColorStop(0.5, color.replace(')', `, ${intensity * 0.15})`).replace('rgb', 'rgba'));
            gradient.addColorStop(1, color.replace(')', `, ${intensity * 0.4})`).replace('rgb', 'rgba'));

            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, r - 10, startAngle, endAngle);
            ctx.closePath();
            ctx.fillStyle = gradient;
            ctx.fill();
        });
    }

    drawTickMarks(ctx, cx, cy, r) {
        for (let i = 0; i < 360; i += 5) {
            const angle = (i * Math.PI) / 180 - Math.PI / 2;
            const isMain = i % 45 === 0;
            const isMid = i % 15 === 0;

            const outerR = r - 2;
            const innerR = isMain ? r - 18 : isMid ? r - 12 : r - 8;

            ctx.beginPath();
            ctx.moveTo(
                cx + outerR * Math.cos(angle),
                cy + outerR * Math.sin(angle)
            );
            ctx.lineTo(
                cx + innerR * Math.cos(angle),
                cy + innerR * Math.sin(angle)
            );

            ctx.strokeStyle = isMain
                ? 'rgba(0, 212, 255, 0.6)'
                : isMid
                    ? 'rgba(0, 212, 255, 0.3)'
                    : 'rgba(0, 212, 255, 0.1)';
            ctx.lineWidth = isMain ? 2 : 1;
            ctx.stroke();
        }

        const degreeLabels = [
            { deg: 0, label: '0°' },
            { deg: 45, label: '45°' },
            { deg: 90, label: '90°' },
            { deg: 135, label: '135°' },
            { deg: 180, label: '180°' },
            { deg: 225, label: '225°' },
            { deg: 270, label: '270°' },
            { deg: 315, label: '315°' }
        ];

        ctx.font = '10px Orbitron';
        ctx.fillStyle = 'rgba(0, 212, 255, 0.4)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        degreeLabels.forEach(({ deg, label }) => {
            const angle = (deg * Math.PI) / 180 - Math.PI / 2;
            const labelR = r - 26;
            ctx.fillText(
                label,
                cx + labelR * Math.cos(angle),
                cy + labelR * Math.sin(angle)
            );
        });
    }

    drawInnerCircle(ctx, cx, cy, r) {
        const innerR = r * 0.32;

        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, innerR);
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
    }

    drawScanBeam(ctx, cx, cy, r) {
        const angle = (this.currentAngle * Math.PI) / 180 - Math.PI / 2;
        const beamWidth = 0.15;

        const gradient = ctx.createRadialGradient(cx, cy, r * 0.35, cx, cy, r - 10);
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

    updateSector(degree, speed) {
        const normalizedDeg = Math.round(degree / 45) * 45 % 360;
        const sector = this.sectorData[normalizedDeg];
        sector.samples++;
        sector.speed = (sector.speed * (sector.samples - 1) + speed) / sector.samples;

        let bestDeg = null;
        let bestSpeed = 0;
        Object.keys(this.sectorData).forEach(d => {
            if (this.sectorData[d].speed > bestSpeed) {
                bestSpeed = this.sectorData[d].speed;
                bestDeg = parseInt(d);
            }
        });
        this.bestDirection = bestDeg;

        this.draw();
        return { bestDirection: this.bestDirection, bestSpeed };
    }

    setScanAngle(angle) {
        this.currentAngle = angle;
        this.draw();
    }

    startScan() {
        this.isScanning = true;
    }

    stopScan() {
        this.isScanning = false;
        this.draw();
    }

    reset() {
        Object.keys(this.sectorData).forEach(d => {
            this.sectorData[d] = { speed: 0, samples: 0 };
        });
        this.bestDirection = null;
        this.isScanning = false;
        this.draw();
    }

    getDirectionName(deg) {
        const directions = {
            0: 'North (N)',
            45: 'North-East (NE)',
            90: 'East (E)',
            135: 'South-East (SE)',
            180: 'South (S)',
            225: 'South-West (SW)',
            270: 'West (W)',
            315: 'North-West (NW)'
        };
        return directions[deg] || `${deg}°`;
    }

    getShortDirection(deg) {
        const directions = {
            0: 'N', 45: 'NE', 90: 'E', 135: 'SE',
            180: 'S', 225: 'SW', 270: 'W', 315: 'NW'
        };
        return directions[deg] || `${deg}°`;
    }
}
