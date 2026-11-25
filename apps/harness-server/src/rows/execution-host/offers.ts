import type { Context } from '@deepseek-ai/cordis'

const offers = new WeakMap<Context, ReadonlySet<string>>()

/** The facilities the host row of this tree now offers; undefined while no host row is loaded. */
export const hostOffers = (ctx: Context): ReadonlySet<string> | undefined => offers.get(ctx.root)

/** Records what the host row offers for as long as the row is loaded. */
export function recordHostOffers(ctx: Context, facilities: readonly string[]): void {
  ctx.effect(() => {
    const offered = new Set(facilities)
    offers.set(ctx.root, offered)
    return () => {
      if (offers.get(ctx.root) === offered) offers.delete(ctx.root)
    }
  }, 'execution-host.offers')
}

const restricted = new WeakSet<Context>()

/** HS-53: true while the row of the restricted execution domain is loaded in this tree. */
export const programOffered = (ctx: Context): boolean => restricted.has(ctx.root)

export function recordProgramOffer(ctx: Context): void {
  ctx.effect(() => {
    restricted.add(ctx.root)
    return () => {
      restricted.delete(ctx.root)
    }
  }, 'execution-program.offer')
}
