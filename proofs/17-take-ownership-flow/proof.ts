#!/usr/bin/env bun

/**
 * Proof 17: current Varlock take-ownership flow.
 *
 * Goal: model current Varlock `keychain take-ownership`:
 *   1. /usr/bin/security creates an existing generic-password item.
 *   2. keychain-probe reads value, creates a temp item through its normal write path,
 *      verifies temp value, deletes original, renames temp back, verifies final value.
 *   3. keychain-probe reads the final item twice and dumps ACLs.
 *
 * This intentionally resets item ACL shape like Varlock's destructive take-ownership flow.
 */

const account = "macos-keychain-analysis";
const password = "disposable-proof-secret";
const service = "macos-keychain-analysis.proof-17.take-ownership-flow";
const label = "macos-keychain-analysis proof 17 take ownership flow";
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
  console.log("# Proof 17: take-ownership flow");

  console.log("\n## Build keychain-probe");
  await runCommand(["/usr/bin/swift", "build", "--package-path", packagePath]);

  if (cleanupOnly) {
    console.log("\n## Cleanup only");
    await cleanup();
    return;
  }

  console.log("\n## What to record manually");
  console.log("Record prompts during create, initial ACL list, take-ownership, post-ownership ACL list, and reads separately.");
  console.log("Question: does destructive take-ownership recreate the item so later keychain-probe reads are prompt-free?");
  console.log(`Record observations in: ${observationPath}`);

  console.log("\n### Setup: remove stale item");
  await cleanup();

  console.log("\n### Create disposable generic password via /usr/bin/security");
  await runSecurity(["add-generic-password", "-a", account, "-s", service, "-w", password, "-l", label]);

  console.log("\n### Identify keychain-probe binary");
  await runProbe(["whoami"]);

  console.log("\n### ACL list before take-ownership");
  await runProbe(["acl-list", "--service", service, "--account", account]);

  console.log("\n### Run take-ownership equivalent");
  await runProbe(["take-ownership", "--service", service, "--account", account]);

  console.log("\n### ACL list after take-ownership");
  await runProbe(["acl-list", "--service", service, "--account", account]);

  await readWithProbe("First password read via keychain-probe after take-ownership");
  await readWithProbe("Second password read via keychain-probe after take-ownership");

  console.log("\n### ACL list after reads");
  await runProbe(["acl-list", "--service", service, "--account", account]);

  console.log("\n## Cleanup command");
  console.log("bun run proof:17:cleanup");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
