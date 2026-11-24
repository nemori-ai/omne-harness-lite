export type InquiryPolicy = Readonly<{
  onAsk: 'deny' | 'ask-human' | 'skip-ask'
  /** Why asking is denied, when the publisher says so: the refusal carries it. */
  denial?: 'nobody-to-ask' | undefined
}>
