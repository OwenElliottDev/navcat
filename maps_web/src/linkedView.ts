import { parseLink } from './utils/links'

/** The view a shared link opened the app at, if it was opened from one; read once as it loads. */
export const linkedView = parseLink(new URL(location.href))
