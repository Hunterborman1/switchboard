/** Markdown files are bundled as Text modules (wrangler.jsonc "rules"): the import is the file's contents. */
declare module '*.md' {
  const text: string;
  export default text;
}
