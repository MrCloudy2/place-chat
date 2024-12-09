const socket = io();

// Chat Logic
let username = '';

while (!username) {
    username = prompt('Enter a username:');
}

socket.emit('set username', username);

const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const messages = document.getElementById('messages');
const userList = document.getElementById('user-list');

chatForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const message = messageInput.value.trim();
    if (message) {
        const sanitizedMessage = message.replace(/[^\w\s.,!?'"()-]/g, '');
        socket.emit('chat message', { username, message: sanitizedMessage });
        messageInput.value = '';
    }
});

socket.on('chat message', ({ username, message }) => {
    const li = document.createElement('li');
    li.textContent = `${username}: ${message}`;
    messages.appendChild(li);
    messages.scrollTop = messages.scrollHeight;
});

socket.on('update users', (users) => {
    userList.innerHTML = '';
    users.forEach((user) => {
        const li = document.createElement('li');
        li.textContent = user;
        userList.appendChild(li);
    });
});

// Sandbox Logic
const canvas = document.getElementById('sandbox');
const ctx = canvas.getContext('2d');

canvas.width = 2000;
canvas.height = 2000;

// Tools and State
let currentTool = 'add-dirt';
let currentColor = '#8B4513';
let zoomLevel = 1;
let offsetX = 0;
let offsetY = 0;

const gridSize = 4;
const sandbox = Array.from({ length: canvas.height / gridSize }, () =>
    Array(canvas.width / gridSize).fill(null)
);

document.getElementById('add-dirt').onclick = () => (currentTool = 'add-dirt');
document.getElementById('remove-dirt').onclick = () => (currentTool = 'remove-dirt');

const colorPicker = document.getElementById('color-picker');
colorPicker.addEventListener('input', (event) => {
    currentColor = event.target.value;
});

function screenToSandbox(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const sandboxX = (clientX - rect.left) / zoomLevel - offsetX;
    const sandboxY = (clientY - rect.top) / zoomLevel - offsetY;
    return { x: Math.floor(sandboxX / gridSize), y: Math.floor(sandboxY / gridSize) };
}

function constrainOffset() {
    const maxOffsetX = -(canvas.width / gridSize) / zoomLevel + canvas.width / gridSize;
    const maxOffsetY = -(canvas.height / gridSize) / zoomLevel + canvas.height / gridSize;

    offsetX = Math.min(Math.max(offsetX, maxOffsetX), 0);
    offsetY = Math.min(Math.max(offsetY, maxOffsetY), 0);
}

canvas.addEventListener('wheel', (event) => {
    event.preventDefault();

    const zoomFactor = 0.1;
    const rect = canvas.getBoundingClientRect();

    const pointerX = (event.clientX - rect.left) / zoomLevel;
    const pointerY = (event.clientY - rect.top) / zoomLevel;

    const oldZoomLevel = zoomLevel;

    if (event.deltaY < 0) {
        zoomLevel = Math.min(zoomLevel + zoomFactor, 5);
    } else {
        zoomLevel = Math.max(zoomLevel - zoomFactor, 0.5);
    }

    offsetX -= pointerX * (1 / oldZoomLevel - 1 / zoomLevel);
    offsetY -= pointerY * (1 / oldZoomLevel - 1 / zoomLevel);

    constrainOffset();
    drawSandbox();
});

canvas.addEventListener('mousedown', (event) => {
    const { x, y } = screenToSandbox(event.clientX, event.clientY);

    if (x >= 0 && y >= 0 && x < sandbox[0].length && y < sandbox.length) {
        if (currentTool === 'add-dirt') {
            sandbox[y][x] = currentColor;
            socket.emit('update grid', { x, y, value: currentColor });
        } else if (currentTool === 'remove-dirt') {
            sandbox[y][x] = null;
            socket.emit('update grid', { x, y, value: null });
        }
    }

    drawSandbox();
});

function drawSandbox() {
    ctx.fillStyle = '#A9A9A9'; // White background
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.scale(zoomLevel, zoomLevel);
    ctx.translate(offsetX, offsetY);

    sandbox.forEach((row, y) => {
        row.forEach((cell, x) => {
            if (cell) {
                ctx.fillStyle = cell;
                ctx.fillRect(x * gridSize, y * gridSize, gridSize, gridSize);
            }
        });
    });

    ctx.restore();
}

socket.on('initialize sandbox', (serverSandbox) => {
    serverSandbox.forEach((row, y) => {
        row.forEach((cell, x) => {
            sandbox[y][x] = cell;
        });
    });
    drawSandbox();
});

socket.on('update grid', ({ x, y, value }) => {
    sandbox[y][x] = value;
    drawSandbox();
});

drawSandbox();
