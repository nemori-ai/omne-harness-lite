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
})()
