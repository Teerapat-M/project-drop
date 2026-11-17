type Props = {
  open: boolean;
  onClose: () => void;
};

export function ChatSheet({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="chat-sheet" data-testid="chat-sheet" role="dialog" aria-label="แชท">
      <div className="chat-sheet-head">
        <span style={{ marginRight: 'auto' }}>แชทกับคนขับ</span>
        <button className="btn ghost tap-target" type="button" onClick={onClose}>
          ปิด
        </button>
      </div>
      <div className="chat-sheet-body">
        <p>แชท (เฟสถัดไป) — บนมือถือเป็นชีตเต็มจอ ตาม B17 / B01m</p>
      </div>
    </div>
  );
}
