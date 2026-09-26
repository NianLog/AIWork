module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  // eslint-config-mfe 放最后：子应用边界规则（禁 top/parent/localStorage/cookie/
  // 直连钉钉 JSAPI）必须生效，不能被前面的预设关掉。
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    '@ai-portal/eslint-config-mfe',
  ],
};
