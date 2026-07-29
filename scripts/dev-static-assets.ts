import type { BunPlugin } from "bun";
import { join } from "node:path";

const developmentStaticAssets: BunPlugin = {
  name: "phrasic-development-static-assets",
  setup(build): void {
    build.onResolve({ filter: /^\/fonts\/GeistVF\.woff$/ }, () => ({
      path: join(
        import.meta.dir,
        "..",
        "apps",
        "web",
        "public",
        "fonts",
        "GeistVF.woff",
      ),
    }));
  },
};

export default developmentStaticAssets;
