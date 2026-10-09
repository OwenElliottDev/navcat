import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { ControlPosition, IControl } from 'maplibre-gl'
import { useMap } from './MapContext'

/** A MapLibre control whose content React renders, so it sits with the other map controls. */
class PortalControl implements IControl {
  readonly container = document.createElement('div')

  constructor() {
    this.container.className = 'maplibregl-ctrl'
  }

  onAdd() {
    return this.container
  }

  onRemove() {
    this.container.remove()
  }
}

export function MapControl({
  position,
  children,
}: {
  position: ControlPosition
  children: ReactNode
}) {
  const map = useMap()
  const [control] = useState(() => new PortalControl())

  useEffect(() => {
    if (!map) return
    map.addControl(control, position)
    return () => {
      map.removeControl(control)
    }
  }, [map, control, position])

  return createPortal(children, control.container)
}
