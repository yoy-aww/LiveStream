import { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '../types';

interface Props {
  messages: ChatMessage[];
  onSendChat: (text: string) => void;
  onSendImage: (url: string) => void;
}

export default function ChatPanel({ messages, onSendChat, onSendImage }: Props) {
  const [text, setText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (text.trim()) {
      onSendChat(text);
      setText('');
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onSendImage(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const colorFor = (name: string) => {
    const colors = ['#6c5ce7', '#00b894', '#e17055', '#0984e3', '#fdcb6e', '#e84393', '#00cec9'];
    let hash = 0;
    for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) | 0;
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className="chat-panel">
      <div className="chat-header">💬 弹幕聊天</div>
      <div className="chat-messages">
        {messages.map((msg) => (
          <div key={`${msg.timestamp}-${msg.id}`} className="chat-msg">
            <div className="chat-msg-avatar" style={{ background: colorFor(msg.nickname) }}>
              {msg.nickname.charAt(0).toUpperCase()}
            </div>
            <div className="chat-msg-body">
              <div className="chat-msg-name">{msg.nickname}</div>
              {msg.type === 'image' ? (
                <img className="chat-msg-img" src={msg.content} alt="图片" />
              ) : (
                <div className="chat-msg-content">{msg.content}</div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="chat-input-area">
        <input
          className="chat-input"
          placeholder="发送消息..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        />
        <input type="file" accept="image/*" ref={fileRef} style={{ display: 'none' }} onChange={handleFile} />
        <button className="img-btn" onClick={() => fileRef.current?.click()}>📷</button>
        <button className="send-btn" onClick={handleSend}>发送</button>
      </div>
    </div>
  );
}