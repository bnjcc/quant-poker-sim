export function QueenDiamondLogo({ className = "" }) {
  return (
    <svg
      className={`queen-diamond-logo ${className}`}
      viewBox="0 0 36 48"
      fill="none"
      aria-hidden="true"
    >
      <rect
        className="queen-diamond-frame"
        x="2.5"
        y="2.5"
        width="31"
        height="43"
        rx="4.5"
      />
      <rect
        className="queen-diamond-inner"
        x="5.25"
        y="5.25"
        width="25.5"
        height="37.5"
        rx="2.5"
      />
      <text className="queen-diamond-letter" x="6.2" y="32.2">
        Q
      </text>
      <path
        className="queen-diamond-pip"
        d="m27.3 34.3 2 2.15-2 2.15-2-2.15 2-2.15Z"
      />
    </svg>
  );
}
