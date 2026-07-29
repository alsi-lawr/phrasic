{
  description = "Phrasic packages and development environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs =
    { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      package = builtins.fromJSON (builtins.readFile ./package.json);
      bunCpus = {
        "x86_64-linux" = "x64";
        "aarch64-linux" = "arm64";
      };
      bunDependencyHashes = {
        "x86_64-linux" = "sha256-yRjvX8GG850OAt+lhGwI4le+WTiteVR8UCs632hsS8Y=";
        "aarch64-linux" = "sha256-IXpD0ERo/MmsoCGnV8J1486lfi7WJ/fC27jNWW+fHLk=";
      };
      forAllSystems = nixpkgs.lib.genAttrs systems;
      app = description: program: {
        type = "app";
        inherit program;
        meta = { inherit description; };
      };
      packageSet =
        system:
        let
          pkgs = import nixpkgs { inherit system; };
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
              bun ci --cpu=${bunCpus.${system}} --os=linux --frozen-lockfile --omit peer
              mv node_modules "$out"
            '';

            installPhase = "true";
          };
          hostPackage = pkgs.stdenvNoCC.mkDerivation {
            pname = "${package.name}-host";
            inherit (package) version;
            src = ./.;

            nativeBuildInputs = [
              pkgs.bun
              pkgs.makeWrapper
            ];

            buildPhase = ''
              export HOME="$TMPDIR"
              cp -R ${bunDeps} node_modules
              bun run build
            '';

            installPhase = ''
              runHook preInstall
              mkdir -p "$out"
              cp -r dist/. "$out/"
              mkdir -p "$out/bin"
              makeWrapper ${pkgs.bun}/bin/bun "$out/bin/phrasic-host" --add-flags "$out/server.js"
              runHook postInstall
            '';

            meta.mainProgram = "phrasic-host";
          };
          localHostPackage = pkgs.stdenvNoCC.mkDerivation {
            pname = "${package.name}-local-host";
            inherit (package) version;
            src = ./.;

            nativeBuildInputs = [ pkgs.bun ];

            buildPhase = ''
              export HOME="$TMPDIR"
              cp -R ${bunDeps} node_modules
              bun run scripts/build-local-host.ts linux "$PWD/local-host"
            '';

            installPhase = ''
              runHook preInstall
              mkdir -p "$out/bin"
              cp local-host/phrasic-local-host "$out/bin/"
              runHook postInstall
            '';

            meta.mainProgram = "phrasic-local-host";
          };
          localServicePackage = pkgs.rustPlatform.buildRustPackage {
            pname = "${package.name}-local-service";
            inherit (package) version;
            src = ./.;

            cargoLock.lockFile = ./Cargo.lock;
            cargoBuildFlags = [
              "--package"
              "phrasic"
            ];
            doCheck = false;

            meta.mainProgram = "phrasic";
          };
          completePackage = pkgs.stdenvNoCC.mkDerivation {
            pname = package.name;
            inherit (package) version;

            dontUnpack = true;
            nativeBuildInputs = [ pkgs.makeWrapper ];

            installPhase = ''
              runHook preInstall
              mkdir -p "$out/bin"
              makeWrapper ${localServicePackage}/bin/phrasic "$out/bin/phrasic" \
                --set-default PHRASIC_LOCAL_HOST ${localHostPackage}/bin/phrasic-local-host \
                --prefix PATH : ${nixpkgs.lib.makeBinPath [ pkgs.xdg-utils ]}
              ln -s ${localHostPackage}/bin/phrasic-local-host "$out/bin/phrasic-local-host"
              ln -s ${hostPackage}/bin/phrasic-host "$out/bin/phrasic-host"
              runHook postInstall
            '';

            meta = {
              mainProgram = "phrasic";
              platforms = [ "x86_64-linux" ];
            };
          };
        in
        if system == "x86_64-linux" then
          {
            default = completePackage;
            host = hostPackage;
            local = completePackage;
          }
        else
          {
            host = hostPackage;
          };
      packages = forAllSystems packageSet;
    in
    {
      inherit packages;

      apps = forAllSystems (
        system:
        if system == "x86_64-linux" then
          {
            default = app "Run Phrasic Local playback" "${packages.${system}.default}/bin/phrasic";
            host = app "Run the hosted Phrasic server" "${packages.${system}.host}/bin/phrasic-host";
            local = app "Run Phrasic Local playback" "${packages.${system}.local}/bin/phrasic";
          }
        else
          {
            host = app "Run the hosted Phrasic server" "${packages.${system}.host}/bin/phrasic-host";
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
              pkgs.rustup
            ];

            shellHook = ''
              export CHROME_BIN="${pkgs.chromium}/bin/chromium"
            '';
          };
        }
      );
    };
}
