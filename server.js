
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Initialize sandbox state
const gridSize = 500;
const sandbox = Array.from({ length: gridSize }, () =>
    Array(gridSize).fill(null)
);

// Store connected users and their usernames
const users = {};

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('set username', (username) => {
        users[socket.id] = username;
        io.emit('update users', Object.values(users)); // Broadcast updated user list
    });

    socket.on('chat message', ({ username, message }) => {
        io.emit('chat message', { username, message });
    });

    socket.on('update grid', ({ x, y, value }) => {
        if (sandbox[y] && sandbox[y][x] !== undefined) {
            sandbox[y][x] = value;
            io.emit('update grid', { x, y, value });
        }
    });

    socket.on('disconnect', () => {
        delete users[socket.id];
        io.emit('update users', Object.values(users)); // Update user list
    });
});

server.listen(3000, () => {
    console.log('Server listening on http://localhost:3000');
});
