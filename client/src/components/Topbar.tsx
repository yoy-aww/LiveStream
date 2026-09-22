import type { RoomState, Role } from '../types';

interface Props {
  role: Role;
  roomState: RoomState;
  nickname: string;
}

export default function Topbar({ role, roomState, nickname }: Props) {
  return (
    <div className="topbar">
      <div className="topbar-left">
        <span className="topbar-logo">🎬 直播</span>
        {role === 'streamer' && roomState.streaming && (
          <span className="live-badge"><span className="dot" />LIVE</span>
        )}
      </div>
      <div className="topbar-right">
        <span className="viewer-count">
          👁 <span>{roomState.viewers}</span> 人观看
        </span>
        <div className="my-info">
          <div className="my-avatar">{nickname.charAt(0).toUpperCase()}</div>
          <span className="my-name">{nickname}</span>
        </div>
      </div>
    </div>
  );
}