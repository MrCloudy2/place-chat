const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d');
const colorPicker = document.getElementById('colorPicker');
const selectedColorDisplay = document.getElementById('selectedColor');
const eraserButton = document.getElementById('eraserButton');
const chatInput = document.getElementById('chatInput');
const messages = document.getElementById('messages');
const socket = new WebSocket(`ws://${location.host}`);

const PIXEL_SIZE = 5; // Size of each pixel
const UPDATE_INTERVAL = 500; // 0.5 seconds for batched updates
const CHAT_COOLDOWN = 2000; // 5 seconds cooldown for chat messages
let drawing = false;
let color = '#000000';
let lastPos = null;
let localCanvasState = {}; // Track local updates
let canSendMessage = true;

const BACKGROUND_COLOR = '#f4e2c0'; // Sand-colored background

canvas.width = window.innerWidth;
canvas.height = window.innerHeight - 10; // Reserve space for toolbar
ctx.fillStyle = BACKGROUND_COLOR;
ctx.fillRect(0, 0, canvas.width, canvas.height);

// Fetch initial canvas state
fetch('/canvas').then((res) => res.json()).then(({ canvasState }) => {
    Object.entries(canvasState).forEach(([key, color]) => {
        const [x, y] = key.split('-').map(Number);
        drawPixel(x, y, color, false); // Apply initial state
    });
});

// Sync color picker with selected color
colorPicker.addEventListener('input', () => {
    color = colorPicker.value;
    selectedColorDisplay.style.backgroundColor = color;
});

// Handle eraser button functionality
eraserButton.addEventListener('click', () => {
    color = BACKGROUND_COLOR; // Set drawing color to sand color
    selectedColorDisplay.style.backgroundColor = BACKGROUND_COLOR;
});


// Start and stop drawing
canvas.addEventListener('mousedown', (e) => {
    drawing = true;
    lastPos = getCanvasCoords(e);
    drawPixel(lastPos.x, lastPos.y, color);
});

canvas.addEventListener('mouseup', () => (drawing = false));

// Handle drawing on the canvas
canvas.addEventListener('mousemove', (e) => {
    if (!drawing) return;
    const newPos = getCanvasCoords(e);
    drawLine(lastPos, newPos, color);
    lastPos = newPos;
});

// Draw a line using Bresenham's Line Algorithm
function drawLine(start, end, color) {
    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);
    const sx = start.x < end.x ? 1 : -1;
    const sy = start.y < end.y ? 1 : -1;
    let err = dx - dy;

    let x = start.x;
    let y = start.y;

    while (true) {
        drawPixel(x, y, color);
        if (x === end.x && y === end.y) break;
        const e2 = 2 * err;
        if (e2 > -dy) {
            err -= dy;
            x += sx;
        }
        if (e2 < dx) {
            err += dx;
            y += sy;
        }
    }
}

// Draw a single pixel
function drawPixel(x, y, color, updateState = true) {
    const pixelColor = color || BACKGROUND_COLOR;
    ctx.fillStyle = pixelColor;
    ctx.fillRect(x * PIXEL_SIZE, y * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);

    if (updateState) {
        const key = `${x}-${y}`;
        if (color === null) {
            delete localCanvasState[key]; // Mark pixel for deletion
        } else {
            localCanvasState[key] = color; // Update pixel color
        }
    }
}

// Get canvas coordinates from mouse event
function getCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / PIXEL_SIZE);
    const y = Math.floor((e.clientY - rect.top) / PIXEL_SIZE);
    return { x, y };
}

// Send local updates to the server periodically
setInterval(() => {
    if (Object.keys(localCanvasState).length > 0) {
        socket.send(JSON.stringify({ type: 'updateCanvas', data: localCanvasState }));
        localCanvasState = {}; // Clear local state after sending
    }
}, UPDATE_INTERVAL);

// Apply updates from other users
socket.addEventListener('message', (event) => {
    const { type, data } = JSON.parse(event.data);

    if (type === 'updateCanvas') {
        Object.entries(data).forEach(([key, color]) => {
            const [x, y] = key.split('-').map(Number);
            drawPixel(x, y, color, false); // Apply updates without modifying local state
        });
    }

    if (type === 'chatMessage') {
        const messageElem = document.createElement('div');
        messageElem.textContent = data;
        messages.appendChild(messageElem);
        messages.scrollTop = messages.scrollHeight;
    }
});

// Handle chat input with cooldown
chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && canSendMessage) {
        const message = chatInput.value.trim();
        if (message) {
            socket.send(JSON.stringify({ type: 'chatMessage', data: message }));
            chatInput.value = '';
            canSendMessage = false;
            setTimeout(() => (canSendMessage = true), CHAT_COOLDOWN); // Enforce cooldown
        }
    }
});
