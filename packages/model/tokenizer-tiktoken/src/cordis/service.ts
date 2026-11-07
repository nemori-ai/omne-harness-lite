import { Service, type Context } from '@deepseek-ai/cordis'
import type { TiktokenExecutor } from '../executor-types.ts'

export type ModelTokenizers = Pick<TiktokenExecutor, 'acquire' | 'snapshot'>

/** @owner packages/model/tokenizer-tiktoken */
export abstract class ModelTokenizersService extends Service implements ModelTokenizers {
  static readonly provide = 'modelTokenizers'

  constructor(ctx: Context) {
    super(ctx, ModelTokenizersService.provide)
  }

  abstract readonly acquire: ModelTokenizers['acquire']
  abstract readonly snapshot: ModelTokenizers['snapshot']
}

export const modelTokenizersKey = ModelTokenizersService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    modelTokenizers: ModelTokenizersService
  }
}
