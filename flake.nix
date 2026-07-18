{
  description = "Phrasic development environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs = { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      bunDependencyHashes = {
        "x86_64-linux" = "sha256-dK+hZYG1XRLhyaAFyAck+NE6Hs/CnDakP7YGSHc1Ru8=";
        "aarch64-linux" = "sha256-ui859NfmeQ9jHjJVUsPkXcBm8hlq6PjeSeQ7BU/gnxE=";
      };
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      packages = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
          package = builtins.fromJSON (builtins.readFile ./package.json);
          bunDeps = pkgs.stdenvNoCC.mkDerivation {
            pname = "${package.name}-bun-deps";
            inherit (package) version;
            src = ./.;

            nativeBuildInputs = [ pkgs.bun ];
            outputHashMode = "recursive";
            outputHash = bunDependencyHashes.${system};

            buildPhase = ''
              export HOME="$TMPDIR"
              export HUSKY=0
              bun -e 'const packageJson = await Bun.file("package.json").json(); delete packageJson.scripts.prepare; await Bun.write("package.json", JSON.stringify(packageJson, undefined, 2) + "\n");'
              bun ci --frozen-lockfile --omit peer
              mv node_modules "$out"
            '';

            installPhase = "true";
          };
        in
        {
          default = pkgs.stdenvNoCC.mkDerivation {
            pname = package.name;
            inherit (package) version;
            src = ./.;

            nativeBuildInputs = [ pkgs.bun ];

            buildPhase = ''
              cp -R ${bunDeps} node_modules
              bun run build
            '';

            installPhase = ''
              runHook preInstall
              mkdir -p "$out"
              cp -r dist/. "$out/"
              runHook postInstall
            '';
          };
        }
      );

      devShells = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
        {
          default = pkgs.mkShell {
            packages = [
              pkgs.bun
              pkgs.chromium
              pkgs.ffmpeg
            ];

            shellHook = ''
              export CHROME_BIN="${pkgs.chromium}/bin/chromium"
            '';
          };
        }
      );
    };
}
