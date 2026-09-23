import { useState } from 'react';
import type { WallMessage } from '../types';

interface Props {
  messages: WallMessage[];
  onSend: (content: string, emoji: string) => void;
}

const EMOJIS = ['❤️', '🎉', '👍', '🔥', '😂', '😍', '👏', '🫡'];

export default function ViewerWall({ messages, onSend }: Props) {
  const [text, setText] = useState('');
  const [activeEmoji, setActiveEmoji] = useState('❤️');

  const handleSend = () => {
    if (text.trim()) {
      onSend(text.trim(), activeEmoji);
      setText('');
    }
  };

  return (
    <div className="viewer-wall">
      <div className="wall-messages">
        {messages.map((m) => (
          <div key={m.id} className="wall-msg">
            <span className="wall-emoji">{m.emoji}</span>
            <span className="wall-name">{m.nickname}</span>
            <span className="wall-content">{m.content}</span>
          </div>
        ))}
        {messages.length === 0 && <div className="wall-empty">还没有观众上墙，快来抢首位！</div>}
      </div>
      <div className="wall-input-area">
        <div className="wall-emoji-picker">
          {EMOJIS.map((e) => (
            <button
              key={e}
              className={`emoji-btn ${activeEmoji === e ? 'active' : ''}`}
              onClick={() => setActiveEmoji(e)}
            >
              {e}
            </button>
          ))}
        </div>
        <input
          className="wall-input"
          placeholder="喊出你的应援..."
          value={text}
          maxLength={50}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        />
        <button className="wall-send-btn" onClick={handleSend}>上墙</button>
      </div>
    </div>
  );
}
