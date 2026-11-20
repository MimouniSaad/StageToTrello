import js from "@eslint/js";
import globals from "globals";

export default [
  // 1. Fichiers qui ne sont pas notre code (ESLint ne lit pas le .gitignore)
  {
    ignores: [
      "node_modules/**",
      "venv/**",
      ".idea/**",
      "web-ext-artifacts/**",
      "relay/.wrangler/**",
      "relay/dist/**",
      "extension/lib/Readability.js", // bibliothèque de Mozilla, non modifiée
    ],
  },

  // 2. Règles recommandées, pour tous les fichiers
  js.configs.recommended,

  // 3. Extension Firefox : scripts classiques qui partagent des objets globaux
  {
    files: ["extension/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.browser,
        browser: "readonly", // API des extensions (WebExtensions)
        CONFIG: "readonly", // extension/config.js
        Core: "readonly", // lib/core.js
        Markdown: "readonly", // lib/markdown.js
        Relay: "readonly", // lib/relay.js
        TrelloApi: "readonly", // lib/trello.js
        Quota: "readonly", // lib/quota.js
        AddOffer: "readonly", // lib/add.js
        Readability: "readonly", // lib/Readability.js, injecté avant page.js
        // Les fichiers de lib/ s'exportent aussi pour les tests Node :
        // if (typeof module === "object") module.exports = …
        module: "readonly",
        require: "readonly",
      },
    },
    rules: {
      // Chaque fichier de lib/ définit l'objet global qu'il partage (const Core = …) :
      // ce n'est pas une redéclaration, même s'il figure dans la liste ci-dessus.
      "no-redeclare": ["error", { builtinGlobals: false }],
    },
  },

  // 4. Relais : Cloudflare Worker, modules ES
  {
    files: ["relay/src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.serviceworker,
      },
    },
  },

  // 5. Tests du relais : Node, modules ES (relay/package.json → "type": "module")
  {
    files: ["relay/test/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
  },

  // 6. Tests et scripts : Node, CommonJS (require / module.exports)
  {
    files: ["tests/**/*.js", "scripts/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        Core: "writable", // certains tests définissent global.Core pour lib/relay.js et lib/add.js
      },
    },
  },
];
