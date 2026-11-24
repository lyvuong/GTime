// Songs fetched earlier end with a "{comment: Source: <url>}" line. The link is kept as the song's
// sourceUrl (and shown in the header), so the line itself is dropped from what is displayed and saved.
export function stripSourceLine(chordpro: string): string {
  return chordpro.replace(/(?:\r?\n)*^[ \t]*\{comment:\s*Source:[^}\r\n]*\}[ \t]*$/gim, '').replace(/\s+$/, '') + '\n';
}
