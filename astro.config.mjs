// @ts-check
import { defineConfig } from "astro/config";

import tailwindcss from "@tailwindcss/vite";
import react from "@astrojs/react";
import mdx from "@astrojs/mdx";
import cloudflare from "@astrojs/cloudflare";
import sitemap from "@astrojs/sitemap";

// https://astro.build/config
export default defineConfig({
  site: "https://hgz.xo.je",
  output: "static",
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
  }),
});
