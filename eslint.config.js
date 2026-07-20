import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * ESLint — le FILET DE SÉCURITÉ qui manquait.
 *
 * La règle qui compte ici est `react-hooks/exhaustive-deps` : c'est elle qui aurait attrapé
 * TOUT SEUL le bug du compte à rebours bloqué à 1 (une dépendance manquante dans un useEffect →
 * l'effet ne rejouait pas quand le MUSE était mis sur la tête). Avec ~60 useEffect dans App.tsx,
 * c'est la classe de bug la plus coûteuse du projet.
 *
 * Choix volontaire : on démarre en WARN, pas en ERROR. Le code existant a des violations
 * historiques ; on veut les VOIR sans bloquer les builds, puis les résorber au fil de l'eau.
 * `npm run lint:strict` fait échouer dès le premier avertissement (utile avant une release).
 */
export default tseslint.config(
  { ignores: ['dist/**', 'release/**', 'node_modules/**', '_baseline-*/**', 'native/**', '*.cjs'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.worker },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // ── LA règle qui justifie tout ce fichier ────────────────────────────────
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // ── Bruit connu du projet : on n'invente pas une dette qu'on ne traitera pas ──
      // Beaucoup de `any` aux frontières du worker (129 recensés) : signalés, pas bloquants.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Variables préfixées par _ = volontairement inutilisées (convention déjà en place).
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      // `void x` est utilisé exprès dans certains composants pour consommer une prop.
      '@typescript-eslint/no-unused-expressions': 'off',
      // Le code utilise des directives ts-* ponctuelles et assumées.
      '@typescript-eslint/ban-ts-comment': 'off',
      // console.* : 114 occurrences, dont du diagnostic utile en séance → on avertit seulement
      // sur log/debug, on laisse warn/error (diagnostic MUSE, quota storage...).
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
);
