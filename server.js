const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const PORT = 3000;

// Canvas state as a sparse matrix
let canvasState = {};

const MAX_CONNECTIONS_PER_IP = 5; // Max connections per IP
const CHAT_RATE_LIMIT = 3; // Max chat messages per 5 seconds
const CHAT_RATE_INTERVAL = 5000; // 5 seconds window for chat rate limit
const MAX_CHAT_LENGTH = 50; // Max length for chat messages
const MAX_PIXEL_UPDATES = 99999999999999; // Max pixels updated in one request

const ipConnections = new Map(); // { ip: { connectionCount, chatRateData } }

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
        ipConnections.set(ip, { connectionCount: 0, chatRateData: { lastCheck: Date.now(), messageCount: 0 } });
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
            const { type, data } = JSON.parse(message);

            if (type === 'updateCanvas') {
                // Handle canvas updates (no rate limiting here)
                const updates = Object.entries(data);

             //   if (updates.length > MAX_PIXEL_UPDATES) {
              //      ws.send(JSON.stringify({ type: 'error', message: 'Too many pixels updated at once' }));
              //      return;
             //   }

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
                // Validate chat message length
                if (data.length > MAX_CHAT_LENGTH) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Chat message too long (max 50 characters)' }));
                    return;
                }

                // Handle chat messages with rate limiting
                const now = Date.now();
                const chatRateData = ipData.chatRateData;

                if (now - chatRateData.lastCheck > CHAT_RATE_INTERVAL) {
                    // Reset the rate limiter for the new window
                    chatRateData.lastCheck = now;
                    chatRateData.messageCount = 0;
                }

                if (chatRateData.messageCount >= CHAT_RATE_LIMIT) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Chat rate limit exceeded' }));
                    return;
                }

                chatRateData.messageCount += 1;

                // Broadcast the chat message
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
