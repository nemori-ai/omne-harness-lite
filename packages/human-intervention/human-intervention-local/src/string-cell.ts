import { z } from 'zod'
import { canonical } from './encoding.ts'

export function stringCell(value: string): string {
  return canonical(value)
}

export function readStringCell(cell: unknown): string {
  return z.string().parse(JSON.parse(z.string().parse(cell)))
}
