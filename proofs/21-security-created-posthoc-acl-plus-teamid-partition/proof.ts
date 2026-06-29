#!/usr/bin/env bun

/**
 * Proof 21: security-created item with post-hoc trusted path plus Team ID partition.
 *
 * Goal: create an Always Allow-like state after item creation: /usr/bin/security
 * creates the item without `-T`, signed keychain-probe adds itself to the
 * legacy trusted-app ACL path list, then `security set-generic-password-partition-list`
 * sets `apple-tool:,teamid:<TEAM>`. This tests whether post-hoc path trust plus
 * Team ID partition trust is prompt-free without clicking Always Allow on a read prompt.
 *
 * Manual step: the script shows a native Apple password dialog for the login
 * keychain password and forwards it to the security CLI over stdin. This is only
 * for this proof; do not use this pattern in product code.
 */

const account = "macos-keychain-analysis";
const password = "disposable-proof-secret";
const service = "macos-keychain-analysis.proof-21.posthoc-acl-plus-teamid-partition";
const label = "macos-keychain-analysis proof 21 posthoc acl plus teamid partition";
const cleanupOnly = Bun.argv.includes("--cleanup");
const packagePath = "packages/keychain-probe";
const probePath = "packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe";
const securityPath = "/usr/bin/security";
const signingIdentity = process.env.PROOF21_CODESIGN_IDENTITY
  ?? process.env.PROOF20_CODESIGN_IDENTITY
  ?? process.env.PROOF19_CODESIGN_IDENTITY
  ?? process.env.PROOF18_CODESIGN_IDENTITY
  ?? process.env.PROOF13_CODESIGN_IDENTITY
  ?? process.env.PROOF12_CODESIGN_IDENTITY
  ?? "584EFC30BFC2F2BAC6BC900457C8BB19671D0D18";
const signingIdentifier = "dev.bjesuiter.macos-keychain-analysis.keychain-probe";

type CommandResult = { command: string; exitCode: number; stdout: string; stderr: string };

async function runCommand(args: string[], options: { allowFailure?: boolean; stdin?: string; redactCommand?: boolean; redactStdout?: boolean } = {}): Promise<CommandResult> {
  const command = options.redactCommand ? `${args.map(quoteShell).join(" ")} <redacted>` : args.map(quoteShell).join(" ");
  console.log(`\n$ ${command}`);
  const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe", stdin: options.stdin === undefined ? "ignore" : "pipe" });
  if (options.stdin !== undefined) {
    proc.stdin.write(options.stdin);
    proc.stdin.end();
  }
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (stdout.trim()) console.log(options.redactStdout ? "<redacted stdout>" : stdout.trimEnd());
  if (stderr.trim()) console.error(stderr.trimEnd());
  console.log(`exit: ${exitCode}`);
  if (!options.allowFailure && exitCode !== 0) throw new Error(`Command failed (${exitCode}): ${command}`);
  return { command, stdout, stderr, exitCode };
}

function quoteShell(value: string) {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

async function runProbe(args: string[], options: { allowFailure?: boolean } = {}) {
  return runCommand([probePath, ...args], options);
}
async function runSecurity(args: string[], options: { allowFailure?: boolean; stdin?: string; redactCommand?: boolean } = {}) {
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

async function codeIdentity(label: string): Promise<{ cdhash: string; teamId: string; requirement: string }> {
  console.log(`\n### Code identity: ${label}`);
  const result = await runCommand(["/usr/bin/codesign", "-d", "-vvv", "-r-", probePath]);
  const output = `${result.stdout}\n${result.stderr}`;
  const cdhash = output.match(/CDHash=([0-9a-f]+)/i)?.[1]?.toLowerCase();
  const teamId = output.match(/TeamIdentifier=([A-Z0-9]+)/)?.[1]
    ?? output.match(/certificate leaf\[subject\.OU\] = ([A-Z0-9]+)/)?.[1];
  const requirement = output.match(/designated => (.+)/)?.[1]?.trim() ?? "";
  if (!cdhash) throw new Error(`Could not parse CDHash from codesign output:\n${output}`);
  if (!teamId) throw new Error(`Could not parse TeamIdentifier from codesign output:\n${output}`);
  console.log(`parsed CDHash: ${cdhash}`);
  console.log(`parsed Team ID: ${teamId}`);
  console.log(`parsed designated requirement: ${requirement || "<none>"}`);
  return { cdhash, teamId, requirement };
}

async function askForLoginKeychainPassword(): Promise<string> {
  console.log("\n### Native password prompt for `security set-generic-password-partition-list`");
  console.log("Enter the login keychain password in the Apple dialog. It will be forwarded to `/usr/bin/security` over stdin and not printed.");
  const script = [
    "display dialog ",
    JSON.stringify("Enter the login keychain password for this one proof. It will be passed to /usr/bin/security set-generic-password-partition-list over stdin."),
    " default answer \"\" with hidden answer buttons {\"Cancel\", \"Continue\"} default button \"Continue\" with title ",
    JSON.stringify("Proof 21 Keychain Password"),
    "\nreturn text returned of result",
  ].join("");
  const result = await runCommand(["/usr/bin/osascript", "-e", script], { redactCommand: true, redactStdout: true });
  const keychainPassword = result.stdout.replace(/\r?\n$/, "");
  if (!keychainPassword) throw new Error("No password returned from dialog");
  return keychainPassword;
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
  console.log("# Proof 21: security-created with post-hoc trusted path plus teamid partition");
  console.log(`codesign identity: ${signingIdentity}`);
  console.log(`codesign identifier: ${signingIdentifier}`);

  if (cleanupOnly) {
    console.log("\n## Cleanup only");
    await cleanup();
    return;
  }

  console.log("\n## What to record manually");
  console.log("This proof will show one native Apple password dialog before calling `security set-generic-password-partition-list`.");
  console.log("The item is created without `-T`; signed keychain-probe then adds itself to the legacy trusted-app path list.");
  console.log("Expected prompts: one Keychain prompt during post-hoc trusted-path addition, and one custom Apple dialog for the partition-list command.");
  console.log("For any macOS Keychain prompt, choose Allow Once / Erlauben, not Always Allow.");
  console.log("After post-hoc path trust plus `teamid:<TEAMID>` are set, record whether keychain-probe reads prompt.");

  console.log("\n## Build and sign keychain-probe");
  await buildAndSignProbe();
  const identity = await codeIdentity("signed probe");
  const partitionList = `apple-tool:,teamid:${identity.teamId}`;
  console.log(`partition list to set: ${partitionList}`);

  console.log("\n### Setup: remove stale item");
  await cleanup();

  console.log("\n### Create item via /usr/bin/security without -T");
  await runSecurity(["add-generic-password", "-a", account, "-s", service, "-w", password, "-l", label]);

  console.log("\n### ACL list after create, before post-hoc trusted path addition");
  await runProbe(["acl-list", "--service", service, "--account", account]);

  console.log("\n### Add signed keychain-probe to legacy trusted application paths — choose Allow Once if prompted");
  await runProbe(["add-to-acl", "--service", service, "--account", account, "--path", probePath]);

  console.log("\n### ACL list after post-hoc trusted path addition, before setting partition list");
  await runProbe(["acl-list", "--service", service, "--account", account]);

  const loginKeychainPassword = await askForLoginKeychainPassword();

  console.log("\n### Set generic-password partition list to apple-tool + signed helper Team ID");
  await runSecurity(["set-generic-password-partition-list", "-a", account, "-s", service, "-S", partitionList], {
    stdin: `${loginKeychainPassword}\n`,
    redactCommand: true,
  });

  console.log("\n### ACL list after setting partition list");
  await runProbe(["acl-list", "--service", service, "--account", account]);

  await readWithProbe("First password read via signed keychain-probe — should be silent if post-hoc artificial state is sufficient");
  await readWithProbe("Second password read via signed keychain-probe — confirms repeat behavior");

  console.log("\n### ACL list after reads");
  await runProbe(["acl-list", "--service", service, "--account", account]);

  console.log("\n## Cleanup command");
  console.log("bun run proof:21:cleanup");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
