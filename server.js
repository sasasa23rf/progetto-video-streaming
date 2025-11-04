const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Add Content Security Policy header to allow inline scripts during development
app.use((req, res, next) => {
    // Development-friendly CSP: allow self, inline scripts (unsafe-inline), inline styles, and websockets.
    // IMPORTANT: For production tighten this policy (remove 'unsafe-inline' and use nonces/hashes).
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss: http: https:");
    next();
});

// Serve static files (e.g., the streamer and viewer pages)
app.use(express.static('public'));

// Single-streamer handling
let streamerId = null;

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('register', (role) => {
        if (role === 'streamer') {
            if (streamerId && streamerId !== socket.id) {
                console.log('Rejected streamer (already exists):', socket.id);
                socket.emit('streamer-rejected', 'A streamer is already active');
                return;
            }
            streamerId = socket.id;
            console.log('Streamer registered:', streamerId);
            socket.emit('streamer-accepted');
        } else if (role === 'viewer') {
            console.log('Viewer registered:', socket.id);
            // notify current streamer that a viewer joined
            if (streamerId) {
                io.to(streamerId).emit('viewer-joined', { viewerId: socket.id });
            } else {
                socket.emit('no-streamer');
            }
        }
    });

    // Offer from streamer targeted to a viewer
    socket.on('offer', (payload) => {
        // payload: { to: viewerId, sdp }
        if (payload && payload.to) {
            io.to(payload.to).emit('offer', { from: socket.id, sdp: payload.sdp });
        }
    });

    // Answer from viewer targeted to streamer
    socket.on('answer', (payload) => {
        // payload: { to: streamerId, sdp }
        if (payload && payload.to) {
            io.to(payload.to).emit('answer', { from: socket.id, sdp: payload.sdp });
        }
    });

    // ICE candidates (include target)
    socket.on('ice-candidate', (payload) => {
        // payload: { to: targetId, candidate }
        if (payload && payload.to) {
            io.to(payload.to).emit('ice-candidate', { from: socket.id, candidate: payload.candidate });
        }
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected:', socket.id);
        if (socket.id === streamerId) {
            // streamer left
            streamerId = null;
            // notify all viewers that streamer stopped
            io.emit('streamer-stopped');
            console.log('Streamer stopped');
        } else {
            // notify streamer that a viewer left
            if (streamerId) io.to(streamerId).emit('viewer-left', { viewerId: socket.id });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
