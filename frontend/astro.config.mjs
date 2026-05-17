import cloudflare from "@astrojs/cloudflare";
import preact from "@astrojs/preact";
import unocss from "@unocss/astro";
import { defineConfig } from "astro/config";

export default defineConfig({
  output: "server",
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
  }),
  integrations: [
    preact({
      compat: true,
    }),
    unocss(),
  ],
});
