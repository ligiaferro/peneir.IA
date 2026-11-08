/**
 * Logo da peneir.IA (mesmo desenho de `app/icon.svg` e `docs/assets/logo.svg`).
 * Inline para não depender de requisição extra e acompanhar o tamanho do CSS.
 */
export function BrandMark() {
  return (
    <svg
      className="brand-mark"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="64" height="64" rx="16" fill="#1b7159" />
      <g transform="translate(-1 -2)">
        <rect x="15" y="19" width="7.5" height="33" rx="3.75" fill="#ffffff" />
        <circle cx="31" cy="31" r="9.25" fill="none" stroke="#ffffff" strokeWidth="7.5" />
        <circle cx="48" cy="40" r="4.5" fill="#d7ed76" />
      </g>
    </svg>
  );
}
