import type { RoomState, Role, ConnectionStatus } from '../types';

const statusText: Record<ConnectionStatus, string> = {
  idle: '等待连接',
  connecting: '连接中...',
  connected: '已连接',
  failed: '连接失败',
  disconnected: '已断开',
};

interface Props {
  role: Role;
  roomState: RoomState;
  nickname: string;
  connectionStatus: ConnectionStatus;
}

export default function Topbar({ role, roomState, nickname, connectionStatus }: Props) {
  return (
    <div className="topbar">
      <div className="topbar-left">
        <span className="topbar-logo">🎬 直播</span>
        {role === 'streamer' && roomState.streaming && (
          <span className="live-badge"><span className="dot" />LIVE</span>
        )}
        {connectionStatus !== 'idle' && (
          <span className={`conn-badge conn-${connectionStatus}`}>{statusText[connectionStatus]}</span>
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