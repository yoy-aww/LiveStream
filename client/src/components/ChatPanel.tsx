import { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '../types';

interface Props {
  messages: ChatMessage[];
  onSendChat: (text: string) => void;
  onSendImage: (url: string) => void;
  collapsed: boolean;
  onToggle: () => void;
}

export default function ChatPanel({ messages, onSendChat, onSendImage, collapsed, onToggle }: Props) {
  const [text, setText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!collapsed) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, collapsed]);

  const handleSend = () => {
    if (text.trim()) {
      onSendChat(text);
      setText('');
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 200 * 1024) {
      alert('图片超过 200KB，请压缩后发送');
      e.target.value = '';
      return;
    }
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

  // 折叠状态：只显示一个窄条
  if (collapsed) {
    return (
      <div className="chat-panel collapsed">
        <button className="chat-toggle-bar" onClick={onToggle}>
          <span className="chat-toggle-icon">💬</span>
          <span className="chat-toggle-text">聊天</span>
          {messages.length > 0 && <span className="chat-toggle-count">{messages.length}</span>}
        </button>
      </div>
    );
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <span className="chat-header-title">💬 弹幕聊天</span>
        <button className="chat-collapse-btn" onClick={onToggle} title="收起聊天">✕</button>
      </div>
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