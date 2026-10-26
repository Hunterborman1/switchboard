/**
 * The first lines a person would read from a conversation: subtitle headers, cue numbers,
 * timing lines, voice tags, heading marks and blank lines left out.
 */
export function previewLines(text: string, max = 6, maxChars = 1200): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) =>
      l
        .replace(/<v\s+([^>]+)>/g, '$1: ')
        .replace(/<\/?[a-z][^>]*>/gi, '')
        .replace(/^#{1,6}\s+/, '')
        .trim(),
    )
    .filter((l) => l && !/^WEBVTT\b|^NOTE\b|^\d+$|-->/.test(l))
    .slice(0, max)
    .join('\n')
    .slice(0, maxChars);
}
