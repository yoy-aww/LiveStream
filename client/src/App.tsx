import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import type { ChatMessage, RoomState, Role, ConnectionStatus, AnswerPayload, IceAnswerPayload } from './types';
import LoginScreen from './components/LoginScreen';
import LiveRoom from './components/LiveRoom';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';

// TURN 配置（部署时从环境变量读取）
const TURN_URL = import.meta.env.VITE_TURN_URL || 'turn:43.153.148.187:3478';
const TURN_USERNAME = import.meta.env.VITE_TURN_USERNAME || 'livestream';
const TURN_SECRET = import.meta.env.VITE_TURN_SECRET || '';

async function generateTurnCredential(): Promise<{ username: string; credential: string }> {
  if (!TURN_SECRET) return { username: '', credential: '' };
  const timestamp = Math.floor(Date.now() / 1000 / 3600) * 3600;
  const username = `${timestamp}:${TURN_USERNAME}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(TURN_SECRET), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(username));
  const credential = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return { username, credential };
}

async function buildIceServers(): Promise<RTCIceServer[]> {
  const servers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
  if (TURN_SECRET) {
    const cred = await generateTurnCredential();
    if (cred.username) {
      servers.push({ urls: TURN_URL, username: cred.username, credential: cred.credential });
    }
  }
  return servers;
}

export default function App() {
  const [nickname, setNickname] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [roomState, setRoomState] = useState<RoomState>({ streamer: null, viewers: 0, streaming: false });
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');

  // 主播用
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const selfVideoRef = useRef<HTMLVideoElement>(null);
  // 观众用
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const streamerReadyRef = useRef(false);

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
    s.on('room:assigned', (d: { role: Role; nickname: string; streamerNickname: string }) => {
      setRole(d.role);
      if (d.role === 'streamer') addToast('你已成为主播！');
      else addToast(`正在观看 ${d.streamerNickname}`);
    });
    s.on('room:state', (st: RoomState) => setRoomState(st));
    s.on('viewer:joined', (d: { nickname: string }) => addToast(`${d.nickname} 加入了房间`));
    s.on('viewer:left', (d: { nickname: string }) => addToast(`${d.nickname} 离开了房间`));
    s.on('streamer:left', () => {
      setRole(null); setSocket(null);
      setRoomState({ streamer: null, viewers: 0, streaming: false });
      setConnectionStatus('idle');
      addToast('主播已离开');
    });
    s.on('chat:new', (msg: ChatMessage) => setChatMessages((prev) => [...prev, msg].slice(-200)));
    s.on('chat:rateLimited', () => addToast('发送太频繁，请稍候'));

    setSocket(s);
  }, [addToast]);

  // ── 观众端：创建 PC，等待主播的 offer ──
  useEffect(() => {
    if (role !== 'viewer' || !socket) return;

    let cancelled = false;
    let pc: RTCPeerConnection | null = null;

    (async () => {
      const iceServers = await buildIceServers();
      if (cancelled) return;

      const localPc = new RTCPeerConnection({ iceServers });
      pc = localPc;
      pcRef.current = localPc;

      // 连接状态跟踪
      localPc.onconnectionstatechange = () => {
        setConnectionStatus(localPc.connectionState as ConnectionStatus);
      };

      // 收到媒体轨道 → 合并到同一个 stream 播放
      const remoteStreams: MediaStream[] = [];
      localPc.ontrack = (event: RTCTrackEvent) => {
        let stream = event.streams[0];
        if (!stream) return;
        let combined = remoteStreams[0];
        if (!combined) {
          combined = new MediaStream();
          remoteStreams.push(combined);
        }
        event.track.addEventListener('ended', () => {
          combined!.removeTrack(event.track);
        });
        combined.addTrack(event.track);

        const video = remoteVideoRef.current;
        if (video && video.srcObject !== combined) {
          video.srcObject = combined;
          video.play().catch(() => {});
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && socket.connected) {
          socket.emit('rtc:ice-answer', { candidate: event.candidate.toJSON() });
        }
      };

      // 收到主播的 offer
      socket.on('rtc:offer', async (data: { offer: RTCSessionDescriptionInit }) => {
        if (!pc) return;
        await pc.setRemoteDescription(data.offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('rtc:answer', { answer });
      });

      // 收到主播的 ICE
      socket.on('rtc:ice', (data: { candidate: RTCIceCandidateInit }) => {
        if (pc) pc.addIceCandidate(data.candidate).catch(console.warn);
      });

      // 通知服务端：我已创建 PC，可以接收 offer
      socket.emit('viewer:ready');
    })();

    return () => {
      cancelled = true;
      if (pc) {
        pc.close();
        pcRef.current = null;
      }
      socket.off('rtc:offer');
      socket.off('rtc:ice');
      setConnectionStatus('idle');
    };
  }, [role, socket]);

  // ── 主播端：处理信令 ──
  useEffect(() => {
    if (role !== 'streamer' || !socket) return;

    // 收到观众加入 → 创建 PC 并发送 offer
    socket.on('viewer:join', async (viewerId: string) => {
      const stream = localStreamRef.current;
      if (!stream || peersRef.current.has(viewerId)) return;

      const iceServers = await buildIceServers();
      const pc = new RTCPeerConnection({ iceServers });
      peersRef.current.set(viewerId, pc);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      // 跟踪每个 peer 的连接状态
      pc.onconnectionstatechange = () => {
        const states = Array.from(peersRef.current.values()).map(p => p.connectionState);
        if (states.length === 0) setConnectionStatus('idle');
        else if (states.every(s => s === 'connected')) setConnectionStatus('connected');
        else if (states.some(s => s === 'connected')) setConnectionStatus('connected');
        else if (states.some(s => s === 'failed' || s === 'disconnected')) setConnectionStatus('failed');
        else setConnectionStatus('connecting');
      };

      pc.onicecandidate = (e) => {
        if (e.candidate && socket.connected) {
          socket.emit('rtc:ice', { viewerId, candidate: e.candidate.toJSON() });
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('rtc:offer', { viewerId, offer });
    });

    // 收到观众 answer
    socket.on('rtc:answer', (data: AnswerPayload) => {
      const pc = peersRef.current.get(data.viewerId);
      if (pc) pc.setRemoteDescription(data.answer);
    });

    // 收到观众 ICE
    socket.on('rtc:ice-answer', (data: IceAnswerPayload & { viewerId: string }) => {
      const pc = peersRef.current.get(data.viewerId);
      if (pc) pc.addIceCandidate(data.candidate).catch(console.warn);
    });

    // 观众离开
    socket.on('viewer:leave', (viewerId: string) => {
      const pc = peersRef.current.get(viewerId);
      if (pc) { pc.close(); peersRef.current.delete(viewerId); }
    });

    return () => {
      socket.off('viewer:join');
      socket.off('rtc:answer');
      socket.off('rtc:ice-answer');
      socket.off('viewer:leave');
      setConnectionStatus('idle');
    };
  }, [role, socket]);

  // ── 主播：开始推流 ──
  const startStreaming = useCallback(async () => {
    if (!socket || role !== 'streamer') return;
    if (streamerReadyRef.current) {
      addToast('已经在直播中');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      localStreamRef.current = stream;

      if (selfVideoRef.current) selfVideoRef.current.srcObject = stream;

      streamerReadyRef.current = true;
      socket.emit('streamer:ready');
      addToast('直播已就绪');
    } catch (err) {
      addToast(`无法访问摄像头/麦克风: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [socket, role, addToast]);

  // ── 停止直播 ──
  const stopStreaming = useCallback(() => {
    if (!socket || role !== 'streamer') return;
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    streamerReadyRef.current = false;
    setConnectionStatus('idle');
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
      connectionStatus={connectionStatus}
      selfVideoRef={selfVideoRef} remoteVideoRef={remoteVideoRef}
      onSendChat={sendChat} onSendImage={sendImage}
      onStartStreaming={startStreaming} onStopStreaming={stopStreaming}
    />
  );
}