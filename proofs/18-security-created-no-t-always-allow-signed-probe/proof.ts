#!/usr/bin/env bun

/**
 * Proof 18: security-created item without -T, Always Allow, signed keychain-probe.
 *
 * Goal: test whether Always Allow alone, without creation-time `security -T`,
 * creates enough durable access for prompt-free cross-app reads by a stably
 * signed keychain-probe. This isolates the post-prompt state from explicit
 * pre-added trusted app paths.
 *
 * Manual step: when the first keychain-probe read prompts, choose Always Allow.
 */

const account = "macos-keychain-analysis";
const password = "disposable-proof-secret";
const service = "macos-keychain-analysis.proof-18.security-created-no-t-signed-always-allow";
const label = "macos-keychain-analysis proof 18 security created no T signed always allow";
const cleanupOnly = Bun.argv.includes("--cleanup");
const packagePath = "packages/keychain-probe";
const probePath = "packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe";
const securityPath = "/usr/bin/security";
const signingIdentity = process.env.PROOF18_CODESIGN_IDENTITY
  ?? process.env.PROOF13_CODESIGN_IDENTITY
  ?? process.env.PROOF12_CODESIGN_IDENTITY
  ?? "584EFC30BFC2F2BAC6BC900457C8BB19671D0D18";
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
  if (!options.allowFailure && exitCode !== 0) {
    throw new Error(`Command failed (${exitCode}): ${command}`);
  }
  return { command, stdout, stderr, exitCode };
}

function quoteShell(value: string) {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

async function runProbe(args: string[], options: { allowFailure?: boolean } = {}) {
  return runCommand([probePath, ...args], options);
}
async function runSecurity(args: string[], options: { allowFailure?: boolean } = {}) {
  return runCommand([securityPath, ...args], options);
}

async function cleanup() {
  await runSecurity(["delete-generic-password", "-a", account, "-s", service], { allowFailure: true });
}

async function signProbe() {
  await runCommand([
    "/usr/bin/codesign",
    "--force",
    "--sign", signingIdentity,
    "--identifier", signingIdentifier,
    probePath,
  ]);
}

async function buildAndSignProbe() {
  await runCommand(["/usr/bin/swift", "build", "--package-path", packagePath]);
  await signProbe();
}

async function codeIdentity(label: string): Promise<{ cdhash: string; requirement: string }> {
  console.log(`\n### Code identity: ${label}`);
  const result = await runCommand(["/usr/bin/codesign", "-d", "-vvv", "-r-", probePath]);
  const output = `${result.stdout}\n${result.stderr}`;
  const cdhash = output.match(/CDHash=([0-9a-f]+)/i)?.[1]?.toLowerCase();
  const requirement = output.match(/designated => (.+)/)?.[1]?.trim() ?? "";
  if (!cdhash) throw new Error(`Could not parse CDHash from codesign output:\n${output}`);
  console.log(`parsed CDHash: ${cdhash}`);
  console.log(`parsed designated requirement: ${requirement || "<none>"}`);
  return { cdhash, requirement };
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
  console.log("# Proof 18: security-created without -T, Always Allow for signed keychain-probe");
  console.log(`codesign identity: ${signingIdentity}`);
  console.log(`codesign identifier: ${signingIdentifier}`);

  if (cleanupOnly) {
    console.log("\n## Cleanup only");
    await cleanup();
    return;
  }

  console.log("\n## What to record manually");
  console.log("On the first keychain-probe read, choose Always Allow.");
  console.log("Record whether the second and third reads prompt again.");
  console.log("Question: without `security -T`, does Always Allow add a teamid partition grant that is enough for prompt-free cross-app reads?");
  console.log("Also record whether Always Allow adds only partition-list trust, or both partition-list trust and a legacy trusted-app path.");

  console.log("\n## Build and sign keychain-probe");
  await buildAndSignProbe();
  await codeIdentity("signed probe");

  console.log("\n### Setup: remove stale item");
  await cleanup();

  console.log("\n### Create item via /usr/bin/security without -T");
  await runSecurity(["add-generic-password", "-a", account, "-s", service, "-w", password, "-l", label]);

  console.log("\n### ACL list before Always Allow");
  await runProbe(["acl-list", "--service", service, "--account", account]);

  await readWithProbe("First password read via signed keychain-probe — choose Always Allow");

  console.log("\n### ACL list after Always Allow");
  await runProbe(["acl-list", "--service", service, "--account", account]);

  await readWithProbe("Second password read via signed keychain-probe — should be silent if grant is sufficient");
  await readWithProbe("Third password read via signed keychain-probe — confirms repeat prompt-free behavior");

  console.log("\n### ACL list after repeated reads");
  await runProbe(["acl-list", "--service", service, "--account", account]);

  console.log("\n## Cleanup command");
  console.log("bun run proof:18:cleanup");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
