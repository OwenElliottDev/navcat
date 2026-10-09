// TileServer's style, cut down to a plain background: enough for MapLibre to load (and the
// app to recolour) without any tiles, fonts or sprites.
export const style = {
  version: 8,
  name: 'Basic preview (test)',
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#f2efe9' } }],
}
