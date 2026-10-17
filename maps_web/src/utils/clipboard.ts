/** Copies text. Uses the clipboard API where the browser allows it (HTTPS or localhost). */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text)
    return
  }
  // Plain http on the local network: the older copy command still works there
  const focused = document.activeElement
  const field = document.createElement('textarea')
  field.value = text
  field.setAttribute('readonly', '')
  field.style.position = 'fixed'
  field.style.opacity = '0'
  document.body.append(field)
  field.select()
  const copied = document.execCommand('copy')
  field.remove()
  // Selecting the field took focus; give it back (e.g. to a menu that stays open)
  if (focused instanceof HTMLElement) focused.focus()
  if (!copied) throw new Error('Copy failed')
}
