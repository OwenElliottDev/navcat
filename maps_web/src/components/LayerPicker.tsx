import { useRef, useState } from 'react'
import { useClickOutside } from '../hooks/useClickOutside'
import { BASE_MAPS, OVERLAYS, ROAD_LABELS, type MapLook, type Overlay } from '../map/mapStyles'
import { Dialog } from './Dialog'
import { Icon } from './icons'
import './LayerPicker.css'

const TITLE = 'Map type and overlays'

interface LayerPickerProps {
  look: MapLook
  onChange: (look: MapLook) => void
  /** The topo map needs terrain tiles, built by the terrain-build job */
  hasTerrain: boolean
  /** Opens as a sheet over everything (phones) rather than beside the button */
  asSheet?: boolean
}

/** The map-layers button: pick a map type and switch overlays on and off. */
export function LayerPicker({ look, onChange, hasTerrain, asSheet }: LayerPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, isOpen, () => setIsOpen(false))

  function toggleOverlay(overlay: Overlay) {
    const overlays = look.overlays.includes(overlay)
      ? look.overlays.filter((o) => o !== overlay)
      : [...look.overlays, overlay]
    onChange({ ...look, overlays })
  }

  const options = (
    <>
      <p className="layer-picker__heading">Map type</p>
      <div className="layer-picker__bases" role="radiogroup" aria-label="Map type">
        {BASE_MAPS.filter((base) => base.id !== 'topo' || hasTerrain).map((base) => (
          <button
            key={base.id}
            type="button"
            role="radio"
            aria-checked={look.base === base.id}
            className="layer-picker__base"
            onClick={() => onChange({ ...look, base: base.id })}
          >
            <span className={`layer-picker__swatch layer-picker__swatch--${base.id}`} />
            {base.label}
          </button>
        ))}
      </div>

      <p className="layer-picker__heading">Overlays</p>
      {OVERLAYS.map((overlay) => (
        <label key={overlay.id} className="layer-picker__overlay">
          <input
            type="checkbox"
            checked={look.overlays.includes(overlay.id)}
            onChange={() => toggleOverlay(overlay.id)}
          />
          <span className={`layer-picker__line layer-picker__line--${overlay.id}`} />
          <span className="layer-picker__overlay-text">
            {overlay.label}
            {overlay.hint && <span className="layer-picker__hint">{overlay.hint}</span>}
          </span>
        </label>
      ))}

      <p className="layer-picker__heading">Road labels</p>
      <div className="layer-picker__road-labels" role="radiogroup" aria-label="Road labels">
        {ROAD_LABELS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            className="chip"
            aria-checked={look.roadLabels === option.id}
            onClick={() => onChange({ ...look, roadLabels: option.id })}
          >
            {option.label}
          </button>
        ))}
      </div>
    </>
  )

  return (
    <div ref={ref} className="layer-picker">
      <button
        type="button"
        className="layer-picker__button"
        aria-label={TITLE}
        aria-expanded={isOpen}
        title={TITLE}
        onClick={() => setIsOpen(!isOpen)}
      >
        <Icon name="layers" />
      </button>

      {isOpen &&
        (asSheet ? (
          <Dialog title={TITLE} className="layer-sheet" asSheet onClose={() => setIsOpen(false)}>
            <div className="layer-sheet__body">{options}</div>
          </Dialog>
        ) : (
          <div className="layer-picker__panel glass" role="dialog" aria-label={TITLE}>
            {options}
          </div>
        ))}
    </div>
  )
}
