/** 子应用专用基础规则；宿主工程不要继承这些窗口及钉钉限制。 */
const forbiddenWindowMembers = [
  ['top', '禁止访问顶层窗口。'],
  ['parent', '禁止绕过宿主桥接访问父窗口，请使用 portal.event。'],
  ['localStorage', '子应用统一使用 sessionStorage，避免持久化敏感信息。'],
  ['importScripts', '禁止动态加载 Worker 脚本。'],
];

const windowSelectors = forbiddenWindowMembers.flatMap(([property, message]) => [
  {
    selector: `MemberExpression[object.name=/^(window|globalThis|self)$/][computed=false][property.name='${property}']`,
    message,
  },
  {
    selector: `MemberExpression[object.name=/^(window|globalThis|self)$/][computed=true][property.value='${property}']`,
    message,
  },
]);

module.exports = {
  env: { browser: true, es2020: true },
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  rules: {
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-restricted-globals': ['error',
      { name: 'top', message: '禁止访问顶层窗口。' },
      { name: 'parent', message: '请使用 portal.event 通信。' },
      { name: 'localStorage', message: '请使用 sessionStorage。' },
      { name: 'importScripts', message: '禁止动态加载 Worker 脚本。' },
    ],
    'no-restricted-imports': ['error', {
      patterns: [{
        group: ['dingtalk-jsapi', 'dingtalk-jsapi/**', 'dd-jsapi', 'dd-jsapi/**'],
        message: '钉钉鉴权由宿主统一管理，请使用 portal.invoke。',
      }],
    }],
    'no-restricted-syntax': ['error',
      ...windowSelectors,
      {
        selector: "MemberExpression[object.name='document'][computed=false][property.name='cookie']",
        message: '禁止子应用读写 Cookie。',
      },
      {
        selector: "MemberExpression[object.name='document'][computed=true][property.value='cookie']",
        message: '禁止子应用读写 Cookie。',
      },
      {
        selector: "MemberExpression[object.name='dd'][computed=false][property.name='config']",
        message: 'dd.config 仅能由宿主调用。',
      },
      {
        selector: "MemberExpression[object.name='dd'][computed=true][property.value='config']",
        message: 'dd.config 仅能由宿主调用。',
      },
      {
        selector: 'ImportExpression[source.value=/^(dingtalk-jsapi|dd-jsapi)($|\\u002F)/]',
        message: '禁止动态导入钉钉 SDK，请使用 portal.invoke。',
      },
      {
        selector: 'CallExpression[callee.name="require"][arguments.0.value=/^(dingtalk-jsapi|dd-jsapi)($|\\u002F)/]',
        message: '禁止直接加载钉钉 SDK，请使用 portal.invoke。',
      },
    ],
  },
};

// 本包只做静态语法检查；别名绕过、卸载资源清理、CORS、上传密钥扫描仍需专项检查。
