export const SIZE_TIERS = ['small', 'medium', 'large', 'reading'] as const

export type SizeTier = (typeof SIZE_TIERS)[number]

export type SizeStep = 'larger' | 'smaller' | 'standard'

export type SizeKeyPlatform = 'mac' | 'other'

export interface SizeRoot {
  readonly dataset: { size?: string }
}

export interface SizeControllerInput {
  readonly read: () => string | null | undefined
  readonly write: (tier: SizeTier) => void
  readonly root?: SizeRoot
}

export interface SizeController {
  current(): SizeTier
  set(tier: SizeTier): void
  adopt(tier: SizeTier): void
  subscribe(listener: (tier: SizeTier) => void): () => void
}

const STANDARD: SizeTier = 'medium'

const tierOf = (stored: string | null | undefined): SizeTier =>
  SIZE_TIERS.find(tier => tier === stored) ?? STANDARD

export function stepSize(tier: SizeTier, step: SizeStep): SizeTier {
  if (step === 'standard') return STANDARD
  const at = SIZE_TIERS.indexOf(tier) + (step === 'larger' ? 1 : -1)
  return SIZE_TIERS[Math.min(Math.max(at, 0), SIZE_TIERS.length - 1)] ?? STANDARD
}

class PageSizeController implements SizeController {
  private readonly write: (tier: SizeTier) => void
  private readonly root: SizeRoot
  private readonly listeners = new Set<(tier: SizeTier) => void>()
  private tier: SizeTier

  public constructor(input: SizeControllerInput) {
    this.write = input.write
    this.root = input.root ?? document.documentElement
    this.tier = tierOf(input.read())
    this.paint()
  }

  public current(): SizeTier {
    return this.tier
  }

  public set(tier: SizeTier): void {
    this.adopt(tier)
    this.write(tier)
  }

  public adopt(tier: SizeTier): void {
    const changed = tier !== this.tier
    this.tier = tier
    this.paint()
    if (changed) for (const listener of this.listeners) listener(tier)
  }

  public subscribe(listener: (tier: SizeTier) => void): () => void {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  private paint(): void {
    if (this.tier === STANDARD) delete this.root.dataset.size
    else this.root.dataset.size = this.tier
  }
}

export function createSizeController(input: SizeControllerInput): SizeController {
  return new PageSizeController(input)
}
