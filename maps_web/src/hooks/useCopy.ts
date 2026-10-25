import { useEffect, useRef, useState } from 'react'
import type { IconName } from '../components/icons'
import { copyText } from '../utils/clipboard'

/**
 * Copies text, and for a moment after the latest copy says how it went: an icon (a tick once
 * copied), a tooltip and a message for screen readers. `label` names what's copied; `idle` is
 * the icon and tooltip the rest of the time.
 */
export function useCopy(
  label: string,
  idle: { icon: IconName; title: string } = { icon: 'copy', title: `Copy ${label}` },
) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const show = (outcome: 'copied' | 'failed') => {
    clearTimeout(timer.current)
    setState(outcome)
    timer.current = setTimeout(() => setState('idle'), 1500)
  }

  const icon: IconName = state === 'copied' ? 'check' : idle.icon
  return {
    copied: state === 'copied',
    copy: (text: string) =>
      copyText(text).then(
        () => show('copied'),
        () => show('failed'),
      ),
    icon,
    title: state === 'failed' ? 'Couldn’t copy' : idle.title,
    message: state === 'copied' ? `${label} copied` : state === 'failed' ? 'Couldn’t copy' : '',
  }
}
