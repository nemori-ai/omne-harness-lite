// A streamed request body needs `duplex: 'half'`; the DOM types do not list it yet.
interface RequestInit {
  duplex?: 'half'
}
