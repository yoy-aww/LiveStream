import { useState, useEffect } from 'react';
import type { RefObject } from 'react';
import type { Role, ConnectionStatus } from '../types';

interface Props {
  role: Role;
  connectionStatus: ConnectionStatus;
  selfVideoRef: RefObject<HTMLVideoElement>;
  remoteVideoRef: RefObject<HTMLVideoElement>;
}

export default function VideoArea({ role, connectionStatus, selfVideoRef, remoteVideoRef }: Props) {
  const [hasStream, setHasStream] = useState(false);

  // 挂载时检查是否已有流 + 后续监听 loadedmetadata
  useEffect(() => {
    const video = role === 'viewer' ? remoteVideoRef.current : selfVideoRef.current;
    if (!video) return;

    if (video.srcObject) setHasStream(true);

    const onLoaded = () => setHasStream(true);
    video.addEventListener('loadedmetadata', onLoaded);
    return () => video.removeEventListener('loadedmetadata', onLoaded);
  }, [role, selfVideoRef, remoteVideoRef]);

  // 观众端等待文案根据连接状态变化
  const waitingText = connectionStatus === 'connected'
    ? '正在等待主播开播...'
    : connectionStatus === 'connecting'
      ? '正在连接...'
      : connectionStatus === 'failed'
        ? '连接失败，请重试'
        : '正在连接...';

  if (role === 'viewer') {
    return (
      <div className="video-area">
        <video ref={remoteVideoRef} className="video-main" autoPlay playsInline />
        <div className={`video-placeholder ${hasStream ? 'hidden' : ''}`}>
          <div className="icon">📡</div>
          <p>{hasStream ? '' : waitingText}</p>
        </div>
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
    </div>
  );
}