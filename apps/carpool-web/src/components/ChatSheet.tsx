type Props = {
  open: boolean;
  onClose: () => void;
};

export function ChatSheet({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="chat-sheet" data-testid="chat-sheet" role="dialog" aria-label="แชท">
      <div className="chat-sheet-head">
        <button className="nav-link tap-target" type="button" onClick={onClose}>
          ปิด
        </button>
        <span className="chat-sheet-title">แชทกับคนขับ</span>
        <button className="nav-link tap-target" type="button" onClick={onClose}>
          ย่อ
        </button>
      </div>
      <div className="chat-sheet-body">
        <p>แชท (เฟสถัดไป) — บนมือถือเป็นชีตเต็มจอ ตาม M-B17</p>
      </div>
      <form
        className="chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <input className="tap-target" placeholder="พิมพ์ข้อความ…" aria-label="ข้อความ" disabled />
        <button className="btn tap-target" type="submit" disabled>
          ส่ง
        </button>
      </form>
    </div>
  );
}
