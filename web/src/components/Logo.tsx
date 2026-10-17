/** The Shepherd mark: a leaning shepherd's crook, drawn in the current text colour. */
export function Logo({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <g transform="translate(32 32) scale(.9) rotate(10) translate(-32 -32)">
        <path d="M44 58V26a16 16 0 1 0-32 0v9" />
      </g>
    </svg>
  )
}
