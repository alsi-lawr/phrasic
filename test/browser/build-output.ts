export async function buildOutput(outputDirectory: string): Promise<void> {
  const bun = Bun.which("bun");

  if (bun === null) {
    throw new Error("The Bun executable is unavailable for the build harness.");
  }

  const build = Bun.spawn({
    cmd: [bun, "scripts/build.ts", outputDirectory],
    cwd: process.cwd(),
    stderr: "pipe",
    stdout: "pipe",
  });
  const exitCode = await build.exited;

  if (exitCode === 0) {
    return;
  }

  const stderr = await new Response(build.stderr).text();
  throw new Error(`The production build failed: ${stderr}`);
}
