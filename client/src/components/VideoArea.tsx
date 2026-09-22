import { useState, useEffect, useRef, useCallback } from 'react';
import type { Role } from '../types';

interface Props {
  role: Role;
}

export default function VideoArea({ role }: Props) {
  const [hasStream, setHasStream] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const selfVideoRef = useRef<HTMLVideoElement>(null);

  // 主播端：检测 selfVideo.srcObject 是否被外部设置（由 App 的 startStreaming 设置）
  useEffect(() => {
    if (role !== 'streamer') return;
    const video = selfVideoRef.current;
    if (!video) return;

    let timer: ReturnType<typeof setInterval>;
    const check = () => {
      if (video.srcObject) {
        setHasStream(true);
        clearInterval(timer);
      }
    };
    timer = setInterval(check, 200);
    check();

    return () => clearInterval(timer);
  }, [role]);

  // 观众端：检测 remoteVideo.srcObject
  useEffect(() => {
    if (role !== 'viewer') return;
    const video = videoRef.current;
    if (!video) return;

    let timer: ReturnType<typeof setInterval>;
    const check = () => {
      if (video.srcObject) {
        setHasStream(true);
        clearInterval(timer);
      }
    };
    timer = setInterval(check, 200);
    check();

    return () => clearInterval(timer);
  }, [role]);

  if (role === 'viewer') {
    return (
      <div className="video-area">
        <video ref={videoRef} id="remoteVideo" className="video-main" autoPlay playsInline />
        <div className={`video-placeholder ${hasStream ? 'hidden' : ''}`}>
          <div className="icon">📡</div>
          <p>{hasStream ? '' : '正在等待主播开播...'}</p>
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
        <video ref={selfVideoRef} id="selfVideo" autoPlay playsInline muted />
      </div>
    </div>
  );
}