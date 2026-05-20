# WiFi Signal Checker - Digital Compass

A modern web application that checks WiFi signal strength and shows the best signal direction using a digital compass interface.

## Features

- **Digital Signal Compass** - Visual compass showing signal strength in all 8 directions (N, NE, E, SE, S, SW, W, NW). The compass uses a heatmap overlay to indicate which direction has the strongest signal.
- **Direction Arrow** - A glowing arrow that points toward the direction with the best WiFi speed, telling you which way to move.
- **Live Signal Monitoring** - Real-time WiFi signal strength display with animated signal bars.
- **Speed Test** - Full speed test measuring download speed, upload speed, ping, and jitter using Cloudflare's speed test endpoints.
- **Connection Info** - Detailed connection information including connection type, effective type, RTT, downlink speed, IP address, and ISP details.
- **Scan History** - Keeps a log of all scanned directions with timestamps, highlighting the best direction found.

## How It Works

1. Open the app in a mobile browser
2. Tap the **Scan** button on the compass card
3. The app will test WiFi speed in all 8 compass directions
4. The compass heatmap will light up - green for strong, red for weak
5. The arrow will point toward the best direction
6. A hint message will tell you which direction to move for better speed
7. Use the **Speed Test** button for a full download/upload speed test

## Tech Stack

- **HTML5** - Semantic markup with SVG icons
- **CSS3** - Dark theme with glassmorphism, animations, and responsive design
- **JavaScript (Vanilla)** - Canvas-based compass, Network Information API, DeviceOrientation API
- **Cloudflare Speed Test** - Download and upload speed measurement
- **ipapi.co** - IP address and ISP information

## APIs Used

- **Network Information API** - For real-time connection type and downlink speed
- **DeviceOrientation API** - For device compass heading (on supported mobile devices)
- **Cloudflare Speed Endpoints** - For accurate speed testing
- **Performance API** - For precise timing measurements

## Running Locally

Simply open `index.html` in a web browser, or use a local server:

```bash
# Using Python
python3 -m http.server 8080

# Using Node.js (npx)
npx serve .

# Using PHP
php -S localhost:8080
```

Then open `http://localhost:8080` in your browser.

## Best Experience

For the best experience:
- Use on a **mobile device** (for compass heading support)
- Allow **device orientation** permission when prompted
- Connect to **WiFi** (not cellular data)
- **Move around** while scanning to see signal changes

## Browser Support

- Chrome 61+ (Desktop & Android)
- Safari 14.1+ (iOS - requires orientation permission)
- Firefox 89+
- Edge 79+

## Screenshots

The app features a dark, futuristic UI with:
- Glowing cyan accent colors
- Animated signal bars
- Canvas-based compass with heatmap sectors
- Speed gauge with gradient coloring
- Responsive layout for mobile devices

## License

MIT
