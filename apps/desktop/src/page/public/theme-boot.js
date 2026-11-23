// Runs before the first paint, so the page never shows in the other theme or size first.
// The same rules as `shell/theme.ts`, `shell/size.ts` and the two controllers; a test keeps the keys in step.
;(function () {
  var choice = null
  var size = null
  try {
    choice = window.localStorage.getItem('omne.theme')
    size = window.localStorage.getItem('omne.size')
  } catch {}
  var dark =
    choice === 'dark' ||
    (choice !== 'light' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  if (size === 'small' || size === 'large' || size === 'reading')
    document.documentElement.dataset.size = size
  // What the whole application was last tinted with: written on the root until the sheet of the changes takes over.
  var tokens = null
  try {
    tokens = JSON.parse(window.localStorage.getItem('omne.tokens'))
  } catch {}
  if (tokens === null || typeof tokens !== 'object' || Array.isArray(tokens)) return
  var written = []
  for (var name in tokens) {
    var value = tokens[name]
    if (!/^--omne-[a-z0-9-]+$/.test(name)) continue
    if (typeof value !== 'string' || !/^[A-Za-z0-9 #%.,()+*/_-]+$/.test(value)) continue
    if (/(^|[^a-z-])url\(/i.test(value)) continue
    document.documentElement.style.setProperty(name, value)
    written.push(name)
  }
  if (written.length > 0) document.documentElement.dataset.bootTokens = written.join(' ')
})()
