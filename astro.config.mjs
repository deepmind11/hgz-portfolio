// @ts-check
import { defineConfig } from "astro/config";

import tailwindcss from "@tailwindcss/vite";
import react from "@astrojs/react";
import mdx from "@astrojs/mdx";
import cloudflare from "@astrojs/cloudflare";
import sitemap from "@astrojs/sitemap";

// https://astro.build/config
export default defineConfig({
  site: "https://hgz-portfolio.harshitghosh.workers.dev",
  output: "server",
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "viewport",
  },
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [react(), mdx(), sitemap()],
  adapter: cloudflare({
    imageService: "compile",
    // Prerender static pages with plain Node instead of workerd.
    prerenderEnvironment: "node",
    // Skip the wrangler remote-binding proxy at build time. Remote
    // bindings (KV, etc.) require CF auth to validate, which we don't
    // always have in CI. Runtime bindings are unaffected.
    remoteBindings: false,
  }),
});
