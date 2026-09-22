import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import type { ChatMessage, RoomState, Role, OfferPayload, AnswerPayload, IceCandidatePayload, IceAnswerPayload } from './types';
import LoginScreen from './components/LoginScreen';
import LiveRoom from './components/LiveRoom';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';
const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

export default function App() {
  const [nickname, setNickname] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [roomState, setRoomState] = useState<RoomState>({ streamer: null, viewers: 0, streaming: false });
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);

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
    s.on('chat:new', (msg: ChatMessage) => setChatMessages((p) => [...p, msg].slice(-200)));
    s.on('chat:rateLimited', () => addToast('发送太频繁，请稍候'));

    setSocket(s);
  }, [addToast]);

  // ── 观众端：创建 PC，等待主播的 offer ──
  useEffect(() => {
    if (role !== 'viewer' || !socket) return;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    // 收到媒体轨道 → 合并到同一个 stream 播放
    const remoteStreams: MediaStream[] = [];
    pc.ontrack = (event: RTCTrackEvent) => {
      let stream = event.streams[0];
      if (!stream) return;
      // 合并所有收到的 stream 到一个 combined stream
      let combined = remoteStreams[0];
      if (!combined) {
        combined = new MediaStream();
        remoteStreams.push(combined);
      }
      event.track.addEventListener('ended', () => {
        combined!.removeTrack(event.track);
      });
      combined.addTrack(event.track);

      const video = document.getElementById('remoteVideo') as HTMLVideoElement;
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
      await pc.setRemoteDescription(data.offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('rtc:answer', { answer });
    });

    // 收到主播的 ICE
    socket.on('rtc:ice', (data: { candidate: RTCIceCandidateInit }) => {
      pc.addIceCandidate(data.candidate).catch(console.warn);
    });

    // 通知服务端：我已创建 PC，可以接收 offer
    socket.emit('viewer:ready');

    return () => {
      pc.close();
      pcRef.current = null;
      socket.off('rtc:offer');
      socket.off('rtc:ice');
    };
  }, [role, socket]);

  // ── 主播端：处理信令 ──
  useEffect(() => {
    if (role !== 'streamer' || !socket) return;

    // 收到观众加入 → 创建 PC 并发送 offer
    socket.on('viewer:join', async (viewerId: string) => {
      const stream = localStreamRef.current;
      if (!stream || peersRef.current.has(viewerId)) return;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peersRef.current.set(viewerId, pc);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

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

      const selfVideo = document.getElementById('selfVideo') as HTMLVideoElement;
      if (selfVideo) selfVideo.srcObject = stream;

      streamerReadyRef.current = true;
      socket.emit('streamer:ready');
      addToast('直播已就绪');
    } catch (err: any) {
      addToast(`无法访问摄像头/麦克风: ${err.message}`);
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