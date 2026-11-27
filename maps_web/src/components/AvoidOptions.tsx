import './AvoidOptions.css'

export interface AvoidChip {
  id: string
  label: string
  isOn: boolean
  onToggle: () => void
}

/** Things for a trip to avoid, like tolls and traffic lights, or steep hills. */
export function AvoidOptions({ options }: { options: AvoidChip[] }) {
  if (!options.length) return null

  return (
    <div className="avoid-options" role="group" aria-label="Avoid">
      <span className="avoid-options__label">Avoid</span>
      {options.map(({ id, label, isOn, onToggle }) => (
        <button key={id} type="button" className="chip" aria-pressed={isOn} onClick={onToggle}>
          {label}
        </button>
      ))}
    </div>
  )
}
