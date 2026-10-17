// Small line icons, drawn at 20×20 in the current text colour

export type IconName =
  | 'recent'
  | 'home'
  | 'work'
  | 'saved'
  | 'category'
  | 'pin'
  | 'close'
  | 'back'
  | 'user'
  | 'search'
  | 'directions'
  | 'start'
  | 'phone'
  | 'globe'
  | 'walk'
  | 'bike'
  | 'transit'
  | 'car'
  | 'download'
  | 'copy'
  | 'check'
  | 'layers'
  | 'navigate'
  | 'volume'
  | 'muted'
  | 'locate'

const PATHS: Record<IconName, string> = {
  recent: 'M10 3a7 7 0 1 1 0 14a7 7 0 0 1 0-14M10 6v4l3 2',
  home: 'M3.5 9.5L10 4l6.5 5.5M5.5 8v8h9V8M8.5 16v-4h3v4',
  work: 'M3.5 7h13v9h-13zM7.5 7V5h5v2M3.5 11h13',
  saved: 'M10 3.5l2 4.2l4.5.6l-3.3 3.1l.8 4.5L10 13.7l-4 2.2l.8-4.5l-3.3-3.1l4.5-.6z',
  category: 'M8.5 3.5a5 5 0 1 1 0 10a5 5 0 0 1 0-10M12.2 12.2L16.5 16.5',
  pin: 'M10 17s-5-4.6-5-8.5a5 5 0 0 1 10 0C15 12.4 10 17 10 17M10 6.5a2 2 0 1 1 0 4a2 2 0 0 1 0-4',
  close: 'M5 5l10 10M15 5L5 15',
  back: 'M12 4l-6 6l6 6',
  user: 'M10 4a3 3 0 1 1 0 6a3 3 0 0 1 0-6M4.5 16.5c.8-2.8 3-4 5.5-4s4.7 1.2 5.5 4',
  search: 'M8.5 3.5a5 5 0 1 1 0 10a5 5 0 0 1 0-10M12.2 12.2L16.5 16.5',
  directions: 'M10 2.5L17.5 10L10 17.5L2.5 10zM8 12.5V9.5h4.5M10.5 7.5l2 2l-2 2',
  start: 'M5.5 17V3.5M5.5 4h9l-2 3l2 3h-9',
  phone: 'M6.5 3.5l2 3.5l-1.5 1.5a8 8 0 0 0 4.5 4.5l1.5-1.5l3.5 2l-1 2.5c-6.5 0-11.5-5-11.5-11.5z',
  globe:
    'M10 3a7 7 0 1 1 0 14a7 7 0 0 1 0-14M3 10h14M10 3c-2.5 3.5-2.5 10.5 0 14M10 3c2.5 3.5 2.5 10.5 0 14',
  walk: 'M10.5 3.2a1.3 1.3 0 1 1 0 2.6a1.3 1.3 0 0 1 0-2.6M9.5 7.5l-2.5 3M9.5 7.5l2.5 1.5l1.5 2M9.5 7.5l-.5 4l2.5 2.5l.5 3M9 11.5l-2 5',
  bike: 'M5.5 10.5a3 3 0 1 1 0 6a3 3 0 0 1 0-6M14.5 10.5a3 3 0 1 1 0 6a3 3 0 0 1 0-6M5.5 13.5l3-6h4.5l1.5 6M8.5 7.5l2.5 6h3.5M7.5 5.5h2.5',
  transit: 'M5.5 3.5h9v10.5h-9zM5.5 10h9M7.5 16.5l-1.5 1.5M12.5 16.5l1.5 1.5M7.5 12v.1M12.5 12v.1',
  car: 'M3.5 13v-3l2-4.5h9l2 4.5v3zM3.5 13v2h2.5v-2M14 13v2h2.5v-2M3.5 10h13M6.5 11.5v.1M13.5 11.5v.1',
  download: 'M10 3.5v9M6 8.5l4 4l4-4M4 15.5h12',
  copy: 'M7.5 7.5h8v9h-8zM12.5 7.5v-4h-8v9h3',
  check: 'M4.5 10.5l3.5 3.5l7.5-8',
  layers: 'M10 3l7 3.8l-7 3.8l-7-3.8zM3 10.4l7 3.8l7-3.8M3 13.8l7 3.8l7-3.8',
  navigate: 'M10 2.5l6 14.5l-6-3.5l-6 3.5z',
  volume: 'M3.5 8h3l4-3.5v11l-4-3.5h-3zM13.5 7.5a3.5 3.5 0 0 1 0 5M15.5 5a7 7 0 0 1 0 10',
  muted: 'M3.5 8h3l4-3.5v11l-4-3.5h-3zM13.5 7.5l4 5M17.5 7.5l-4 5',
  locate:
    'M10 2.5v3M10 14.5v3M2.5 10h3M14.5 10h3M10 6a4 4 0 1 1 0 8a4 4 0 0 1 0-8M10 9a1 1 0 1 1 0 2a1 1 0 0 1 0-2',
}

export function Icon({ name, className = 'icon' }: { name: IconName; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" aria-hidden="true">
      <path
        d={PATHS[name]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
