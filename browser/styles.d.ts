declare module "*.css" {}

declare module "*.html" {
  const bundle: Bun.HTMLBundle;
  export default bundle;
}
