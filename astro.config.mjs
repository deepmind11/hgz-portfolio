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
    // Disable the wrangler remote proxy at build time. The proxy requires
    // CF auth, which we don't always have in CI. Local dev still uses it
    // if you set `platformProxy: { enabled: true }` explicitly.
    platformProxy: {
      enabled: false,
    },
  }),
});
