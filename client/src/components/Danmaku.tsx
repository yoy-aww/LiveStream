import { useState, useEffect, useRef, useCallback } from 'react';
import type { ChatMessage } from '../types';

interface Bullet {
  id: string;
  nickname: string;
  content: string;
  color: string;
  row: number;       // 0-9 行
  duration: number;  // 飞行秒数
}

interface Props {
  messages: ChatMessage[];
}

const COLORS = ['#ffffff', '#ffeb3b', '#ff5722', '#4caf50', '#2196f3', '#e91e63', '#9c27b0', '#00bcd4'];
const MAX_BULLETS = 35;

function hashColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}

export default function Danmaku({ messages }: Props) {
  const [enabled, setEnabled] = useState(true);
  const [bullets, setBullets] = useState<Bullet[]>([]);
  const seenRef = useRef<Set<string>>(new Set());

  // 新消息 → 生成弹幕
  useEffect(() => {
    if (!enabled) return;
    const newOnes: Bullet[] = [];

    for (const msg of messages) {
      const key = `${msg.timestamp}-${msg.id}`;
      if (seenRef.current.has(key)) continue;
      seenRef.current.add(key);

      if (msg.type !== 'text') continue;
      const text = msg.content.slice(0, 30);
      if (!text) continue;

      newOnes.push({
        id: key,
        nickname: msg.nickname,
        content: text,
        color: hashColor(msg.nickname),
        row: Math.floor(Math.random() * 10),
        duration: 7 + Math.random() * 5, // 7~12秒
      });
    }

    if (newOnes.length > 0) {
      setBullets((prev) => {
        const merged = [...prev, ...newOnes];
        return merged.length > MAX_BULLETS ? merged.slice(merged.length - MAX_BULLETS) : merged;
      });
    }
  }, [messages, enabled]);

  // 飞行完毕后自动清除
  const removeBullet = useCallback((id: string) => {
    setBullets((prev) => prev.filter((b) => b.id !== id));
  }, []);

  if (!enabled) {
    return (
      <div className="danmaku-layer">
        <button className="danmaku-toggle" onClick={() => setEnabled(true)}>
          🔕 弹幕已关闭
        </button>
      </div>
    );
  }

  return (
    <div className="danmaku-layer">
      <button className="danmaku-toggle" onClick={() => setEnabled(false)}>
        🔔 弹幕
      </button>
      {bullets.map((b) => (
        <span
          key={b.id}
          className="danmaku-bullet"
          style={{
            color: b.color,
            animationDuration: `${b.duration}s`,
            top: `${b.row * 10}%`,
          }}
          onAnimationEnd={() => removeBullet(b.id)}
        >
          {b.nickname}: {b.content}
        </span>
      ))}
    </div>
  );
}
