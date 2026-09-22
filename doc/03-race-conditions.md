# 竞态条件与解决方案

WebRTC 直播中最容易踩的坑是**时序竞态**——多个异步事件以不可预测的顺序发生，导致信令丢失。

## 问题 1：主播就绪前观众加入

**现象**：观众看不到直播，一直显示"正在等待"。

**原因**：
```
1. 观众进入房间 → 服务器发 viewer:join 给主播
2. 主播还没开播 → localStreamRef.current === null
3. 主播端 createPeerForViewer() 检查 → 直接 return
4. 主播开播后 → 没人再触发一次建连
```

**解决方案**：
- 服务器维护 `readyViewers` 集合
- 观众创建 PC 后发 `viewer:ready`
- 主播发 `streamer:ready` 后，服务器遍历 `readyViewers` 发送 `viewer:join`
- 反之亦然

```typescript
// 服务器端
socket.on('viewer:ready', () => {
  room.readyViewers.add(socket.id);
  if (room.streamer?.ready) {
    io.to(room.streamer.id).emit('viewer:join', socket.id);
  }
});

socket.on('streamer:ready', () => {
  room.streamer.ready = true;
  for (const viewerId of room.readyViewers) {
    io.to(socket.id).emit('viewer:join', viewerId);
  }
});
```

## 问题 2：offer 到达时观众 PC 未就绪

**现象**：主播发送了 offer，但观众端 `pcRef.current` 还是 null。

**原因**：
```
1. 观众 useEffect 触发 → 创建 PC（异步）
2. 同时服务器发送 viewer:join → 主播立即发 offer
3. offer 到达时 useEffect 还没执行完 → pcRef.current === null
```

**解决方案**：
```typescript
// 观众端：缓冲 offer
socket.on('rtc:offer', async (data: { offer: any }) => {
  const myPc = pcRef.current;
  if (!myPc) {
    pendingOfferRef.current = data.offer; // 缓冲
    return;
  }
  // ...正常处理
});

// 在 useEffect 创建 PC 后检查缓冲
useEffect(() => {
  if (pendingOfferRef.current) {
    const offer = pendingOfferRef.current;
    pendingOfferRef.current = null;
    pc.setRemoteDescription(offer).then(() => {
      pc.createAnswer().then((answer) => {
        pc.setLocalDescription(answer).then(() => {
          socket.emit('rtc:answer', { answer });
        });
      });
    });
  }
}, [role]);
```

## 问题 3：React StrictMode 双重执行

**现象**：PC 被创建两次，第二次覆盖第一次，导致 offer 路由到已销毁的 PC。

**原因**：
```
StrictMode 下 useEffect 执行两次：
1. 第一次 → 创建 PC → 绑定 listener → 发 viewer:ready
2. 清理 → PC.close() → pcRef.current = null
3. 第二次 → 创建新 PC → 但服务器可能已经向旧 PC 发了 offer
```

**解决方案**：移除 StrictMode
```typescript
// main.tsx
// ❌ 不要 StrictMode
// ReactDOM.createRoot(...).render(<StrictMode><App /></StrictMode>);

// ✅ 直接渲染
ReactDOM.createRoot(...).render(<App />);
```

## 问题 4：ICE 候选丢失

**现象**：offer/answer 交换成功，但媒体不通。

**原因**：
```
ICE 候选是异步生成的，可能早于对端完成 setLocalDescription()。
如果 addIceCandidate() 在 setLocalDescription() 之前调用，会报错。
```

**解决方案**：
```typescript
pc.onicecandidate = (event) => {
  if (event.candidate && socket.connected) {
    socket.emit('rtc:ice', { candidate: event.candidate });
  }
};

// 接收端：错误静默处理（不影响功能）
pc.addIceCandidate(data.candidate).catch(console.warn);
```

## 问题 5：主播停止直播后资源泄漏

**现象**：停止直播后 CPU 占用高，下次开播异常。

**原因**：
```
1. 只停止了轨道 (track.stop())
2. 没有关闭 RTCPeerConnection
3. PC 内部的媒体通道仍然活跃
```

**解决方案**：
```typescript
const stopStreaming = useCallback(() => {
  // 关闭所有 PC
  peersRef.current.forEach((pc) => pc.close());
  peersRef.current.clear();
  
  // 停止所有轨道
  localStreamRef.current?.getTracks().forEach(t => t.stop());
  localStreamRef.current = null;
  
  // 断开 Socket.IO
  socket.disconnect();
  setSocket(null);
  setRole(null);
}, [socket, role]);
```
