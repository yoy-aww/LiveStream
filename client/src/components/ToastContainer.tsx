interface Props {
  toasts: { id: number; text: string }[];
}

export default function ToastContainer({ toasts }: Props) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className="toast">{t.text}</div>
      ))}
    </div>
  );
}