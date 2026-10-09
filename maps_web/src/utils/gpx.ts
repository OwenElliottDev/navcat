import type { LineString } from '../types'

const escapeXml = (text: string) =>
  text.replace(
    /[<>&'"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!,
  )

/** A route as a GPX track, with elevation when the route has it. */
export function toGpx(name: string, line: LineString): string {
  const points = line.coordinates
    .map(([lng, lat, ele]) => {
      const elevation = ele === undefined ? '' : `<ele>${ele.toFixed(1)}</ele>`
      return `      <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}">${elevation}</trkpt>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Nav Cat" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(name)}</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <trk>
    <name>${escapeXml(name)}</name>
    <trkseg>
${points}
    </trkseg>
  </trk>
</gpx>
`
}

/** "Walk: Flinders Street to Brunswick" -> "walk-flinders-street-to-brunswick" */
export function fileSlug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'route'
  )
}

/** Saves text as a file via the browser's download. */
export function downloadFile(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
