import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const root = process.cwd();
const rules = [
  ['src/server/domain', ['src/server/domain']],
  ['src/server/application', ['src/server/domain', 'src/server/application']],
];
let errors = 0;
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)],
    );
}
for (const [folder, allowed] of rules) {
  for (const file of walk(folder).filter((f) => /\.tsx?$/.test(f) && !f.includes('.test.'))) {
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    function visit(node) {
      let specifier;
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      )
        specifier = node.moduleSpecifier.text;
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      )
        specifier = node.arguments[0].text;
      if (specifier) {
        const resolved = specifier.startsWith('@/')
          ? path.resolve(root, 'src', specifier.slice(2))
          : specifier.startsWith('.')
            ? path.resolve(path.dirname(file), specifier)
            : null;
        const valid =
          resolved &&
          allowed.some(
            (base) =>
              resolved === path.resolve(base) || resolved.startsWith(path.resolve(base) + path.sep),
          );
        if (!valid) {
          console.error(`${file}: forbidden ${specifier} dependency in ${folder}`);
          errors++;
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
}
if (errors) process.exitCode = 1;
else console.log('Hexagonal dependency boundaries verified.');
