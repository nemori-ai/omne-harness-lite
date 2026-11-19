// One case fold for the index, the query and the case-insensitive match. It maps code point to
// code point and never changes the length, so a position in folded text is a position in the text.

// Pairs the regular expression engine matches alike without case while their upper case is more
// than one code point, so upper-then-lower leaves them apart. The engine test finds any new one.
const cache = new Map<string, string>([
  ['\u1fd3', '\u0390'],
  ['\u1fe3', '\u03b0'],
  ['\ufb05', '\ufb06'],
])

function foldPoint(point: string): string {
  const cached = cache.get(point)
  if (cached !== undefined) return cached
  const upper = point.toUpperCase()
  const lower = (upper.length === point.length ? upper : point).toLowerCase()
  const folded = lower.length === point.length ? lower : point
  cache.set(point, folded)
  return folded
}

/** Folds case. Upper then lower: the members of one case orbit (s, S, ſ) land on one value. */
export function foldText(text: string): string {
  let out = ''
  let plain = 0
  for (let at = 0; at < text.length;) {
    const code = text.codePointAt(at)!
    const size = code > 0xffff ? 2 : 1
    if (code < 0x80 && (code < 0x41 || code > 0x5a)) {
      at += size
      continue
    }
    const point = text.slice(at, at + size)
    const folded = code < 0x80 ? point.toLowerCase() : foldPoint(point)
    if (folded !== point) {
      out += text.slice(plain, at) + folded
      plain = at + size
    }
    at += size
  }
  return plain === 0 ? text : out + text.slice(plain)
}
