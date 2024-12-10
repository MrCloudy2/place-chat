const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const messageRateLimit = 1; // Max messages per 5 seconds
const messageWindowMs = 3000; // Time window in milliseconds
const messageTimestamps = {}; // Store message timestamps per socket

app.use(express.static('public'));

// Initialize sandbox state and chat history
const gridSize = 500;
const sandbox = Array.from({ length: gridSize }, () =>
    Array(gridSize).fill(null)
);
const chatHistory = [];

// Store connected users and their usernames
const users = {};

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Send initial sandbox and chat data to the new user
    socket.emit('initialize sandbox', sandbox);
    socket.emit('initialize chat', chatHistory);

    // Handle username setting
    socket.on('set username', (username) => {
        users[socket.id] = username;
        io.emit('update users', Object.values(users)); // Broadcast updated user list
    });

    // Handle chat messages
    socket.on('chat message', ({ username, message }) => {
        const now = Date.now();
    
        if (!messageTimestamps[socket.id]) {
            messageTimestamps[socket.id] = [];
        }
    
        // Filter out timestamps outside the rate limit window
        messageTimestamps[socket.id] = messageTimestamps[socket.id].filter(
            (timestamp) => now - timestamp < messageWindowMs
        );
    
        if (messageTimestamps[socket.id].length < messageRateLimit) {
            const sanitizedMessage = message.replace(/[^\w\s.,!?'"()-]/g, '');
            messageTimestamps[socket.id].push(now);
    
            const timestamp = new Date().toISOString();
            const chatMessage = { username, message: sanitizedMessage, timestamp };
            chatHistory.push(chatMessage);
            io.emit('chat message', chatMessage); // Broadcast to all users
        } else {
            socket.emit('rate limit warning', 'You are sending messages too quickly!');
        }
    });

    // Handle sandbox updates
    socket.on('update grid', ({ x, y, value }) => {
        if (sandbox[y] && sandbox[y][x] !== undefined) {
            sandbox[y][x] = value;
            io.emit('update grid', { x, y, value }); // Broadcast to all users
        }
    });

    // Handle user disconnect
    socket.on('disconnect', () => {
        delete users[socket.id];
        io.emit('update users', Object.values(users)); // Update user list
    });
});



server.listen(3000, () => {
    console.log('Server listening on http://localhost:3000');
});

