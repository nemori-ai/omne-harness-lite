// Runs before the first paint, so the page never shows in the other theme first.
// The same rule as `shell/theme.ts` and the theme controller; a test keeps the key in step.
;(function () {
  var choice = null
  try {
    choice = window.localStorage.getItem('omne.theme')
  } catch {}
  var dark =
    choice === 'dark' ||
    (choice !== 'light' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
})()
