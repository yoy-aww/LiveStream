import { useState, useEffect } from 'react';
import type { RefObject } from 'react';
import type { Role, ConnectionStatus, ChatMessage } from '../types';
import Danmaku from './Danmaku';

interface Props {
  role: Role;
  connectionStatus: ConnectionStatus;
  selfVideoRef: RefObject<HTMLVideoElement>;
  remoteVideoRef: RefObject<HTMLVideoElement>;
  messages: ChatMessage[];
}

export default function VideoArea({ role, connectionStatus, selfVideoRef, remoteVideoRef, messages }: Props) {
  const [hasStream, setHasStream] = useState(false);
  const [needsUnlock, setNeedsUnlock] = useState(false);

  useEffect(() => {
    const video = role === 'viewer' ? remoteVideoRef.current : selfVideoRef.current;
    if (!video) return;

    const onLoaded = () => setHasStream(true);
    const onPlay = () => setHasStream(true);

    if (video.srcObject) setHasStream(true);

    video.addEventListener('loadedmetadata', onLoaded);
    video.addEventListener('play', onPlay);
    return () => {
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('play', onPlay);
    };
  }, [role, selfVideoRef, remoteVideoRef]);

  // 观众点击视频区域 → 解锁音频
  const handleClick = () => {
    if (role !== 'viewer') return;
    const video = remoteVideoRef.current;
    if (!video) return;
    video.play().then(() => {
      setNeedsUnlock(false);
      setHasStream(true);
    }).catch(() => setNeedsUnlock(true));
  };

  const waitingText = connectionStatus === 'connected'
    ? '正在等待主播开播...'
    : connectionStatus === 'connecting'
      ? '正在连接...'
      : connectionStatus === 'failed'
        ? '连接失败，请重试'
        : '正在连接...';

  if (role === 'viewer') {
    return (
      <div className="video-area" onClick={handleClick}>
        <video ref={remoteVideoRef} className="video-main" autoPlay playsInline />
        <div className={`video-placeholder ${hasStream ? 'hidden' : ''}`}>
          <div className="icon">📡</div>
          <p>{waitingText}</p>
        </div>
        <Danmaku messages={messages} />
        {needsUnlock && hasStream && (
          <div className="audio-unlock" onClick={(e) => { e.stopPropagation(); handleClick(); }}>
            <button className="audio-unlock-btn">🔊 点击开启声音</button>
          </div>
        )}
      </div>
    );
  }

  // 主播端
  return (
    <div className="video-area">
      {!hasStream && (
        <div className="video-placeholder">
          <div className="icon">🎥</div>
          <p>点击「开始直播」启动摄像头</p>
        </div>
      )}
      <div className="video-self">
        <video ref={selfVideoRef} autoPlay playsInline muted />
      </div>
      <Danmaku messages={messages} />
    </div>
  );
}
