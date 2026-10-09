/**
 * Shrinks a photo to at most `maxSize` pixels across before uploading, so phone photos
 * aren't sent at full size. Also turns formats the server can't read (like iPhone HEIC,
 * which the browser can) into JPEG. The server re-encodes it again and strips metadata.
 */
export async function shrinkPhoto(file: File, maxSize = 2048): Promise<Blob> {
  // Applies the photo's rotation flag (imageOrientation defaults to "from-image")
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not read that photo'))),
      'image/jpeg',
      0.9,
    ),
  )
}
