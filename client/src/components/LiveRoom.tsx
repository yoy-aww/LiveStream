import { useState, useRef } from 'react';
import type { RefObject } from 'react';
import type { ChatMessage, RoomState, Role, ConnectionStatus } from '../types';
import Topbar from './Topbar';
import VideoArea from './VideoArea';
import ChatPanel from './ChatPanel';
import ControlBar from './ControlBar';
import ToastContainer from './ToastContainer';

interface Props {
  socket: import('socket.io-client').Socket;
  role: Role;
  roomState: RoomState;
  nickname: string;
  chatMessages: ChatMessage[];
  toasts: { id: number; text: string }[];
  connectionStatus: ConnectionStatus;
  selfVideoRef: RefObject<HTMLVideoElement>;
  remoteVideoRef: RefObject<HTMLVideoElement>;
  onSendChat: (text: string) => void;
  onSendImage: (url: string) => void;
  onStartStreaming: () => void;
  onStopStreaming: () => void;
}

export default function LiveRoom(props: Props) {
  // 手机端默认折叠聊天，让视频区域占满
  const isMobile = window.innerWidth <= 768 || 'ontouchstart' in window;
  const [chatCollapsed, setChatCollapsed] = useState(isMobile);

  return (
    <div className="live-room">
      <div className="main-area">
        <Topbar role={props.role} roomState={props.roomState} nickname={props.nickname} connectionStatus={props.connectionStatus} />
        <VideoArea role={props.role} connectionStatus={props.connectionStatus} selfVideoRef={props.selfVideoRef} remoteVideoRef={props.remoteVideoRef} />
        <ControlBar role={props.role} onStartStreaming={props.onStartStreaming} onStopStreaming={props.onStopStreaming} />
      </div>
      <ChatPanel
        messages={props.chatMessages}
        onSendChat={props.onSendChat}
        onSendImage={props.onSendImage}
        collapsed={chatCollapsed}
        onToggle={() => setChatCollapsed(!chatCollapsed)}
      />
      <ToastContainer toasts={props.toasts} />
    </div>
  );
}