### Changed and fixed

- The home page no longer rebuilds the whole provider table when its script
  loads. It keeps the server-rendered rows and replaces only the cells your
  clock changes (how many days ago a provider was verified, an expired "NEW"
  badge), which removes most of the page's blocking time on a phone. Filters,
  sorting, shared links and the table's keyboard navigation work as before (#754).
