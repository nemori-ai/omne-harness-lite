import { createHash } from 'node:crypto'

export const modelViewPrefix = (tenant: string, session: string): string =>
  `${createHash('sha256').update(tenant).digest('hex').slice(0, 16)}/${session}/`
