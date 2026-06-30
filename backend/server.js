import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
app.use('/uploads', express.static(UPLOADS_DIR));

const activeRooms = new Map(); // roomCode -> { peerIdA, peerIdB, clipboard: [], auditLogs: [], comments: {} }
const filesMetadata = new Map();

app.post('/api/files/metadata', (req, res) => {
  const { fileId, fileName, fileSize, fileType, chunksCount } = req.body;
  if (!fileId || !fileName) {
    return res.status(400).json({ error: 'Missing metadata' });
  }
  const metadata = {
    fileId,
    fileName,
    fileSize,
    fileType,
    chunksCount,
    uploadedChunks: 0,
    status: 'pending',
    createdAt: new Date()
  };
  filesMetadata.set(fileId, metadata);
  res.json({ success: true, metadata });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Create pairing / collaborative workspace
  socket.on('create-room', (callback) => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    activeRooms.set(code, {
      peerIdA: socket.id,
      peerIdB: null,
      clipboard: [],
      auditLogs: [`Workspace initialized by owner (${socket.id.substring(0,4)})`],
      comments: {}
    });
    socket.join(code);
    callback({ code });
  });

  // Join collaborative workspace / pairing session
  socket.on('join-room', (code, callback) => {
    const room = activeRooms.get(code);
    if (!room) {
      return callback({ error: 'Session not found' });
    }
    if (room.peerIdB && room.peerIdB !== socket.id) {
      // For shared workspaces, we can relax P2P two-device limits for room membership
      // but let's assign the secondary slot or just keep it simple
    }
    room.peerIdB = socket.id;
    socket.join(code);
    room.auditLogs.push(`Member joined session (${socket.id.substring(0,4)})`);
    
    io.to(room.peerIdA).emit('peer-connected', { peerId: socket.id });
    io.to(code).emit('workspace-logs', room.auditLogs);
    callback({ success: true, logs: room.auditLogs });
  });

  // Real-time Universal Clipboard synchronization
  socket.on('sync-clipboard', ({ roomCode, content }) => {
    const room = activeRooms.get(roomCode);
    if (room) {
      const item = {
        id: Math.random().toString(36).substring(2, 9),
        content,
        timestamp: new Date().toLocaleTimeString(),
        sender: socket.id.substring(0, 4)
      };
      room.clipboard.unshift(item);
      if (room.clipboard.length > 100) room.clipboard.pop(); // keep last 100
      room.auditLogs.push(`Clipboard sync updated by ${socket.id.substring(0,4)}`);
      io.to(roomCode).emit('clipboard-updated', room.clipboard);
      io.to(roomCode).emit('workspace-logs', room.auditLogs);
    }
  });

  // Real-time Collaborative Comments on shared files
  socket.on('submit-comment', ({ roomCode, fileId, text }) => {
    const room = activeRooms.get(roomCode);
    if (room) {
      if (!room.comments[fileId]) room.comments[fileId] = [];
      const newComment = {
        id: Math.random().toString(36).substring(2, 9),
        text,
        sender: socket.id.substring(0, 4),
        time: new Date().toLocaleTimeString()
      };
      room.comments[fileId].push(newComment);
      room.auditLogs.push(`Comment added on file ${fileId.substring(0,4)}`);
      io.to(roomCode).emit('comments-updated', { fileId, comments: room.comments[fileId] });
      io.to(roomCode).emit('workspace-logs', room.auditLogs);
    }
  });

  // WebRTC Signal Passing
  socket.on('signal', ({ targetId, signal }) => {
    io.to(targetId).emit('signal', { senderId: socket.id, signal });
  });

  socket.on('disconnect', () => {
    for (const [code, room] of activeRooms.entries()) {
      if (room.peerIdA === socket.id || room.peerIdB === socket.id) {
        const otherPeer = room.peerIdA === socket.id ? room.peerIdB : room.peerIdA;
        if (otherPeer) {
          io.to(otherPeer).emit('peer-disconnected');
        }
        activeRooms.delete(code);
      }
    }
  });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`ShareSync backend running on port ${PORT}`);
});
