{
  description = "Phrasic development environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs = { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      packages = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
          package = builtins.fromJSON (builtins.readFile ./package.json);
        in
        {
          default = pkgs.buildNpmPackage {
            pname = package.name;
            inherit (package) version;
            src = ./.;

            nodejs = pkgs.nodejs_26;
            npmDepsHash = "sha256-ukPV78EwVSzIGBYpAzxpWaw9JRCdQNvLVW/a+P7lGUg=";

            npmBuildScript = "build";

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
              pkgs.nodejs_26
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
