/*
 * Spoken instructions using a voice installed on the device. Some browsers' default voices
 * are streamed from the cloud; those are skipped, as this app runs offline. Starts muted;
 * turning it on is remembered on this device.
 */

const STORAGE_KEY = 'maps.voice'

/** Muted unless voice was turned on before, on this device */
export function loadMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'on'
  } catch {
    return true // storage blocked
  }
}

export function storeMuted(muted: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, muted ? 'off' : 'on')
  } catch {
    // Storage blocked: the choice just won't be remembered
  }
}

export function say(text: string) {
  if (!('speechSynthesis' in window)) return
  const language = navigator.language.slice(0, 2)
  const voices = speechSynthesis.getVoices().filter((voice) => voice.localService)
  const voice =
    voices.find((v) => v.lang.startsWith(language)) ?? voices.find((v) => v.lang.startsWith('en'))
  // No offline voice: stay quiet rather than reach for a cloud one
  if (speechSynthesis.getVoices().length && !voice) return

  const utterance = new SpeechSynthesisUtterance(text)
  if (voice) utterance.voice = voice
  speechSynthesis.cancel() // the latest instruction matters more than finishing the last
  speechSynthesis.speak(utterance)
}
