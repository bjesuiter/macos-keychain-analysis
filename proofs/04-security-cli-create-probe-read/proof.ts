#!/usr/bin/env bun

/**
 * Proof 04: create with security CLI, read with keychain-probe.
 *
 * Goal: observe whether keychain-probe can read a generic password created by
 * `/usr/bin/security`, and whether reading the item's ACLs via keychain-probe
 * triggers a separate prompt.
 */

const account = "macos-keychain-analysis";
const password = "disposable-proof-secret";
const service = "macos-keychain-analysis.proof-04.security-create-probe-read";
const label = "macos-keychain-analysis proof 04 security create probe read";
const cleanupOnly = Bun.argv.includes("--cleanup");
const observationPath = "observations/macos-26.5.1.md";
const packagePath = "packages/keychain-probe";
const probePath = "packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe";
const securityPath = "/usr/bin/security";

type CommandResult = { command: string; exitCode: number; stdout: string; stderr: string };

async function runCommand(args: string[]): Promise<CommandResult> {
  const command = args.map(quoteShell).join(" ");
  console.log(`\n$ ${command}`);
  const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (stdout.trim().length > 0) console.log(stdout.trimEnd());
  if (stderr.trim().length > 0) console.error(stderr.trimEnd());
  console.log(`exit: ${exitCode}`);
  return { command, exitCode, stdout, stderr };
}

function quoteShell(value: string): string {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

async function runProbe(args: string[]) { return runCommand([probePath, ...args]); }
async function runSecurity(args: string[]) { return runCommand([securityPath, ...args]); }

async function printEnvironment() {
  const swVers = Bun.spawn(["/usr/bin/sw_vers"], { stdout: "pipe", stderr: "pipe" });
  const swVersOutput = await new Response(swVers.stdout).text();
  await swVers.exited;
  console.log("# Proof 04: security CLI create, keychain-probe read");
  console.log("\n## Environment");
  console.log(swVersOutput.trimEnd());
  console.log(`shell: ${process.env.SHELL ?? "unknown"}`);
  console.log(`bun: ${Bun.version}`);
  console.log(`creator: ${securityPath}`);
  console.log(`reader: ${probePath}`);
}

async function cleanup() {
  await runSecurity(["delete-generic-password", "-a", account, "-s", service]);
}

function parseJsonLine<T>(stdout: string): T | undefined {
  const line = stdout.trim().split("\n").find((candidate) => candidate.trim().startsWith("{"));
  if (!line) return undefined;
  return JSON.parse(line) as T;
}

async function main() {
  await printEnvironment();

  console.log("\n## Build keychain-probe");
  await runCommand(["/usr/bin/swift", "build", "--package-path", packagePath]);

  if (cleanupOnly) {
    console.log("\n## Cleanup only");
    await cleanup();
    return;
  }

  console.log("\n## What to record manually");
  console.log("For each command, note whether macOS showed a Keychain prompt, the app name shown in the prompt, and whether you clicked Allow, Always Allow, Deny, or Cancel.");
  console.log(`Record observations in: ${observationPath}`);

  console.log("\n## Case: security-create-probe-read");
  console.log(`service: ${service}`);
  console.log("expected: security CLI creation should normally be silent. keychain-probe read is expected to prompt once. keychain-probe ACL read is expected to prompt once separately.");

  console.log("\n### Setup: remove stale item");
  await cleanup();

  console.log("\n### Create disposable generic password via /usr/bin/security");
  await runSecurity(["add-generic-password", "-a", account, "-s", service, "-w", password, "-l", label]);

  console.log("\n### Inspect item attributes via /usr/bin/security");
  await runSecurity(["find-generic-password", "-a", account, "-s", service]);

  console.log("\n### Identify keychain-probe binary");
  await runProbe(["whoami"]);

  console.log("\n### Read password value via keychain-probe");
  const read = await runProbe(["read", "--service", service, "--account", account]);
  const parsed = parseJsonLine<{ ok: boolean; result?: { value?: string } }>(read.stdout);
  console.log(`read matched expected disposable secret: ${parsed?.result?.value === password ? "yes" : "no"}`);

  console.log("\n### Inspect ACL list via keychain-probe");
  await runProbe(["acl-list", "--service", service, "--account", account]);

  console.log("\n## Cleanup command");
  console.log("bun run proof:04:cleanup");
  console.log(`\n## Observation log\nRecord prompt observations in: ${observationPath}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
