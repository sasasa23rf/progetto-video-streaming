// CONFIG: set SERVER_URL on the page before this script if you host pages on Vercel
const SIGNALING_SERVER = window.SERVER_URL || location.origin;

(function loadSocketIo(cb) {
    const s = document.createElement('script');
    s.src = SIGNALING_SERVER + '/socket.io/socket.io.js';
    s.onload = cb;
    s.onerror = () => console.error('Failed to load socket.io client from', s.src);
    document.head.appendChild(s);
})(init);

function init() {
    const statusEl = document.getElementById('status');
    const videoElement = document.getElementById('remoteVideo');
    const socket = io(SIGNALING_SERVER);

    let pc = null;
    let remoteStream = null;

    function setStatus(t) { statusEl.textContent = 'Status: ' + t; }

    socket.on('connect', () => {
        setStatus('connected to signaling server (' + SIGNALING_SERVER + ')');
        socket.emit('register', 'viewer');
    });

    socket.on('no-streamer', () => {
        setStatus('No streamer currently available');
    });

    socket.on('offer', async ({ from, sdp }) => {
        setStatus('Received offer, creating answer');
        try {
            pc = new RTCPeerConnection();

            remoteStream = new MediaStream();
            videoElement.srcObject = remoteStream;

            pc.ontrack = (event) => {
                event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
            };

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('ice-candidate', { to: from, candidate: event.candidate });
                }
            };

            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            // send answer back to streamer
            socket.emit('answer', { to: from, sdp: pc.localDescription });
            setStatus('Answer sent');
        } catch (err) {
            console.error('Error handling offer:', err);
            setStatus('Error handling offer');
        }
    });

    socket.on('ice-candidate', async ({ from, candidate }) => {
        try {
            if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
            console.error('Error adding ICE candidate:', err);
        }
    });

    socket.on('streamer-stopped', () => {
        setStatus('Streamer stopped');
        if (pc) {
            pc.close();
            pc = null;
        }
        videoElement.srcObject = null;
    });
}
