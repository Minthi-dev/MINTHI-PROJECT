import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';

function checkJsx(filePath) {
    const sourceCode = fs.readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(
        filePath,
        sourceCode,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
    );

    let stack = [];

    function visit(node) {
        if (ts.isJsxElement(node)) {
            const tagName = node.openingElement.tagName.getText();
            stack.push({ name: tagName, pos: node.openingElement.getStart() });
        }

        if (ts.isJsxClosingElement(node)) {
            const tagName = node.tagName.getText();
            // Just for basic debug
        }

        ts.forEachChild(node, visit);
    }

    // Simplest way to spot syntax errors is getting syntactic diagnostics
    const program = ts.createProgram([filePath], { jsx: ts.JsxEmit.React });
    const diagnostics = program.getSyntacticDiagnostics(program.getSourceFile(filePath));

    if (diagnostics.length > 0) {
        diagnostics.forEach(diag => {
            if (diag.file) {
                const { line, character } = diag.file.getLineAndCharacterOfPosition(diag.start);
                const message = ts.flattenDiagnosticMessageText(diag.messageText, '\n');
                console.log(`Error ${diag.file.fileName} (${line + 1},${character + 1}): ${message}`);
            }
        });
    } else {
        console.log("No syntax errors found by JS compiler API!");
    }
}

const fileToCheck = path.join(__dirname, '..', 'src', 'components', 'SettingsView.tsx');
checkJsx(fileToCheck);
