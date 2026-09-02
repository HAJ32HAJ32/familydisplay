import typescriptParser from "@typescript-eslint/parser";

export default [
  { ignores: ["**/dist/**", "**/coverage/**", "node_modules/**", "**/*.tsbuildinfo"] },
  {
    files: ["**/*.ts"],
    languageOptions: { parser: typescriptParser },
    rules: { "no-debugger": "error" }
  }
];
