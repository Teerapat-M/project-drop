type Props = {
  onClick: () => void;
};

export function ChatBubble({ onClick }: Props) {
  return (
    <button
      type="button"
      className="chat-bubble tap-target"
      data-testid="chat-bubble"
      aria-label="เปิดแชทกับเพื่อนร่วมทาง"
      onClick={onClick}
    >
      <img src="/assets/speech_balloon_3d.png" alt="" width={40} height={40} />
    </button>
  );
}
