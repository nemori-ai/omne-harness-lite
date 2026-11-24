const INLINE_ICON_FONT = /@font-face\{font-family:screenshots-icon;[^}]*\}/

/** The stylesheet react-screenshots ships, as the build bundles it. */
export const SCREENSHOTS_CSS = /\/react-screenshots\/lib\/style\.css$/

/**
 * react-screenshots' stylesheet fitted to the page: into the app's layer, and without the icon font it inlines as
 * data: URLs, which the page policy refuses; the overlay page serves the same font itself. A version whose stylesheet
 * no longer declares that font fails the build here instead of losing its icons quietly.
 */
export function adaptScreenshotsCss(css: string): string {
  if (!INLINE_ICON_FONT.test(css))
    throw new Error(
      'react-screenshots no longer inlines its icon font the known way: update src/page/shot/screenshots-icon.woff2 and scripts/screenshots-css.ts',
    )
  return `@layer omne-builtin{${css.replace(INLINE_ICON_FONT, '')}}`
}
