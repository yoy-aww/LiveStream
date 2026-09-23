import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';

const app = express();
const server = http.createServer(app);

// 允许的跨域来源
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5174')
  .split(',')
  .map(s => s.trim());

// TURN 服务器配置（部署时填写，当前仅 STUN）
// const TURN_CONFIG = process.env.TURN_URL
//   ? { urls: process.env.TURN_URL, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL }
//   : undefined;

const io = new Server(server, {
  cors: { origin: ALLOWED_ORIGINS, methods: ['GET', 'POST'] },
});

app.use(cors({ origin: ALLOWED_ORIGINS }));
app.get('/api/room', (_req, res) => {
  res.json({
    streamer: room.streamer ? { nickname: room.streamer.nickname } : null,
    viewers: room.viewers.size,
    streaming: !!room.streamer,
  });
});

interface Room {
  streamer: { id: string; nickname: string; ready: boolean } | null;
  viewers: Map<string, string>; // socketId → nickname
  readyViewers: Set<string>; // 已就绪的观众 socketId（已创建 PC）
}
const room: Room = { streamer: null, viewers: new Map(), readyViewers: new Set() };

// 聊天频率限制：每个 socket 3 秒内最多 10 条
const RATE_LIMIT_WINDOW = 3000;
const RATE_LIMIT_MAX = 10;
const chatHistory = new Map<string, number[]>();

io.use((socket, next) => {
  const raw = socket.handshake.auth?.nickname as string | undefined;
  if (!raw || !raw.trim()) return next(new Error('缺少昵称'));
  // 只允许中文、字母、数字、下划线、连字符，1-16 字符
  const sanitized = raw.trim().slice(0, 16).replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '');
  if (!sanitized) return next(new Error('昵称无效'));
  socket.data.nickname = sanitized;
  next();
});

io.on('connection', (socket) => {
  const nickname = socket.data.nickname;
  console.log(`[+] ${nickname} (#${socket.id})`);

  // 进入房间
  socket.on('room:enter', () => {
    if (!room.streamer) {
      room.streamer = { id: socket.id, nickname, ready: false };
      socket.emit('room:assigned', { role: 'streamer', nickname });
      io.emit('room:state', { streamer: { nickname }, viewers: 0, streaming: true });
      console.log(`🎬 ${nickname} 开播`);
    } else {
      room.viewers.set(socket.id, nickname);
      socket.emit('room:assigned', {
        role: 'viewer', streamerNickname: room.streamer.nickname,
      });
      io.emit('room:state', {
        streamer: { nickname: room.streamer.nickname },
        viewers: room.viewers.size, streaming: true,
      });
      console.log(`👁 ${nickname} 加入 (${room.viewers.size})`);
      // 注意：不立即发 viewer:join，等观众发 viewer:ready 后再发
    }
  });

  // 主播就绪
  socket.on('streamer:ready', () => {
    if (room.streamer?.id !== socket.id) return;
    room.streamer.ready = true;
    console.log(`🎥 ${nickname} 就绪`);
    // 为所有已就绪的观众建连
    for (const viewerId of room.readyViewers) {
      io.to(socket.id).emit('viewer:join', viewerId);
    }
  });

  // 观众就绪（观众已创建 PC）
  socket.on('viewer:ready', () => {
    if (!room.viewers.has(socket.id)) return;
    room.readyViewers.add(socket.id);
    // 如果主播已就绪，立即通知主播建连
    if (room.streamer?.ready) {
      io.to(room.streamer.id).emit('viewer:join', socket.id);
    }
  });

  // 上墙
  socket.on('wall:send', (data: { content: string; emoji: string }) => {
    const now = Date.now();
    let history = chatHistory.get(socket.id) || [];
    history = history.filter(t => now - t < RATE_LIMIT_WINDOW);
    if (history.length >= RATE_LIMIT_MAX) {
      return socket.emit('chat:rateLimited');
    }
    history.push(now);
    chatHistory.set(socket.id, history);
    const msg = {
      id: `${socket.id}-${now}`,
      nickname,
      content: (data.content || '').slice(0, 50),
      emoji: (data.emoji || '❤️').slice(0, 2),
      timestamp: now,
    };
    io.emit('wall:new', msg);
  });

  // 聊天
  socket.on('chat:send', (data: { type: 'text' | 'image'; content: string }) => {
    const now = Date.now();
    let history = chatHistory.get(socket.id) || [];
    history = history.filter(t => now - t < RATE_LIMIT_WINDOW);
    if (history.length >= RATE_LIMIT_MAX) {
      return socket.emit('chat:rateLimited');
    }
    history.push(now);
    chatHistory.set(socket.id, history);
    io.emit('chat:new', {
      id: socket.id, nickname,
      type: data.type, content: data.content,
      timestamp: Date.now(),
    });
  });

  // WebRTC: 主播 → 观众（offer + ICE）
  socket.on('rtc:offer', (data: { viewerId: string; offer: any }) => {
    io.to(data.viewerId).emit('rtc:offer', { offer: data.offer });
  });
  socket.on('rtc:ice', (data: { viewerId: string; candidate: any }) => {
    io.to(data.viewerId).emit('rtc:ice', { candidate: data.candidate });
  });

  // WebRTC: 观众 → 主播（answer + ICE）
  socket.on('rtc:answer', (data: { answer: any }) => {
    if (room.streamer) {
      io.to(room.streamer.id).emit('rtc:answer', { answer: data.answer, viewerId: socket.id });
    }
  });
  socket.on('rtc:ice-answer', (data: { candidate: any }) => {
    if (room.streamer) {
      io.to(room.streamer.id).emit('rtc:ice-answer', {
        candidate: data.candidate, viewerId: socket.id,
      });
    }
  });

  // 断线
  socket.on('disconnect', () => {
    chatHistory.delete(socket.id);
    if (room.streamer?.id === socket.id) {
      console.log(`🏁 ${nickname} 离开`);
      room.streamer = null;
      room.readyViewers.clear();
      io.emit('streamer:left');
      io.emit('room:state', { streamer: null, viewers: 0, streaming: false });
      room.viewers.clear();
    } else if (room.viewers.has(socket.id)) {
      const nick = room.viewers.get(socket.id)!;
      room.viewers.delete(socket.id);
      room.readyViewers.delete(socket.id);
      console.log(`[-] ${nick} 离开 (${room.viewers.size})`);
      if (room.streamer) {
        io.to(room.streamer.id).emit('viewer:leave', socket.id);
        io.emit('room:state', {
          streamer: { nickname: room.streamer.nickname },
          viewers: room.viewers.size, streaming: true,
        });
      }
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`✅ http://localhost:${PORT}`);
});