import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function joinFacts(facts: ReadonlyArray<string | null | undefined>): string | undefined {
  const present = facts.filter(
    (fact): fact is string => typeof fact === 'string' && fact.trim() !== '',
  )
  return present.length === 0 ? undefined : present.join(' · ')
}
