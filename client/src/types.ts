export interface ChatMessage {
  id: string;
  nickname: string;
  type: 'text' | 'image';
  content: string;
  timestamp: number;
}

export interface WallMessage {
  id: string;
  nickname: string;
  content: string;
  emoji: string;
  timestamp: number;
}

export interface RoomState {
  streamer: { nickname: string } | null;
  viewers: number;
  streaming: boolean;
}

export type Role = 'streamer' | 'viewer' | null;
export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'failed' | 'disconnected';

// ── WebRTC 信令类型 ──
export interface OfferPayload {
  viewerId: string;
  offer: RTCSessionDescriptionInit;
}
export interface AnswerPayload {
  viewerId: string;
  answer: RTCSessionDescriptionInit;
}
export interface IceCandidatePayload {
  viewerId: string;
  candidate: RTCIceCandidateInit;
}
export interface IceAnswerPayload {
  candidate: RTCIceCandidateInit;
}
