import { useState } from 'react'
import './AdditionalOptions.css'

interface AdditionalOptionsProps {
  avoidSteepHills: boolean
  onAvoidSteepHillsChange: (avoid: boolean) => void
}

/** Less-used settings for a walk or ride, folded away until wanted. */
export function AdditionalOptions({
  avoidSteepHills,
  onAvoidSteepHillsChange,
}: AdditionalOptionsProps) {
  // Starts open when something in it is on, so it's not forgotten
  const [open, setOpen] = useState(avoidSteepHills)

  return (
    <details
      className="additional-options"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="additional-options__summary">Additional options</summary>
      <label className="additional-options__row">
        <span>Avoid steep hills</span>
        <button
          type="button"
          role="switch"
          className="switch"
          aria-checked={avoidSteepHills}
          onClick={() => onAvoidSteepHillsChange(!avoidSteepHills)}
        />
      </label>
    </details>
  )
}
