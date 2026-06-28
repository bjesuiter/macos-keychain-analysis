#!/usr/bin/env bun

/**
 * Proof 06c: create with security CLI and explicitly trust a correctly signed keychain-probe.
 *
 * Goal: re-test Proof 06a with the stable Developer ID signed helper identity.
 * Earlier -T proofs used whatever debug/ad-hoc identity the helper had at the time; this
 * proof signs keychain-probe with the same stable identity used by Proofs 12/13 before
 * passing it to `/usr/bin/security add-generic-password -T`.
 */

const account = "macos-keychain-analysis";
const password = "disposable-proof-secret";
const service = "macos-keychain-analysis.proof-06c.security-create-trust-signed-probe-read-only";
const label = "macos-keychain-analysis proof 06c security create trust signed probe read only";
const cleanupOnly = Bun.argv.includes("--cleanup");
const packagePath = "packages/keychain-probe";
const probePath = "packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe";
const securityPath = "/usr/bin/security";
const signingIdentity = process.env.PROOF06C_CODESIGN_IDENTITY ?? "584EFC30BFC2F2BAC6BC900457C8BB19671D0D18";
const signingIdentifier = "dev.bjesuiter.macos-keychain-analysis.keychain-probe";

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

function quoteShell(value: string) {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

async function runProbe(args: string[], options: { allowFailure?: boolean } = {}) { return runCommand([probePath, ...args], options); }
async function runSecurity(args: string[], options: { allowFailure?: boolean } = {}) { return runCommand([securityPath, ...args], options); }

async function cleanup() {
  await runSecurity(["delete-generic-password", "-a", account, "-s", service], { allowFailure: true });
}

async function buildAndSignProbe() {
  await runCommand(["/usr/bin/swift", "build", "--package-path", packagePath]);
  await runCommand([
    "/usr/bin/codesign",
    "--force",
    "--sign", signingIdentity,
    "--identifier", signingIdentifier,
    probePath,
  ]);
}

async function codeIdentity(label: string): Promise<void> {
  console.log(`\n### Code identity: ${label}`);
  await runCommand(["/usr/bin/codesign", "-d", "-vvv", "-r-", probePath]);
}

function parseJsonLine<T>(stdout: string): T | undefined {
  const line = stdout.trim().split("\n").find((candidate) => candidate.trim().startsWith("{"));
  if (!line) return undefined;
  return JSON.parse(line) as T;
}

async function readWithProbe(label: string) {
  console.log(`\n### ${label}`);
  const read = await runProbe(["read", "--service", service, "--account", account]);
  const parsed = parseJsonLine<{ ok: boolean; result?: { value?: string } }>(read.stdout);
  console.log(`read matched expected disposable secret: ${parsed?.result?.value === password ? "yes" : "no"}`);
}

async function main() {
  console.log("# Proof 06c: security CLI -T correctly signed keychain-probe, read only");
  console.log(`codesign identity: ${signingIdentity}`);
  console.log(`codesign identifier: ${signingIdentifier}`);

  if (cleanupOnly) {
    console.log("\n## Cleanup only");
    await cleanup();
    return;
  }

  console.log("\n## What to record manually");
  console.log("Record whether signing, creation, reads, or ACL list prompt.");
  console.log("Question: does `security add-generic-password -T signed-keychain-probe` make first and second signed keychain-probe reads silent?");

  console.log("\n## Available signing identities");
  await runCommand(["/usr/bin/security", "find-identity", "-v", "-p", "codesigning"], { allowFailure: true });

  console.log("\n## Build and sign keychain-probe with stable identity");
  await buildAndSignProbe();
  await codeIdentity("signed probe used in -T");

  console.log("\n### Setup: remove stale item");
  await cleanup();

  console.log("\n### Identify keychain-probe binary");
  await runProbe(["whoami"]);

  console.log("\n### Create disposable generic password via /usr/bin/security with -T signed keychain-probe");
  await runSecurity(["add-generic-password", "-a", account, "-s", service, "-w", password, "-l", label, "-T", probePath]);

  await readWithProbe("First password read via signed keychain-probe");
  await readWithProbe("Second password read via signed keychain-probe");

  console.log("\n### Inspect ACL list after reads");
  await runProbe(["acl-list", "--service", service, "--account", account]);

  console.log("\n## Cleanup command");
  console.log("bun run proof:06c:cleanup");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
