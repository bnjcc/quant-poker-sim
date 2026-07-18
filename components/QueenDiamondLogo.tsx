export function QueenDiamondLogo({ className = "" }: { className?: string }) {
  return (
    <svg className={`queen-diamond-logo ${className}`} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path className="queen-diamond-frame" d="M24 2.8 44.5 24 24 45.2 3.5 24 24 2.8Z" />
      <path className="queen-diamond-inner" d="M24 8.7 38.7 24 24 39.3 9.3 24 24 8.7Z" />
      <text className="queen-diamond-letter" x="13.2" y="32.2">Q</text>
      <path className="queen-diamond-pip" d="m34.7 30.4 3 3.1-3 3.1-3-3.1 3-3.1Z" />
    </svg>
  );
}
