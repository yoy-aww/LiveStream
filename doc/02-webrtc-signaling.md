# WebRTC 信令流程

## 完整握手时序

以下是一次完整的 WebRTC 直播建立流程：

```
时间 →

主播                              服务器                          观众
  │                                 │                              │
  │ 1. room:enter                   │                              │
  │ ──────────────────────────────→ │                              │
  │ 2. room:assigned (role:streamer)│                              │
  │ ←────────────────────────────── │                              │
  │                                 │                              │
  │                                 │ 3. room:enter                │
  │                                 │ ←─────────────────────────── │
  │                                 │ 4. room:assigned (role:viewer)│
  │                                 │ ────────────────────────────→ │
  │                                 │                              │
  │ 5. startStreaming()             │                              │
  │ getUserMedia() → 摄像头就绪      │                              │
  │                                 │ 5. viewer:ready (创建 PC 后)  │
  │                                 │ ←─────────────────────────── │
  │ 6. streamer:ready               │                              │
  │ ──────────────────────────────→ │                              │
  │                                 │                              │
  │                                 │ 6a. viewer:join              │
  │ 7a. viewer:join (来自服务器)      │ ────────────────────────────→│
  │ ←────────────────────────────── │                              │
  │                                 │                              │
  │ 7b. 创建 PC, 添加轨道             │                              │
  │ pc.createOffer()                │                              │
  │                                 │                              │
  │ 8. rtc:offer                    │                              │
  │ ──────────────────────────────→ │ 8a. rtc:offer (转发)         │
  │                                 │ ────────────────────────────→│
  │                                 │                              │
  │                                 │                              │
  │                                 │ 9a. rtc:answer               │
  │ 9b. rtc:answer (来自服务器)      │ ←─────────────────────────── │
  │ ←────────────────────────────── │                              │
  │                                 │                              │
  │ 10. rtc:ice (ICE 候选)          │                              │
  │ ──────────────────────────────→ │ 10a. rtc:ice (转发)          │
  │                                 │ ────────────────────────────→│
  │                                 │                              │
  │                                 │ 10b. rtc:ice-answer          │
  │ 10c. rtc:ice-answer             │ ←─────────────────────────── │
  │ ←────────────────────────────── │                              │
  │                                 │                              │
  │ ═══════════ WebRTC 媒体通道建立 ══════════════════════════════ │
  │                                 │                              │
  │ ─── video/audio track ──────────────────────────────────────→ │
  │                              (P2P 直连，不经过服务器)           │
```

## 关键事件说明

| 事件 | 发送方 | 接收方 | 时机 |
|------|--------|--------|------|
| `viewer:ready` | 观众 | 服务器 | 观众创建 PC 后立即发出 |
| `streamer:ready` | 主播 | 服务器 | 主播 getUserMedia 成功后发出 |
| `viewer:join` | 服务器 | 主播 | 当 streamer.ready 且 viewer.ready 时发出 |
| `rtc:offer` | 主播 | 观众（经服务器） | 主播创建 PC 并添加轨道后 |
| `rtc:answer` | 观众 | 主播（经服务器） | 观众收到 offer 后创建 answer |
| `rtc:ice` | 主播 | 观众（经服务器） | ICE 候选生成时 |
| `rtc:ice-answer` | 观众 | 主播（经服务器） | ICE 候选生成时 |

## 为什么 viewer:join 在两个条件都满足时才发送

这是避免竞态的核心设计：

```
场景 A: 观众先加入，主播后开播
  viewer:enter → viewer:ready → (等待 streamer:ready)
                                           ↓
                                     streamer:ready → 发 viewer:join

场景 B: 主播先开播，观众后加入
  streamer:ready → (等待 viewer:ready)
                           ↓
                     viewer:enter → viewer:ready → 发 viewer:join
```

两种场景都被正确处理，不会出现：
- ❌ 主播还没就绪就收到 viewer:join
- ❌ 观众还没创建 PC 就收到 offer
