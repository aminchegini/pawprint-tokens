import { Node, Project, SyntaxKind, ts } from 'ts-morph';
import type { Mapping } from './mapping.js';
import type { TransformResult } from './css.js';
import { rewriteString } from './text.js';
import type { Hit } from './text.js';

let project: Project | undefined;

function getProject(): Project {
  project ??= new Project({
    useInMemoryFileSystem: true,
    skipLoadingLibFiles: true,
    compilerOptions: { allowJs: true, jsx: ts.JsxEmit.Preserve },
  });
  return project;
}

/** Offsets to trim from a literal's text to reach its content: quotes, backticks, ${ and }. */
function delimiters(node: Node): [number, number] | undefined {
  switch (node.getKind()) {
    case SyntaxKind.StringLiteral:
    case SyntaxKind.NoSubstitutionTemplateLiteral:
    case SyntaxKind.TemplateTail:
      return [1, 1];
    case SyntaxKind.TemplateHead:
    case SyntaxKind.TemplateMiddle:
      return [1, 2];
    default:
      return undefined;
  }
}

/** Import and export paths are file names, not token usages. */
function isModuleSpecifier(node: Node): boolean {
  const parent = node.getParent();
  if (!parent) return false;
  if (
    Node.isImportDeclaration(parent) ||
    Node.isExportDeclaration(parent) ||
    Node.isExternalModuleReference(parent)
  ) {
    return true;
  }
  if (Node.isLiteralTypeNode(parent) && Node.isImportTypeNode(parent.getParent())) return true;
  if (Node.isCallExpression(parent) && parent.getArguments()[0] === node) {
    const callee = parent.getExpression();
    return callee.getKind() === SyntaxKind.ImportKeyword || callee.getText() === 'require';
  }
  return false;
}

/**
 * Rewrite string and template literals in a JS, JSX, TS or TSX file. Only
 * literal content changes; identifiers, comments and formatting stay as they are.
 */
export function transformJs(code: string, fileName: string, mapping: Mapping): TransformResult {
  const hits: Hit[] = [];
  // The file is parsed under a fixed virtual path; only its extension matters.
  const extension = /\.[cm]?[jt]sx?$/.exec(fileName)?.[0] ?? '.tsx';
  const sourceFile = getProject().createSourceFile(`/input${extension}`, code, { overwrite: true });
  const edits: Array<{ start: number; end: number; text: string }> = [];

  sourceFile.forEachDescendant((node) => {
    const trim = delimiters(node);
    if (!trim || isModuleSpecifier(node)) return;
    const start = node.getStart() + trim[0];
    const end = node.getEnd() - trim[1];
    const before = code.slice(start, end);
    const after = rewriteString(before, mapping, hits);
    if (after !== before) edits.push({ start, end, text: after });
  });
  sourceFile.forget();

  let out = code;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }
  return { code: out, hits };
}
