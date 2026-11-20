import js from "@eslint/js";

export default [
  {
    ignores: [
      "node_modules/**",
      "venv/**",
      ".idea/**",
      "web-ext-artifacts/**",
      "relay/.wrangler/**",
      "relay/dist/**",
      "extension/lib/Readability.js",
    ],
  },
  js.configs.recommended,
];