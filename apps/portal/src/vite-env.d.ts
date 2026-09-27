/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 钉钉企业 corpId（免登骨架，批次 F）：未配置时登录页不渲染免登入口。 */
  readonly VITE_DINGTALK_CORP_ID?: string;
}
