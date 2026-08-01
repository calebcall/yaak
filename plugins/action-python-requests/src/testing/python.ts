import {spawnSync} from "node:child_process";

const PYTHON = ["python3", "python"].find((bin) => {
    const probe = spawnSync(bin, ["-c", ""], {encoding: "utf8"});
    return probe.status === 0;
});

export const hasPython = PYTHON != null;

/**
 * Parse `code` with Python itself and return the syntax error, or null when it parses.
 *
 * Asserting on generated source text alone is not enough: a snippet can look
 * correct in a string comparison and still be unparseable (an unescaped newline
 * inside a quoted literal, for example). Only a real parser settles it.
 */
export function pythonSyntaxError(code: string): string | null {
    if (PYTHON == null) {
        throw new Error("no python interpreter available");
    }
    const result = spawnSync(
        PYTHON,
        ["-c", "import ast,sys; ast.parse(sys.stdin.read())"],
        {input: code, encoding: "utf8"},
    );
    if (result.status === 0) return null;
    return result.stderr.trim().split("\n").pop() ?? "unknown syntax error";
}

/**
 * Return names `code` reads without ever assigning them, ignoring the builtins
 * and imports a generated snippet is expected to rely on. Catches emitting
 * `data=payload` when no `payload = ...` line was produced.
 */
export function undefinedNames(code: string): string[] {
    if (PYTHON == null) {
        throw new Error("no python interpreter available");
    }
    const script = `
import ast, sys, json
tree = ast.parse(sys.stdin.read())
assigned = set()
for node in ast.walk(tree):
    if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
        assigned.add(node.id)
    elif isinstance(node, (ast.Import, ast.ImportFrom)):
        for alias in node.names:
            assigned.add(alias.asname or alias.name.split('.')[0])
loaded = {n.id for n in ast.walk(tree) if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Load)}
builtins = {'open', 'print', 'True', 'False', 'None'}
print(json.dumps(sorted(loaded - assigned - builtins)))
`;
    const result = spawnSync(PYTHON, ["-c", script], {input: code, encoding: "utf8"});
    if (result.status !== 0) {
        throw new Error(`could not analyse snippet: ${result.stderr.trim()}`);
    }
    return JSON.parse(result.stdout) as string[];
}
