# LiveStream 项目修复计划

## Goal
修复 WebRTC 直播项目的阻塞性 Bug（P0）、安全隐患（P1）、体验缺陷（P2）、架构问题（P3），每项修复独立提交。

## 执行顺序

| # | 优先级 | 问题 | 文件 | Commit message |
|---|--------|------|------|----------------|
| 1 | P0 | `startStreaming` 可重复调用导致资源泄漏 | `client/src/App.tsx` | `fix: prevent startStreaming double-call` |
| 2 | P0 | `ontrack` 丢失音频（Safari 等多 stream 浏览器） | `client/src/App.tsx` | `fix: handle multiple media tracks in ontrack` |
| 3 | P0 | 缺少 TURN 配置占位（对称 NAT 无法打洞） | `client/src/App.tsx`, `server/.env.example` | `chore: add TURN server config with docs` |
| 4 | P1 | CORS 全开 `origin: '*'` | `server/src/index.ts` | `fix: restrict CORS to trusted origins` |
| 5 | P1 | 昵称无过滤 | `server/src/index.ts` | `fix: sanitize nickname on auth` |
| 6 | P1 | 聊天无频率限制 | `server/src/index.ts` | `fix: add chat rate limiting` |
| 7 | P1 | 图片 base64 广播到所有观众 | `client/src/components/ChatPanel.tsx` | `fix: use object URL instead of base64 for images` |
| 8 | P2 | 聊天消息无限增长 | `client/src/App.tsx` | `fix: cap chat messages to 200` |
| 9 | P2 | 用 `getElementById` 替代 React ref | `client/src/App.tsx` | `refactor: replace getElementById with useRef` |
| 10 | P2 | VideoArea 用 setInterval 轮询 srcObject | `client/src/components/VideoArea.tsx` | `refactor: replace polling with event listener` |
| 11 | P2 | 缺少连接状态指示 | `client/src/App.tsx`, `client/src/components/VideoArea.tsx` | `feat: add connection status indicator` |
| 12 | P3 | WebRTC 信令用 `any` 类型 | `client/src/types.ts`, `client/src/App.tsx` | `chore: add WebRTC signaling types` |
| 13 | P3 | 移除未使用的 PeerInfo 类型 | `client/src/types.ts` | `chore: remove unused PeerInfo type` |
| 14 | P3 | 无环境配置 | `client/.env.example`, `client/src/App.tsx` | `chore: add env config for server URL and ICE` |

---

## Task 1: 修复 `startStreaming` 重复调用

**问题**：主播端 `startStreaming` 没有防重入保护。每次点击都重新 `getUserMedia()`，旧的 stream 不停止，重复 emit `streamer:ready`。

**文件**：`client/src/App.tsx`

**改动**：添加 `streamerReadyRef` 防重入 + 重复调用时复用已有 stream。

```diff
 // 共享 ref
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  // 观众用
  const pcRef = useRef<RTCPeerConnection | null>(null);
+ const streamerReadyRef = useRef(false);
```

```diff
  const startStreaming = useCallback(async () => {
    if (!socket || role !== 'streamer') return;
+   if (streamerReadyRef.current) {
+     addToast('已经在直播中');
+     return;
+   }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      localStreamRef.current = stream;

      const selfVideo = document.getElementById('selfVideo') as HTMLVideoElement;
      if (selfVideo) selfVideo.srcObject = stream;

+     streamerReadyRef.current = true;
      socket.emit('streamer:ready');
      addToast('直播已就绪');
    } catch (err: any) {
      addToast(`无法访问摄像头/麦克风: ${err.message}`);
    }
  }, [socket, role, addToast]);
```

```diff
  const stopStreaming = useCallback(() => {
    if (!socket || role !== 'streamer') return;
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
+   streamerReadyRef.current = false;
    socket.disconnect();
    setSocket(null);
    setRole(null);
    addToast('直播已停止');
  }, [socket, role, addToast]);
```

**验证**：
```bash
cd C:/yoyac-work/LiveStream/client
npx vite build 2>&1 | tail -3
# 期望：✓ built in X.XXs（无报错）
```

**提交**：
```bash
cd C:/yoyac-work/LiveStream && git add client/src/App.tsx && git commit -m "fix: prevent startStreaming double-call"
```

---

## Task 2: 修复 `ontrack` 丢失音频

**问题**：当前 `ontrack` 直接赋值 `video.srcObject = event.streams[0]`，如果 Safari 等浏览器将 audio 和 video 放在不同 stream 中，第二个 track 会覆盖第一个。

**文件**：`client/src/App.tsx`

**改动**：合并所有 track 到一个 stream。

```diff
-     // 收到媒体轨道 → 播放
-     pc.ontrack = (event) => {
-       const video = document.getElementById('remoteVideo') as HTMLVideoElement;
-       if (video && video.srcObject !== event.streams[0]) {
-         video.srcObject = event.streams[0];
-         video.play().catch(() => {});
-       }
-     };
+     // 收到媒体轨道 → 合并到同一个 stream 播放
+     const remoteStreams: MediaStream[] = [];
+     pc.ontrack = (event: RTCTrackEvent) => {
+       let stream = event.streams[0];
+       if (!stream) return;
+       // 合并所有收到的 stream
+       let combined = remoteStreams[0];
+       if (!combined) {
+         combined = new MediaStream();
+         remoteStreams.push(combined);
+       }
+       event.track.addEventListener('ended', () => {
+         combined!.removeTrack(event.track);
+       });
+       combined.addTrack(event.track);
+
+       const video = document.getElementById('remoteVideo') as HTMLVideoElement;
+       if (video && video.srcObject !== combined) {
+         video.srcObject = combined;
+         video.play().catch(() => {});
+       }
+     };
```

**验证**：
```bash
cd C:/yoyac-work/LiveStream/client
npx vite build 2>&1 | tail -3
# 期望：✓ built in X.XXs
```

**提交**：
```bash
cd C:/yoyac-work/LiveStream && git add client/src/App.tsx && git commit -m "fix: handle multiple media tracks in ontrack"
```

---

## Task 3: 添加 TURN 服务器配置占位

**问题**：只有 STUN，对称型 NAT（约 30% 家庭网络）打洞必失败。

**文件**：`client/src/App.tsx`, `server/.env.example`

**改动**：将 ICE_SERVERS 改为从配置读取，添加 .env 示例文件。

`client/src/App.tsx`：
```diff
- const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
+ // ICE 服务器配置 — 部署时填入 TURN 凭据
+ // TURN 服务器推荐用 coturn 自建：https://github.com/coturn/coturn
+ // 示例：
+ // const ICE_SERVERS = [
+ //   { urls: 'stun:stun.l.google.com:19302' },
+ //   { urls: 'turn:turn.yourdomain.com', username: 'user', credential: 'pass' },
+ // ];
+ const ICE_SERVERS: RTCIceServer[] = [
+   { urls: 'stun:stun.l.google.com:19302' },
+ ];
```

`server/.env.example`（新建）：
```
# 服务器端口
PORT=5000

# 允许的跨域来源（逗号分隔）
ALLOWED_ORIGINS=http://localhost:5174

# TURN 服务器配置（部署时填写）
# TURN_URL=turn:your-turn-server.com
# TURN_USERNAME=your-username
# TURN_CREDENTIAL=your-password
```

**验证**：
```bash
cd C:/yoyac-work/LiveStream/client
npx vite build 2>&1 | tail -3
```

**提交**：
```bash
cd C:/yoyac-work/LiveStream && git add client/src/App.tsx server/.env.example && git commit -m "chore: add TURN server config with docs"
```

---

## Task 4: 限制 CORS 来源

**问题**：`origin: '*'` 允许任何网站连接。

**文件**：`server/src/index.ts`

**改动**：从环境变量读取允许的来源。

```diff
- import http from 'http';
- import express from 'express';
- import cors from 'cors';
- import { Server } from 'socket.io';
+ import http from 'http';
+ import express from 'express';
+ import cors from 'cors';
+ import { Server } from 'socket.io';
+
+ // 允许的跨域来源
+ const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5174')
+   .split(',')
+   .map(s => s.trim());

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
-   cors: { origin: '*', methods: ['GET', 'POST'] },
+   cors: { origin: ALLOWED_ORIGINS, methods: ['GET', 'POST'] },
  });

- app.use(cors());
+ app.use(cors({ origin: ALLOWED_ORIGINS }));
```

**验证**：
```bash
cd C:/yoyac-work/LiveStream/server
npx tsx src/index.ts 2>&1 | head -3
# 期望：✅ http://localhost:5000（无 CORS 错误）
```

**提交**：
```bash
cd C:/yoyac-work/LiveStream && git add server/src/index.ts && git commit -m "fix: restrict CORS to trusted origins"
```

---

## Task 5: 昵称过滤

**问题**：昵称无过滤，可包含 emoji、控制字符、HTML 实体。

**文件**：`server/src/index.ts`

**改动**：添加 sanitizeNickname 函数。

```diff
  io.use((socket, next) => {
-   const nickname = socket.handshake.auth?.nickname as string | undefined;
-   if (!nickname || !nickname.trim()) return next(new Error('缺少昵称'));
-   socket.data.nickname = nickname.trim();
+   const raw = socket.handshake.auth?.nickname as string | undefined;
+   if (!raw || !raw.trim()) return next(new Error('缺少昵称'));
+   // 只允许中文、字母、数字、下划线、连字符，1-16 字符
+   const sanitized = raw.trim().slice(0, 16).replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '');
+   if (!sanitized) return next(new Error('昵称无效'));
+   socket.data.nickname = sanitized;
    next();
  });
```

**验证**：
```bash
cd C:/yoyac-work/LiveStream/server
npx tsx src/index.ts 2>&1 | head -3
# 期望：✅ http://localhost:5000
```

**提交**：
```bash
cd C:/yoyac-work/LiveStream && git add server/src/index.ts && git commit -m "fix: sanitize nickname on auth"
```

---

## Task 6: 聊天频率限制

**问题**：无任何限制，每秒可发 100+ 条。

**文件**：`server/src/index.ts`

**改动**：用 Map 记录每个 socket 的发送时间戳，3 秒内最多 10 条。

```diff
  interface Room {
    streamer: { id: string; nickname: string; ready: boolean } | null;
    viewers: Map<string, string>;
    readyViewers: Set<string>;
  }
  const room: Room = { streamer: null, viewers: new Map(), readyViewers: new Set() };
+
+ // 聊天频率限制：每个 socket 3 秒内最多 10 条
+ const RATE_LIMIT_WINDOW = 3000; // 3 秒
+ const RATE_LIMIT_MAX = 10;
+ const chatHistory = new Map<string, number[]>();

  // 聊天
  socket.on('chat:send', (data: { type: 'text' | 'image'; content: string }) => {
+   const now = Date.now();
+   let history = chatHistory.get(socket.id) || [];
+   history = history.filter(t => now - t < RATE_LIMIT_WINDOW);
+   if (history.length >= RATE_LIMIT_MAX) {
+     return socket.emit('chat:rateLimited');
+   }
+   history.push(now);
+   chatHistory.set(socket.id, history);
    io.emit('chat:new', {
      id: socket.id, nickname,
      type: data.type, content: data.content,
      timestamp: Date.now(),
    });
  });
```

```diff
  // 断线
  socket.on('disconnect', () => {
+   chatHistory.delete(socket.id);
    if (room.streamer?.id === socket.id) {
```

**验证**：
```bash
cd C:/yoyac-work/LiveStream/server
npx tsx src/index.ts 2>&1 | head -3
```

**提交**：
```bash
cd C:/yoyac-work/LiveStream && git add server/src/index.ts && git commit -m "fix: add chat rate limiting"
```

---

## Task 7: 图片发送改用 Object URL

**问题**：base64 数据通过 Socket.IO 广播到所有观众，一张 5MB 图片 → ~7MB 消息 × N 观众。

**文件**：`client/src/components/ChatPanel.tsx`

**改动**：发送端用 `URL.createObjectURL` 生成短 URL（仅本地），接收端无法跨客户端使用——这意味着图片功能需要后端存储。但作为最小修复，改为发送文件名 + 小尺寸缩略图 base64（限制 200KB）。

```diff
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
-   const reader = new FileReader();
-   reader.onload = () => onSendImage(reader.result as string);
-   reader.readAsDataURL(file);
+   // 限制文件大小 200KB
+   if (file.size > 200 * 1024) {
+     alert('图片超过 200KB，请压缩后发送');
+     e.target.value = '';
+     return;
+   }
+   const reader = new FileReader();
+   reader.onload = () => onSendImage(reader.result as string);
+   reader.readAsDataURL(file);
    e.target.value = '';
  };
```

**验证**：
```bash
cd C:/yoyac-work/LiveStream/client
npx vite build 2>&1 | tail -3
```

**提交**：
```bash
cd C:/yoyac-work/LiveStream && git add client/src/components/ChatPanel.tsx && git commit -m "fix: limit image size to 200KB in chat"
```

---

## Task 8: 限制聊天消息数量

**问题**：`chatMessages` 数组无限增长，1 小时直播可能 10000+ 条，每次新消息触发全量重渲染。

**文件**：`client/src/App.tsx`

**改动**：只保留最近 200 条。

```diff
-     s.on('chat:new', (msg: ChatMessage) => setChatMessages((p) => [...p, msg]));
+     s.on('chat:new', (msg: ChatMessage) => setChatMessages((p) => [...p, msg].slice(-200)));
```

**验证**：
```bash
cd C:/yoyac-work/LiveStream/client
npx vite build 2>&1 | tail -3
```

**提交**：
```bash
cd C:/yoyac-work/LiveStream && git add client/src/App.tsx && git commit -m "fix: cap chat messages to 200"
```

---

## Task 9: 替换 `getElementById` 为 React ref

**问题**：`App.tsx` 用 `document.getElementById` 访问 `selfVideo`，不保证元素已渲染。

**文件**：`client/src/App.tsx`

**改动**：将 `selfVideo` 和 `remoteVideo` 的 ref 通过 prop 传递，或直接在 `VideoArea` 内部管理。由于 ref 需要在 App 层的 `startStreaming` 中使用，最简单的方式是通过 `LiveRoom` 传递。

```diff
  // 主播用
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
+ const selfVideoRef = useRef<HTMLVideoElement>(null);
  // 观众用
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamerReadyRef = useRef(false);
```

```diff
       localStreamRef.current = stream;

-      const selfVideo = document.getElementById('selfVideo') as HTMLVideoElement;
-      if (selfVideo) selfVideo.srcObject = stream;
+      if (selfVideoRef.current) selfVideoRef.current.srcObject = stream;
```

然后在 `LiveRoom` 中传递：

```diff
-     <VideoArea role={props.role} />
+     <VideoArea role={props.role} selfVideoRef={props.selfVideoRef} />
```

`client/src/components/VideoArea.tsx`：
```diff
  interface Props {
    role: Role;
+   selfVideoRef?: React.RefObject<HTMLVideoElement>;
  }

- export default function VideoArea({ role }: Props) {
+ export default function VideoArea({ role, selfVideoRef: externalRef }: Props) {
    const [hasStream, setHasStream] = useState(false);
-   const videoRef = useRef<HTMLVideoElement>(null);
-   const selfVideoRef = useRef<HTMLVideoElement>(null);
+   const remoteVideoRef = useRef<HTMLVideoElement>(null);
+   const selfVideoRef = useRef<HTMLVideoElement>(null);
```

```diff
-   const check = () => {
-     if (video.srcObject) {
-       setHasStream(true);
-       clearInterval(timer);
-     }
-   };
-   timer = setInterval(check, 200);
-   check();
+   // 使用 loadedmetadata 事件替代轮询
+   video.addEventListener('loadedmetadata', () => {
+     setHasStream(true);
+   });
+   if (video.srcObject) setHasStream(true);
```

```diff
-         <video ref={videoRef} id="remoteVideo" className="video-main" autoPlay playsInline />
+         <video ref={remoteVideoRef} id="remoteVideo" className="video-main" autoPlay playsInline />
```

```diff
-         <video ref={selfVideoRef} id="selfVideo" autoPlay playsInline muted />
+         <video ref={externalRef ?? selfVideoRef} id="selfVideo" autoPlay playsInline muted />
```

**验证**：
```bash
cd C:/yoyac-work/LiveStream/client
npx vite build 2>&1 | tail -3
```

**提交**：
```bash
cd C:/yoyac-work/LiveStream && git add client/src/App.tsx client/src/components/LiveRoom.tsx client/src/components/VideoArea.tsx && git commit -m "refactor: replace getElementById with useRef"
```

---

## Task 10: 替换 setInterval 轮询

**问题**：`VideoArea.tsx` 用 `setInterval(check, 200)` 每 200ms 检查 `srcObject`。

**文件**：`client/src/components/VideoArea.tsx`

**改动**：用 `loadedmetadata` 事件。

```diff
-     let timer: ReturnType<typeof setInterval>;
-     const check = () => {
-       if (video.srcObject) {
-         setHasStream(true);
-         clearInterval(timer);
-       }
-     };
-     timer = setInterval(check, 200);
-     check();
-
-     return () => clearInterval(timer);
+     video.addEventListener('loadedmetadata', () => setHasStream(true));
+     if (video.srcObject) setHasStream(true);
+     return () => video.removeEventListener('loadedmetadata', () => {});
```

（注意：Task 9 和 Task 10 会同时修改 VideoArea.tsx，实际实现时合并为一个提交。）

**提交**（合并到 Task 9）：
```bash
# 此任务并入 Task 9 的提交
```

---

## Task 11: 添加连接状态指示

**问题**：观众端只显示"正在等待"，但 WebRTC 可能已失败。

**文件**：`client/src/App.tsx`, `client/src/components/VideoArea.tsx`

**改动**：添加 `connectionStatus` state，通过 PC 的 `connectionState` 变化更新。

`client/src/types.ts`：
```diff
  export type Role = 'streamer' | 'viewer' | null;
+ export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'failed' | 'disconnected';
```

`client/src/App.tsx`：
```diff
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
+ const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
```

观众端 useEffect 中：
```diff
      // 收到媒体轨道 → 播放
      const remoteStreams: MediaStream[] = [];
      pc.ontrack = (event: RTCTrackEvent) => {
+       setConnectionStatus('connected');
        // ...
      };
+     pc.onconnectionstatechange = () => {
+       switch (pc.connectionState) {
+         case 'new':
+           setConnectionStatus('connecting');
+           break;
+         case 'connected':
+           setConnectionStatus('connected');
+           break;
+         case 'failed':
+         case 'disconnected':
+           setConnectionStatus('failed');
+           addToast('连接失败，请重试');
+           break;
+       }
+     };
```

将 `connectionStatus` 传给 `VideoArea`：
```diff
-     <VideoArea role={role} />
+     <VideoArea role={role} connectionStatus={connectionStatus} selfVideoRef={selfVideoRef} />
```

`VideoArea.tsx` placeholder 文案根据状态变化：
```diff
-           <p>{hasStream ? '' : '正在等待主播开播...'}</p>
+           <p>{hasStream ? '' : connectionStatus === 'failed' ? '连接失败，请刷新重试' : '正在等待主播开播...'}</p>
```

**验证**：
```bash
cd C:/yoyac-work/LiveStream/client
npx vite build 2>&1 | tail -3
```

**提交**：
```bash
cd C:/yoyac-work/LiveStream && git add client/src/types.ts client/src/App.tsx client/src/components/VideoArea.tsx && git commit -m "feat: add connection status indicator"
```

---

## Task 12: 添加 WebRTC 信令类型

**问题**：所有信令数据用 `any` 类型，失去类型检查。

**文件**：`client/src/types.ts`, `client/src/App.tsx`

**改动**：在 `types.ts` 中添加类型。

```diff
  export type Role = 'streamer' | 'viewer' | null;
+ export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'failed' | 'disconnected';
+
+ // ── WebRTC 信令类型 ──
+ export interface OfferPayload {
+   viewerId: string;
+   offer: RTCSessionDescriptionInit;
+ }
+ export interface AnswerPayload {
+   viewerId: string;
+   answer: RTCSessionDescriptionInit;
+ }
+ export interface IceCandidatePayload {
+   viewerId: string;
+   candidate: RTCIceCandidateInit;
+ }
+ export interface IceAnswerPayload {
+   candidate: RTCIceCandidateInit;
+ }
```

`App.tsx` 中使用：
```diff
-     socket.on('rtc:offer', async (data: { offer: any }) => {
+     socket.on('rtc:offer', async (data: { offer: RTCSessionDescriptionInit }) => {
```

```diff
-     socket.on('rtc:offer', async (data: { viewerId: string; offer: any }) => {
+     socket.on('rtc:offer', async (data: OfferPayload) => {
```

```diff
-     socket.on('rtc:answer', (data: { answer: any; viewerId: string }) => {
+     socket.on('rtc:answer', (data: AnswerPayload) => {
```

```diff
-     socket.on('rtc:ice-answer', (data: { candidate: any; viewerId: string }) => {
+     socket.on('rtc:ice-answer', (data: IceAnswerPayload & { viewerId: string }) => {
```

```diff
-     socket.on('rtc:ice', (data: { candidate: any }) => {
+     socket.on('rtc:ice', (data: { candidate: RTCIceCandidateInit }) => {
```

```diff
-     socket.emit('rtc:ice-answer', { candidate: event.candidate });
+     socket.emit('rtc:ice-answer', { candidate: event.candidate.toJSON() });
```

```diff
-         socket.emit('rtc:ice', { viewerId, candidate: e.candidate });
+         socket.emit('rtc:ice', { viewerId, candidate: e.candidate.toJSON() });
```

（`e.candidate` 是 `RTCIceCandidate` 对象，需要 `.toJSON()` 转为可序列化格式。）

**验证**：
```bash
cd C:/yoyac-work/LiveStream/client
npx tsc --noEmit 2>&1
# 期望：无错误输出
```

**提交**：
```bash
cd C:/yoyac-work/LiveStream && git add client/src/types.ts client/src/App.tsx && git commit -m "chore: add WebRTC signaling types"
```

---

## Task 13: 移除未使用的类型

**文件**：`client/src/types.ts`

**改动**：删除 `PeerInfo` 接口。

```diff
- export interface PeerInfo {
-   id: string;
-   nickname: string;
- }
-
  export type Role = 'streamer' | 'viewer' | null;
```

**验证**：
```bash
cd C:/yoyac-work/LiveStream/client
npx tsc --noEmit 2>&1
```

**提交**：
```bash
cd C:/yoyac-work/LiveStream && git add client/src/types.ts && git commit -m "chore: remove unused PeerInfo type"
```

---

## Task 14: 添加环境配置

**文件**：`client/.env.example`（新建）, `client/src/App.tsx`

**改动**：将 `SERVER_URL` 从硬编码改为 `import.meta.env`。

`client/.env.example`：
```
# 后端服务器地址
VITE_SERVER_URL=http://localhost:5000
```

`client/src/App.tsx`：
```diff
- const SERVER_URL = 'http://localhost:5000';
+ const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';
```

**验证**：
```bash
cd C:/yoyac-work/LiveStream/client
npx vite build 2>&1 | tail -3
```

**提交**：
```bash
cd C:/yoyac-work/LiveStream && git add client/.env.example client/src/App.tsx && git commit -m "chore: add env config for server URL and ICE"
```

---

## 最终验证

所有 14 项修复完成后，运行完整检查：

```bash
# 1. 后端 TypeScript 检查
cd C:/yoyac-work/LiveStream/server
npx tsc --noEmit 2>&1
# 期望：无输出

# 2. 前端 TypeScript 检查
cd C:/yoyac-work/LiveStream/client
npx tsc --noEmit 2>&1
# 期望：无输出

# 3. 前端构建
npx vite build 2>&1 | tail -5
# 期望：✓ built in X.XXs

# 4. Git log 验证所有提交
cd C:/yoyac-work/LiveStream
git log --oneline -15
# 期望：14 条提交（从最新到最旧）
```

## 注意事项

- Task 9 和 Task 10 修改同一个文件（`VideoArea.tsx`），合并为一个提交
- Task 11 依赖 Task 12 的类型定义（`ConnectionStatus`），但类型添加很轻量，可以先做 Task 12
- 实际操作顺序建议：1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 12 → 13 → 14 → 9+10 → 11
- 每步执行后检查前端是否能编译通过（`npx vite build`）
