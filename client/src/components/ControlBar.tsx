import type { Role } from '../types';

interface Props {
  role: Role;
  onStartStreaming: () => void;
  onStopStreaming: () => void;
}

export default function ControlBar({ role, onStartStreaming, onStopStreaming }: Props) {
  if (role !== 'streamer') return null;

  return (
    <div className="control-bar">
      <button className="ctrl-btn active" onClick={onStartStreaming}>
        <span className="icon">▶️</span> 开始直播
      </button>
      <button className="ctrl-btn danger" onClick={onStopStreaming}>
        <span className="icon">⏹</span> 停止直播
      </button>
    </div>
  );
}