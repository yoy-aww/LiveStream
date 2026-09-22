import { useState } from 'react';

interface Props {
  onLogin: (nickname: string) => void;
}

export default function LoginScreen({ onLogin }: Props) {
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length >= 1 && trimmed.length <= 16) {
      onLogin(trimmed);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">🎬</div>
        <h1 className="login-title">WebRTC 直播</h1>
        <p className="login-sub">输入昵称开始直播或观看</p>
        <form onSubmit={handleSubmit}>
          <input
            className="login-input"
            placeholder="输入你的昵称 (1-16字)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={16}
            autoFocus
          />
          <button className="login-btn" type="submit" disabled={name.trim().length < 1}>
            进入直播间
          </button>
        </form>
        <p className="login-hint">第一个进入的是主播，后续进入的是观众</p>
      </div>
    </div>
  );
}