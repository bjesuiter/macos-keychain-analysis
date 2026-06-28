#!/usr/bin/env bun

/**
 * Proof 16: original Varlock fix-access flow as closely as possible.
 *
 * Goal: model the old `varlock keychain fix-access` daemon behavior:
 *   1. /usr/bin/security creates an existing generic-password item.
 *   2. keychain-probe runs the legacy ACL repair primitive (`add-to-acl` / `fix-access`).
 *   3. keychain-probe reads the password twice.
 *
 * This intentionally does NOT run the newer unlock preflight and does NOT take ownership.
 * It only adds the running helper executable to each explicit legacy ACL app list.
 *
 * The probe implementation now mirrors Varlock's KeychainManager.addToACL/getItemRef flow:
 * generic-password lookup first, then internet-password lookup, service/server attribute split,
 * service-only ambiguity check, skip unreadable ACL entries, skip nil/unrestricted app lists,
 * append the trusted app path, then write SecKeychainItemSetAccess when modified.
 */

const account = "macos-keychain-analysis";
const password = "disposable-proof-secret";
const service = "macos-keychain-analysis.proof-16.original-fix-access-flow";
const label = "macos-keychain-analysis proof 16 original fix access flow";
const cleanupOnly = Bun.argv.includes("--cleanup");
const observationPath = "observations/macos-26.5.1.md";
const packagePath = "packages/keychain-probe";
const probePath = "packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe";
const securityPath = "/usr/bin/security";

type CommandResult = { command: string; exitCode: number; stdout: string; stderr: string };

async function runCommand(args: string[], options: { allowFailure?: boolean } = {}): Promise<CommandResult> {
  const command = args.map(quoteShell).join(" ");
  console.log(`\n$ ${command}`);
  const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (stdout.trim()) console.log(stdout.trimEnd());
  if (stderr.trim()) console.error(stderr.trimEnd());
  console.log(`exit: ${exitCode}`);
  if (!options.allowFailure && exitCode !== 0) throw new Error(`Command failed (${exitCode}): ${command}`);
  return { command, stdout, stderr, exitCode };
}

function quoteShell(value: string): string {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

async function runProbe(args: string[], options: { allowFailure?: boolean } = {}) { return runCommand([probePath, ...args], options); }
async function runSecurity(args: string[], options: { allowFailure?: boolean } = {}) { return runCommand([securityPath, ...args], options); }

async function cleanup() {
  await runSecurity(["delete-generic-password", "-a", account, "-s", service], { allowFailure: true });
}

function parseJsonLine<T>(stdout: string): T | undefined {
  const line = stdout.trim().split("\n").find((candidate) => candidate.trim().startsWith("{"));
  if (!line) return undefined;
  return JSON.parse(line) as T;
}

async function readWithProbe(readLabel: string) {
  console.log(`\n### ${readLabel}`);
  const read = await runProbe(["read", "--service", service, "--account", account]);
  const parsed = parseJsonLine<{ ok: boolean; result?: { value?: string } }>(read.stdout);
  console.log(`read matched expected disposable secret: ${parsed?.result?.value === password ? "yes" : "no"}`);
}

async function main() {
  console.log("# Proof 16: original fix-access flow");

  console.log("\n## Build keychain-probe");
  await runCommand(["/usr/bin/swift", "build", "--package-path", packagePath]);

  if (cleanupOnly) {
    console.log("\n## Cleanup only");
    await cleanup();
    return;
  }

  console.log("\n## What to record manually");
  console.log("Record prompts during create, add-to-acl/fix-access, ACL lists, and reads separately.");
  console.log("Question: does the original fix-access behavior (legacy trusted-app path added in-place) make later reads prompt-free?");
  console.log(`Record observations in: ${observationPath}`);

  console.log("\n### Setup: remove stale item");
  await cleanup();

  console.log("\n### Create disposable generic password via /usr/bin/security");
  await runSecurity(["add-generic-password", "-a", account, "-s", service, "-w", password, "-l", label]);

  console.log("\n### Identify keychain-probe binary");
  await runProbe(["whoami"]);

  console.log("\n### ACL list before original fix-access repair");
  await runProbe(["acl-list", "--service", service, "--account", account]);

  console.log("\n### Run original fix-access equivalent: add helper executable to legacy ACL app lists");
  await runProbe(["add-to-acl", "--service", service, "--account", account]);

  console.log("\n### ACL list after original fix-access repair");
  await runProbe(["acl-list", "--service", service, "--account", account]);

  await readWithProbe("First password read via keychain-probe after original fix-access repair");
  await readWithProbe("Second password read via keychain-probe after original fix-access repair");

  console.log("\n### ACL list after reads");
  await runProbe(["acl-list", "--service", service, "--account", account]);

  console.log("\n## Cleanup command");
  console.log("bun run proof:16:cleanup");
  console.log(`\n## Observation log\nRecord prompt observations in: ${observationPath}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
