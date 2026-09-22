import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import type { ChatMessage, RoomState, Role } from '../types';
import Topbar from './Topbar';
import VideoArea from './VideoArea';
import ChatPanel from './ChatPanel';
import ControlBar from './ControlBar';
import ToastContainer from './ToastContainer';

interface Props {
  socket: Socket;
  role: Role;
  roomState: RoomState;
  nickname: string;
  chatMessages: ChatMessage[];
  toasts: { id: number; text: string }[];
  onSendChat: (text: string) => void;
  onSendImage: (url: string) => void;
  onStartStreaming: () => void;
  onStopStreaming: () => void;
}

export default function LiveRoom(props: Props) {
  return (
    <div className="live-room">
      <div className="main-area">
        <Topbar role={props.role} roomState={props.roomState} nickname={props.nickname} />
        <VideoArea role={props.role} />
        <ControlBar role={props.role} onStartStreaming={props.onStartStreaming} onStopStreaming={props.onStopStreaming} />
      </div>
      <ChatPanel messages={props.chatMessages} onSendChat={props.onSendChat} onSendImage={props.onSendImage} />
      <ToastContainer toasts={props.toasts} />
    </div>
  );
}