import { Icon, type IconName } from './icons'

interface ActionButtonProps {
  icon: IconName
  label: string
  primary?: boolean
  pressed?: boolean
  /** Renders a link instead of a button, e.g. tel: or a website */
  href?: string
  onClick?: () => void
}

/** A round icon with a label under it, as on a place card. */
export function ActionButton({ icon, label, primary, pressed, href, onClick }: ActionButtonProps) {
  const className = ['action', primary && 'action--primary'].filter(Boolean).join(' ')
  const content = (
    <>
      <span className="action__circle">
        <Icon name={icon} />
      </span>
      <span className="action__label">{label}</span>
    </>
  )

  if (href) {
    const external = href.startsWith('http')
    return (
      <a
        className={className}
        href={href}
        {...(external && { target: '_blank', rel: 'noopener noreferrer' })}
      >
        {content}
      </a>
    )
  }
  return (
    <button type="button" className={className} aria-pressed={pressed} onClick={onClick}>
      {content}
    </button>
  )
}
