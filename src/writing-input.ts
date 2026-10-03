export const SOURCE_CODE_INPUT_MESSAGE =
  "This tool rewrites prose. Paste a paragraph of writing; source code rewriting is not supported.";

/** Conservative recognition of an entire source file, not prose quoting code. */
export function isSourceCodeOnly(text: string): boolean {
  const source = text.trim();
  const fenced = /^```(?:java|javascript|typescript|js|ts|python|py|cpp|c|cs|csharp|go|rust|kotlin|swift|php|sql|json|yaml|toml|sh|bash|shell)[ \t]*\r?\n([\s\S]*)\r?\n```$/iu.exec(source);
  if (fenced && !/^\s*```/mu.test(fenced[1])) return true;
  const syntax = source
    .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/gu, '""')
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/\/\/[^\n]*/gu, "");
  const lines = syntax.split(/\r?\n/u).map(line => line.trim()).filter(Boolean);
  if (lines.length < 3) return false;
  const declaration = /^(?:(?:public|private|protected|abstract|final|static|sealed|export|async)\s+)*(?:class|interface|enum|record|function)\s+[A-Za-z_$][\w$]*/u;
  if (!lines.some(line => declaration.test(line))) return false;
  if (!/^(?:package\s|import\s|using\s|@)/u.test(lines[0]) && !declaration.test(lines[0])) return false;
  if (!lines.every(line => /^@[\w.]+/u.test(line) || /[;{},]$/u.test(line))) return false;
  let depth = 0;
  let opened = false;
  for (const character of syntax) {
    if (character === "{") { depth++; opened = true; }
    if (character === "}" && --depth < 0) return false;
  }
  return opened && depth === 0;
}
