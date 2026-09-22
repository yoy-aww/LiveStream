export interface ChatMessage {
  id: string;
  nickname: string;
  type: 'text' | 'image';
  content: string;
  timestamp: number;
}

export interface RoomState {
  streamer: { nickname: string } | null;
  viewers: number;
  streaming: boolean;
}

export interface PeerInfo {
  id: string;
  nickname: string;
}

export type Role = 'streamer' | 'viewer' | null;