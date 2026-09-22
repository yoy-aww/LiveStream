# 系统架构

## 角色模型

直播间采用单房间模式，所有客户端连接同一个房间：

- **第一个进入的用户** → 主播（streamer）
- **后续进入的用户** → 观众（viewer）
- **主播断开** → 房间清空，下一个进入者重新成为主播

## 信令层 vs 媒体层

WebRTC 直播分为两个完全独立的层：

### 信令层（Socket.IO）

负责"握手协商"——告知双方对方是谁、使用什么协议、如何连接。

```
主播 ←── Socket.IO ──→ 服务器 ←── Socket.IO ──→ 观众

事件:
  viewer:join    主播 → 服务器 → 通知主播有新观众
  streamer:ready 主播 → 服务器   告知已准备好推流
  viewer:ready   观众 → 服务器   告知已创建 PC 可接收 offer
  rtc:offer      主播 → 服务器 → 转发给观众
  rtc:answer     观众 → 服务器 → 转发给主播
  rtc:ice        主播 → 服务器 → 转发 ICE 给观众
  rtc:ice-answer 观众 → 服务器 → 转发 ICE 给主播
```

### 媒体层（WebRTC）

负责"实际传输"——音视频数据通过 RTCPeerConnection 直接点对点传输，不经过服务器。

```
主播 ────────── RTCPeerConnection ──────────→ 观众
    (video track)                              (video track)
    (audio track)                              (audio track)
```

**关键点**：服务器不传输任何媒体数据，只传递信令消息（几 KB 的协商参数）。

## 房间状态机

```
                    streamer 连接
                         │
                         ▼
    ┌──────────────────────────────┐
    │  streamer: null               │ ← 初始状态
    │  viewers: Map (空)            │
    │  readyViewers: Set (空)       │
    └──────────┬───────────────────┘
               │
               │ streamer:enter
               ▼
    ┌──────────────────────────────┐
    │  streamer: { id, nickname,   │ ← 有人开播
    │            ready: false }     │
    │  viewers: Map                 │
    │  readyViewers: Set            │
    └──────────┬───────────────────┘
               │
               │ streamer:ready
               ▼
    ┌──────────────────────────────┐
    │  streamer.ready = true        │ ← 主播已就绪
    │  → 为所有 readyViewers 建连   │
    └──────────────────────────────┘
```

## 前端组件树

```
App.tsx
├── LoginScreen.tsx         输入昵称，连接 Socket.IO
├── LiveRoom.tsx            直播间主布局
│   ├── Topbar.tsx          顶部栏：LIVE 标记、观众数、昵称
│   ├── VideoArea.tsx       视频区域（按角色区分）
│   │   ├── remoteVideo     观众端：显示主播画面
│   │   └── selfVideo       主播端：显示本地摄像头预览
│   ├── ControlBar.tsx      控制栏（主播：开始/停止）
│   └── ChatPanel.tsx       右侧弹幕聊天
└── ToastContainer.tsx      右上角浮动通知
```
