const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const app = express();
const PORT = 3000;

// Canvas state as a sparse matrix
let canvasState = {};

const MAX_CONNECTIONS_PER_IP = 5; // Max connections per IP
const MESSAGE_RATE_LIMIT = 2; // Max messages per second per IP
const MESSAGE_RATE_INTERVAL = 1000; // Time window in milliseconds
const MAX_PIXEL_UPDATES = 500; // Max pixels updated in one request

const ipConnections = new Map(); // { ip: { connectionCount, messageCount, lastRateCheck } }

// Static files
app.use(express.static('public'));

// REST API for initial canvas state
app.get('/canvas', (req, res) => {
    res.json({ canvasState });
});

// HTTP and WebSocket servers
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;

    if (!ipConnections.has(ip)) {
        ipConnections.set(ip, { connectionCount: 0, messageCount: 0, lastRateCheck: Date.now() });
    }

    const ipData = ipConnections.get(ip);

    // Enforce connection limits
    if (ipData.connectionCount >= MAX_CONNECTIONS_PER_IP) {
        ws.close(1008, 'Too many connections from this IP');
        return;
    }

    ipData.connectionCount += 1;

    ws.on('message', (message) => {
        try {
            const now = Date.now();

            // Rate-limit messages
            if (now - ipData.lastRateCheck > MESSAGE_RATE_INTERVAL) {
                ipData.lastRateCheck = now;
                ipData.messageCount = 0;
            }

            ipData.messageCount += 1;

            if (ipData.messageCount > MESSAGE_RATE_LIMIT) {
                ws.close(1008, 'Message rate limit exceeded');
                return;
            }

            const { type, data } = JSON.parse(message);

            if (type === 'updateCanvas') {
                const updates = Object.entries(data);

                if (updates.length > MAX_PIXEL_UPDATES) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Too many pixels updated at once' }));
                    return;
                }

                updates.forEach(([key, color]) => {
                    if (color === null) {
                        delete canvasState[key];
                    } else {
                        canvasState[key] = color;
                    }
                });

                wss.clients.forEach((client) => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'updateCanvas', data }));
                    }
                });
            } else if (type === 'chatMessage') {
                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'chatMessage', data }));
                    }
                });
            }
        } catch (err) {
            console.error('Error processing message:', err);
        }
    });

    ws.on('close', () => {
        ipData.connectionCount -= 1;
        if (ipData.connectionCount === 0) {
            ipConnections.delete(ip);
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
