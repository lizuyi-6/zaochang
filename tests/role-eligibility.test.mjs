import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { fileURLToPath } from "node:url";
import { canHoldEmailWhitelistRole } from "../app/api/_lib/role-eligibility.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const eligibilityPath = path.join(repoRoot, "app/api/_lib/role-eligibility.ts");
const accessControlPath = path.join(repoRoot, "app/api/_lib/access-control.ts");
const creditsPath = path.join(repoRoot, "app/api/_lib/hyperknow/credits.ts");

function listTypeScriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(entryPath);
    return /\.tsx?$/.test(entry.name) ? [entryPath] : [];
  });
}

function parseTypeScript(filePath) {
  const sourceText = readFileSync(filePath, "utf8");
  const scriptKind = filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, scriptKind);
}

function visitNodes(node, callback) {
  callback(node);
  ts.forEachChild(node, (child) => visitNodes(child, callback));
}

function emailWhitelistCalls(sourceFile) {
  const calls = [];
  visitNodes(sourceFile, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ["isAdminEmail", "isFounderEmail"].includes(node.expression.text)
    ) {
      calls.push(node.expression.text);
    }
  });
  return calls;
}

function functionBodyCalls(sourceFile, functionName, calledFunctionName) {
  let declaration;
  visitNodes(sourceFile, (node) => {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === functionName &&
      node.body
    ) {
      declaration = node;
    }
  });
  assert.ok(declaration, `expected function ${functionName} in access-control.ts`);

  let found = false;
  visitNodes(declaration.body, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === calledFunctionName
    ) {
      found = true;
    }
  });
  return found;
}

test("email whitelist role eligibility accepts only session and legacy auth", () => {
  const cases = [
    ["session", true],
    ["legacy", true],
    ["api_key", false],
    ["agent", false],
    [undefined, false],
    ["oauth", false],
    ["", false],
  ];

  for (const [authVia, expected] of cases) {
    assert.equal(
      canHoldEmailWhitelistRole({ authVia }),
      expected,
      `authVia=${String(authVia)} should yield ${expected}`,
    );
  }
});

test("email whitelist calls stay within the centralized access-control module", () => {
  const appFiles = listTypeScriptFiles(path.join(repoRoot, "app"));
  const workerFiles = listTypeScriptFiles(path.join(repoRoot, "worker"));
  const directCalls = [];

  for (const filePath of [...appFiles, ...workerFiles]) {
    const calls = emailWhitelistCalls(parseTypeScript(filePath));
    for (const call of calls) {
      directCalls.push({
        file: path.relative(repoRoot, filePath).replaceAll(path.sep, "/"),
        call,
      });
    }
  }

  const allowedCallFiles = new Map([
    // This is the sole role-decision surface: hasRole checks eligibility before allowing a role, and the founder credit guard calls isFounderEmail only to reject an ineligible identity with 403.
    ["app/api/_lib/access-control.ts", "centralized role decisions and explicit rejection only"],
  ]);
  assert.ok(directCalls.length > 0, "expected centralized email whitelist calls to remain present");
  for (const directCall of directCalls) {
    assert.ok(
      allowedCallFiles.has(directCall.file),
      `${directCall.file} directly calls ${directCall.call}; use hasRole instead`,
    );
  }
});

test("all email-role guards call the fail-closed eligibility helper", () => {
  const eligibilitySource = parseTypeScript(eligibilityPath);
  let importCount = 0;
  visitNodes(eligibilitySource, (node) => {
    if (ts.isImportDeclaration(node)) importCount += 1;
  });
  assert.equal(importCount, 0, "role-eligibility.ts must remain a zero-import module");

  const accessSource = parseTypeScript(accessControlPath);
  for (const functionName of ["hasRole", "requireAdminOrAgent", "requireDocEditor"]) {
    assert.equal(
      functionBodyCalls(accessSource, functionName, "canHoldEmailWhitelistRole"),
      true,
      `${functionName} must call canHoldEmailWhitelistRole in its body`,
    );
  }

  const accessControlText = readFileSync(accessControlPath, "utf8");
  assert.doesNotMatch(
    accessControlText,
    /authVia\s*===\s*["']api_key["']/,
    "access-control.ts must not use an api_key-only blacklist",
  );
});

test("ineligible founder identities cannot reuse shared same-day credits", () => {
  const accessSource = parseTypeScript(accessControlPath);
  assert.equal(
    functionBodyCalls(accessSource, "assertFounderRoleIdentityEligible", "canHoldEmailWhitelistRole"),
    true,
    "the founder credit guard must use the shared identity-source decision",
  );
  const accessText = readFileSync(accessControlPath, "utf8");
  assert.match(
    accessText,
    /if \(!canHoldEmailWhitelistRole\(member\) && isFounderEmail\(member\.email\)\) \{\s*throw accessError\("founder_forbidden", 403\);/,
    "an ineligible founder-email identity must be denied with 403",
  );

  const creditsText = readFileSync(creditsPath, "utf8");
  const tierStart = creditsText.indexOf("export function resolveUserTier(");
  const tierEnd = creditsText.indexOf("\n}\n", tierStart);
  assert.ok(tierStart >= 0 && tierEnd > tierStart, "resolveUserTier must remain present");
  const tierBody = creditsText.slice(tierStart, tierEnd);
  assert.ok(
    tierBody.indexOf("HK_USER_TIERS") < tierBody.indexOf("HK_MAX_USERS") &&
      tierBody.indexOf("HK_MAX_USERS") < tierBody.indexOf("assertFounderRoleIdentityEligible(user)") &&
      tierBody.indexOf("assertFounderRoleIdentityEligible(user)") < tierBody.indexOf('hasRole(user, "founder")'),
    "paid tier mappings must run first; the founder-role 403 must precede the role-derived MAX decision",
  );

  const idempotentStart = creditsText.indexOf("export async function consumeCreditsIdempotent(");
  const idempotentCheck = creditsText.indexOf("resolveUserTier(user);", idempotentStart);
  const firstDatabaseAccess = creditsText.indexOf("database()", idempotentStart);
  assert.ok(
    idempotentStart >= 0 && idempotentCheck > idempotentStart && firstDatabaseAccess > idempotentCheck,
    "idempotent credits must reject an ineligible founder identity before reading or mutating a shared lease",
  );
});
