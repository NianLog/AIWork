const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Linter } = require('eslint');
const config = require('../index.cjs');

const lint = (code) => new Linter().verify(code, config);

for (const code of [
  'window.top.location.href = "/";',
  'window["top"].location.href = "/";',
  'globalThis.top.location.href = "/";',
  'top.location.href = "/";',
  'document.cookie = "token=value";',
  'document["cookie"] = "token=value";',
  'localStorage.setItem("token", "value");',
  'window.localStorage.setItem("token", "value");',
  'self["localStorage"].setItem("token", "value");',
  'eval("code");',
  'new Function("return 1");',
  'setTimeout("code", 1);',
  'importScripts("remote.js");',
  'self.importScripts("remote.js");',
  'window["importScripts"]("remote.js");',
  'window.parent.postMessage("value", "*");',
  'window["parent"]["postMessage"]("value", "*");',
  'parent.postMessage("value", "*");',
  'import dd from "dingtalk-jsapi";',
  'import config from "dingtalk-jsapi/runtime/permission/requestAuthCode";',
  'import("dingtalk-jsapi");',
  'require("dingtalk-jsapi");',
  'dd.config({});',
]) {
  test(`拦截子应用违规调用：${code}`, () => {
    const messages = lint(code);
    assert.equal(messages.some((item) => item.fatal), false, '不能以解析失败代替规则生效');
    assert.ok(messages.some((item) => item.severity === 2), '违规调用必须报错');
  });
}

for (const code of [
  'portal.event.emit("ai-image:task:created", {});',
  'portal.invoke("biz.util.openLink", { url: "/help" });',
  'sessionStorage.setItem("token", "value");',
  'const cookie = { description: "普通业务字段" }; cookie.description;',
  'const localStorage = { value: 1 }; localStorage.value;',
  'const stop = portal.event.on("ai-image:task:created", () => {}); stop();',
  'import { bootstrapStandalone } from "@ai-portal/shared-sdk";',
]) {
  test(`允许合规宿主交互：${code}`, () => {
    assert.deepEqual(lint(code), []);
  });
}
