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
    // bindings like AI/Vectorize/KV require CF auth to validate, which
    // we don't have in CI. At request time the worker still binds them
    // normally, so there's no runtime impact.
    remoteBindings: false,
  }),
});
