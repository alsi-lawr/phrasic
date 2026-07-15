{
  description = "Phrasic development environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs = { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
    in
    {
      devShells = nixpkgs.lib.genAttrs systems (
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
