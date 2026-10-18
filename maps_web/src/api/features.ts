import type { Features } from '../types'
import { http } from './http'

/** What this server lets people do (maps_backend) */
export async function getFeatures(): Promise<Features> {
  const { data } = await http.get<Features>('/features')
  return data
}
