import './Stars.css'

/** Five stars, filled to `value` (can be fractional, e.g. 4.5). */
export function Stars({ value }: { value: number }) {
  return (
    <span className="stars" role="img" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      <span className="stars__empty">★★★★★</span>
      <span className="stars__filled" style={{ width: `${(value / 5) * 100}%` }}>
        ★★★★★
      </span>
    </span>
  )
}

/** Picking a rating from 1 to 5. */
export function StarInput({
  value,
  onChange,
}: {
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="star-input" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={n === value}
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
          className={n <= value ? 'star-input__star star-input__star--on' : 'star-input__star'}
          onClick={() => onChange(n)}
        >
          ★
        </button>
      ))}
    </div>
  )
}
