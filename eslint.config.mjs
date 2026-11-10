import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import globals from 'globals'
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended, ...tseslint.configs.recommended, ...vue.configs['flat/essential'],
  { files: ['**/*.{ts,vue,mjs}'], languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  { files: ['**/*.vue'], languageOptions: { parserOptions: { parser: tseslint.parser } }, rules: { 'vue/multi-word-component-names': 'off' } },
  { files: ['src/core/**/*.ts'], rules: { 'no-restricted-imports': ['error', { patterns: ['vue', '../components/*', '../composables/*'] }], 'no-restricted-globals': ['error', 'window', 'document', 'localStorage'] } },
)
