export function windowsProtocExtractionCommand(
  archivePath: string,
  destinationPath: string,
): readonly [string, string, string, string] {
  return [
    "powershell",
    "-NoProfile",
    "-Command",
    `Expand-Archive -LiteralPath '${escapePowerShellLiteral(archivePath)}' -DestinationPath '${escapePowerShellLiteral(destinationPath)}'`,
  ];
}

function escapePowerShellLiteral(value: string): string {
  return value.replaceAll("'", "''");
}
