import { Tokenizer } from '@huggingface/tokenizers'
import { Tiktoken } from 'js-tiktoken'
import { afterAll, vi } from 'vitest'

// Meters build their tokenizer once and keep it in a module variable. When test files share a
// worker without per-file isolation, an earlier file may already have loaded that meter module, so
// a module mock of the tokenizer package never reaches the cached instance. These recorders spy on
// the shared prototype instead, which every instance reaches whoever created it. Call them at the
// top level of a test file: the spy is installed while the file loads and removed when it ends.

/** Every text handed to a js-tiktoken encoder while the calling test file runs, in call order. */
export function recordTiktokenInput(): string[] {
  const texts: string[] = []
  const encode = Tiktoken.prototype.encode
  const spy = vi.spyOn(Tiktoken.prototype, 'encode').mockImplementation(function (
    this: Tiktoken,
    ...args
  ) {
    texts.push(args[0])
    return encode.apply(this, args)
  })
  afterAll(() => {
    spy.mockRestore()
  })
  return texts
}

/**
 * Every text handed to a `@huggingface/tokenizers` Tokenizer while the calling test file runs,
 * with the number of ids each call produced, both in call order.
 */
export function recordTokenizerInput(): { texts: string[]; counts: number[] } {
  const texts: string[] = []
  const counts: number[] = []
  const encode = Tokenizer.prototype.encode
  const spy = vi.spyOn(Tokenizer.prototype, 'encode').mockImplementation(function (
    this: Tokenizer,
    text: string,
    options?: Parameters<typeof encode>[1],
  ) {
    texts.push(text)
    const result = encode.call(this, text, options)
    counts.push(result.ids.length)
    return result
  })
  afterAll(() => {
    spy.mockRestore()
  })
  return { texts, counts }
}
