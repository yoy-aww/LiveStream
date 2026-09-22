import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import type { ChatMessage, RoomState, Role } from './types';
import LoginScreen from './components/LoginScreen';
import LiveRoom from './components/LiveRoom';

const SERVER_URL = 'http://localhost:5000';

export default function App() {
  const [nickname, setNickname] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [roomState, setRoomState] = useState<RoomState>({ streamer: null, viewers: 0, streaming: false });
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);

  // 共享 ref（不触发重渲染）
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pendingViewersRef = useRef<Set<string>>(new Set());
  const streamerReadyRef = useRef(false);
  const pendingOfferRef = useRef<any>(null); // 观众端：PC 未就绪时的缓冲

  const addToast = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  // ── 连接 Socket.IO ──
  const connectSocket = useCallback((name: string) => {
    const s = io(SERVER_URL, { auth: { nickname: name }, transports: ['websocket', 'polling'] });

    s.on('connect', () => { addToast('已连接服务器'); s.emit('room:enter'); });
    s.on('connect_error', (err) => addToast(`连接失败: ${err.message}`));
    s.on('room:assigned', (d: any) => {
      setRole(d.role);
      if (d.role === 'streamer') addToast('你已成为主播！');
      else addToast(`正在观看 ${d.streamerNickname}`);
    });
    s.on('room:state', (st: RoomState) => setRoomState(st));
    s.on('viewer:joined', (d: any) => addToast(`${d.nickname} 加入`));
    s.on('viewer:left', (d: any) => addToast(`${d.nickname} 离开`));
    s.on('streamer:left', () => {
      setRole(null); setSocket(null);
      setRoomState({ streamer: null, viewers: 0, streaming: false });
      addToast('主播已离开');
    });
    s.on('chat:new', (msg: ChatMessage) => setChatMessages((p) => [...p, msg]));

    setSocket(s);
  }, [addToast]);

  // ── 信令处理：观众端 ──
  useEffect(() => {
    if (role !== 'viewer' || !socket) return;

    // 创建 PC
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    pcRef.current = pc;

    // 收到媒体轨道 → 播放
    pc.ontrack = (event) => {
      const video = document.getElementById('remoteVideo') as HTMLVideoElement;
      if (video && video.srcObject !== event.streams[0]) {
        video.srcObject = event.streams[0];
        video.play().catch(() => {});
      }
    };

    // ICE
    pc.onicecandidate = (event) => {
      if (event.candidate && socket.connected) {
        socket.emit('rtc:ice-answer', { candidate: event.candidate });
      }
    };

    // 处理缓冲的 offer（PC 创建前的竞态处理）
    if (pendingOfferRef.current) {
      const offer = pendingOfferRef.current;
      pendingOfferRef.current = null;
      pc.setRemoteDescription(offer).then(() => {
        pc.createAnswer().then((answer: any) => {
          pc.setLocalDescription(answer).then(() => {
            socket.emit('rtc:answer', { answer });
          });
        });
      });
    }

    // 通知服务端：已就绪
    socket.emit('viewer:ready');

    // 收到主播 offer
    socket.on('rtc:offer', async (data: { offer: any }) => {
      const myPc = pcRef.current;
      if (!myPc) {
        pendingOfferRef.current = data.offer;
        return;
      }
      await myPc.setRemoteDescription(data.offer);
      const answer = await myPc.createAnswer();
      await myPc.setLocalDescription(answer);
      socket.emit('rtc:answer', { answer });
    });

    // 收到主播 ICE
    socket.on('rtc:ice', (data: { candidate: any }) => {
      if (pcRef.current) pcRef.current.addIceCandidate(data.candidate).catch(console.warn);
    });

    return () => {
      pc.close();
      pcRef.current = null;
      pendingOfferRef.current = null;
      socket.off('rtc:offer');
      socket.off('rtc:ice');
    };
  }, [role, socket]);

  // ── 信令处理：主播端 ──
  useEffect(() => {
    if (role !== 'streamer' || !socket) return;

    // 为某个观众创建 PC 并发送 offer
    const createPeerForViewer = async (viewerId: string) => {
      const stream = localStreamRef.current;
      if (!stream) {
        pendingViewersRef.current.add(viewerId);
        return;
      }
      if (peersRef.current.has(viewerId)) return;

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      peersRef.current.set(viewerId, pc);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      pc.onicecandidate = (e) => {
        if (e.candidate && socket.connected) {
          socket.emit('rtc:ice', { viewerId, candidate: e.candidate });
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('rtc:offer', { viewerId, offer });
    };

    // 收到观众加入
    socket.on('viewer:join', (viewerId: string) => {
      if (!streamerReadyRef.current || !localStreamRef.current) {
        pendingViewersRef.current.add(viewerId);
        return;
      }
      createPeerForViewer(viewerId);
    });

    // 收到观众 answer
    socket.on('rtc:answer', (data: { answer: any; viewerId: string }) => {
      const pc = peersRef.current.get(data.viewerId);
      if (pc) pc.setRemoteDescription(data.answer);
    });

    // 收到观众 ICE
    socket.on('rtc:ice-answer', (data: { candidate: any; viewerId: string }) => {
      const pc = peersRef.current.get(data.viewerId);
      if (pc) pc.addIceCandidate(data.candidate).catch(console.warn);
    });

    // 观众离开
    socket.on('viewer:leave', (viewerId: string) => {
      const pc = peersRef.current.get(viewerId);
      if (pc) { pc.close(); peersRef.current.delete(viewerId); }
      pendingViewersRef.current.delete(viewerId);
    });

    return () => {
      socket.off('viewer:join');
      socket.off('rtc:answer');
      socket.off('rtc:ice-answer');
      socket.off('viewer:leave');
    };
  }, [role, socket]);

  // ── 主播：开始推流 ──
  const startStreaming = useCallback(async () => {
    if (!socket || role !== 'streamer' || streamerReadyRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      localStreamRef.current = stream;

      // 显示本地预览
      const selfVideo = document.getElementById('selfVideo') as HTMLVideoElement;
      if (selfVideo) selfVideo.srcObject = stream;

      streamerReadyRef.current = true;
      socket.emit('streamer:ready');
      addToast('直播已就绪');

      // 为已缓冲的观众建连
      const pending = Array.from(pendingViewersRef.current);
      pendingViewersRef.current.clear();
      for (const vid of pending) {
        // 延迟一点，确保信令监听器已就绪
        setTimeout(() => {
          socket.emit('viewer:join', { viewerId: vid, from: 'pending' });
          // 实际上服务端会再次发送 viewer:join
          // 我们直接在这里建连
          const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
          peersRef.current.set(vid, pc);
          stream.getTracks().forEach((t) => pc.addTrack(t, stream));
          pc.onicecandidate = (e) => {
            if (e.candidate && socket.connected) {
              socket.emit('rtc:ice', { viewerId: vid, candidate: e.candidate });
            }
          };
          pc.createOffer().then((offer) => {
            pc.setLocalDescription(offer).then(() => {
              socket.emit('rtc:offer', { viewerId: vid, offer });
            });
          });
        }, 100);
      }
    } catch (err: any) {
      addToast(`无法访问摄像头/麦克风: ${err.message}`);
    }
  }, [socket, role, addToast]);

  // ── 停止直播 ──
  const stopStreaming = useCallback(() => {
    if (!socket || role !== 'streamer') return;
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    pendingViewersRef.current.clear();
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    streamerReadyRef.current = false;
    socket.disconnect();
    setSocket(null);
    setRole(null);
    addToast('直播已停止');
  }, [socket, role, addToast]);

  const sendChat = useCallback((text: string) => {
    if (socket && text.trim()) socket.emit('chat:send', { type: 'text', content: text.trim() });
  }, [socket]);

  const sendImage = useCallback((url: string) => {
    if (socket && url) socket.emit('chat:send', { type: 'image', content: url });
  }, [socket]);

  if (!nickname || !socket || !role) {
    return <LoginScreen onLogin={(n) => { setNickname(n); connectSocket(n); }} />;
  }

  return (
    <LiveRoom
      socket={socket} role={role} roomState={roomState} nickname={nickname}
      chatMessages={chatMessages} toasts={toasts}
      onSendChat={sendChat} onSendImage={sendImage}
      onStartStreaming={startStreaming} onStopStreaming={stopStreaming}
    />
  );
}