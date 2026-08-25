import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // no-explicit-any is a warning rather than an error here.
    //
    // The codebase carries a few hundred of them, largely at the boundaries
    // where LangChain agent payloads and Gemini responses arrive untyped.
    // Tightening those is worth doing and is not worth blocking every build on
    // until it is done — as an error this rule made `next build` fail outright,
    // which is how the project came to be unbuildable. Left visible as warnings
    // so the count is a debt that can be paid down rather than one that is
    // hidden.
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  {
    // Test files mock external services, and typing a mock precisely buys
    // nothing — the value of a test double is that it stands in for the shape
    // the code uses, not that it reimplements the real type. Unused bindings in
    // fixtures are equally not worth failing a build over.
    files: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/__tests__/**",
      "jest.setup.js",
      "jest.polyfills.js",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-require-imports": "off",
      "react/display-name": "off",
    },
  },
];

export default eslintConfig;
