import { useState, useEffect } from 'react';
import type { RefObject } from 'react';

interface Props {
  /** remote video ref (contains the audio track) */
  videoRef: RefObject<HTMLVideoElement>;
}

export default function AudioControl({ videoRef }: Props) {
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.8);

  // 同步 volume/muted 到 video 元素
  useEffect(() => {
    const v = videoRef.current;
    if (v) {
      v.volume = volume;
      v.muted = muted;
    }
  }, [volume, muted, videoRef]);

  return (
    <div className="audio-control">
      <button
        className="audio-btn"
        onClick={() => setMuted((m) => !m)}
        title={muted ? '取消静音' : '静音'}
      >
        {muted ? '🔇' : '🔊'}
      </button>
      <input
        type="range"
        className="audio-slider"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        onChange={(e) => setVolume(Number(e.target.value))}
        title="音量"
      />
      <span className="audio-vol-label">{Math.round(volume * 100)}%</span>
    </div>
  );
}
