# WebRTC 直播

基于 WebRTC 的实时直播应用，支持 1 主播 → N 观众的音视频推流，附带弹幕聊天。

## 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 信令 | Socket.IO | 中转 WebRTC 握手（offer/answer/ICE）和房间管理 |
| 媒体 | WebRTC (RTCPeerConnection) | P2P 音视频推流，STUN 打洞 |
| 前端 | React 18 + TypeScript + Vite | 主播端 + 观众端同一代码 |
| 后端 | Express + Socket.IO | 信令服务器，单房间直播 |

## 架构

```
┌─────────────────────────────────────────────────────────┐
│                      Socket.IO 服务器                    │
│                                                          │
│  ┌────────────┐   房间状态   ┌──────────────────────┐    │
│  │  room:state │───────────→│  readyViewers: Set    │    │
│  │  管理       │            │  viewers: Map         │    │
│  │  (主播/观众) │            │  streamer: info      │    │
│  └────────────┘            └──────────────────────┘    │
│         │                              │                  │
│    信令转发                   WebRTC 信令中转             │
│    (chat)                     (offer/answer/ICE)         │
└──────────┼─────────────────────────────┼─────────────────┘
           │                             │
     ┌─────┴─────┐                ┌──────┴──────┐
     │  主播     │   WebRTC       │  观众 1..N  │
     │  (1个)    │◄──────────────→│  (N个)      │
     └───────────┘  音视频直连     └─────────────┘
```

## 项目结构

```
LiveStream/
├── server/
│   ├── src/index.ts        # Express + Socket.IO 信令服务器
│   ├── package.json
│   └── tsconfig.json
├── client/
│   ├── src/
│   │   ├── App.tsx         # 主组件（Socket.IO + WebRTC 逻辑）
│   │   ├── main.tsx        # 入口
│   │   ├── types.ts        # 类型定义
│   │   ├── styles.css      # 样式
│   │   └── components/
│   │       ├── LoginScreen.tsx
│   │       ├── LiveRoom.tsx
│   │       ├── Topbar.tsx
│   │       ├── VideoArea.tsx
│   │       ├── ChatPanel.tsx
│   │       ├── ControlBar.tsx
│   │       └── ToastContainer.tsx
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
├── doc/                    # 学习文档
│   ├── 01-architecture.md
│   ├── 02-webrtc-signaling.md
│   └── 03-race-conditions.md
├── .gitignore
└── README.md
```

## 快速开始

### 前置要求

- Node.js ≥ 18
- 浏览器支持 WebRTC（Chrome / Edge / Firefox）

### 1. 启动后端

```bash
cd server
npm install
npm run dev
```

服务器运行在 `http://localhost:5000`。

### 2. 启动前端

```bash
cd client
npm install
npm run dev
```

前端运行在 `http://localhost:5174`（Vite dev server 配置了 `/api` 代理到后端）。

### 3. 使用

1. 打开两个浏览器窗口，都访问 `http://localhost:5174`
2. **第一个窗口**输入昵称 → 自动成为主播
3. **第二个窗口**输入昵称 → 自动成为观众
4. 主播点击「开始直播」→ 授权摄像头和麦克风
5. 观众端会自动显示直播画面

### 生产构建

```bash
cd client
npm run build   # 产物在 client/dist/
```

## 核心功能

- **1 对多直播**：主播推流给所有观众（每个观众独立 RTCPeerConnection）
- **文字聊天**：Socket.IO 广播
- **图片发送**：本地转 base64 发送
- **房间状态**：实时显示主播昵称和观众人数
- **自动分配角色**：第一个进入为主播，后续为观众

## 开发说明

- 前后端均使用 TypeScript，`strict: true`
- 后端 `tsx watch` 支持热重载
- 前端 Vite HMR 热更新
- 端口：后端 5000，前端 5174

## License

MIT
