# 词根织网

通过词族导图理解单词，通过逐词主动回忆与间隔复习巩固记忆。

**公开体验：https://pqx-666.github.io/root-word-weave/**

当前公开版来自 2026-10-10 已完成交互审查的版本，保留 104 个词族、1503 个独立词条、35 个追加义项、161 张构词知识卡和已有学习交互。GitHub Pages 适配发布于 2026-10-11。

## 使用

- **学习**：一个入口续学、复习到期词或学习新词。先隐藏中文，尝试回忆后揭示，根据揭示前的表现选择三档。
- **探索**：查询词卡、词根词缀、浏览和导出词族导图，或按词族自由刷词。
- **我的**：调整目标、每日学习量、温暖或简洁文案，查看积累并导入、导出备份。

学习按四级、六级或当前雅思拓展库筛选。每个义项分别记录复习日期；同一拼写跨词族共用记录。轻量学习最多选取 5 个初始项目，必要时继续有限巩固。日计划和巩固全部完成才算全天打卡。

首次词义评分安排次日复习，之后根据独立回忆表现调整间隔。导图和提示有助于理解，依赖提示的作答会单独记录。三档自评、打卡和当场答对不等于永久掌握；目前没有宣称经过对照实验验证的学习效率优势。

## 记录与备份

**公开版无需登录，学习记录保存在当前浏览器的 IndexedDB。** 不向 GitHub 上传个人学习记录。不同设备、浏览器或无痕会话各自记录；清除网站数据会移除当地记录。更换设备或清理数据前，在“我的 → 导出学习记录”保存 JSON 文件，在另一台设备导入继续。

已有私有版本的记录不会自动转移，请先在原版导出，然后在公开版导入。相同词条 ID 和备份结构保持兼容。多个标签页同时修改时有原子版本检查，冲突会停止覆盖并提示导出、刷新。浏览器拒绝存储或空间不足时明确提示保存失败，可重试并导出备份。

## 本地运行

需要 Node.js 24。静态公开版无需安装依赖：

```sh
node scripts/build-pages.mjs
node scripts/serve-pages.mjs
```

打开 http://127.0.0.1:4177/root-word-weave/ 。`npm start` 也会先构建再启动。`PAGES_PREVIEW_PORT` 可设置端口。

## 部署

推送到 `main` 后，`.github/workflows/pages.yml` 会验证学习引擎与备份边界、构建 `_site`，通过 GitHub Actions 发布到 GitHub Pages。仓库 Pages 的发布源为 GitHub Actions。

`dist` 保存界面、学习引擎与编译后的词库；`data` 保存内容源与复核说明。`adapters/browser-storage.js` 是公开版存储适配器，构建时覆盖输出目录中的 `storage.js`。原有 `server`、数据库定义、云端适配代码与开发脚本保留用于后续扩展；GitHub Pages 部署不运行服务器，不使用私有平台身份或数据库。云端部署配置和历史用户数据不在此仓库。

修改词库源后运行 `node scripts/prepare-library.mjs` 再构建。其他内容整合脚本属于既有编辑流程，运行前先阅读其输入要求。

```sh
node scripts/check.mjs
node scripts/check-meaning.mjs
node scripts/check-humane.mjs
node scripts/check-backup-boundary.mjs
node scripts/check-plan-boundary.mjs
node scripts/build-pages.mjs
node scripts/check-pages.mjs
```

浏览器检查可安装 Playwright，并使用已安装的 Microsoft Edge：`node scripts/qa-pages.cjs`。也可通过 `PLAYWRIGHT_MODULE` 指定 Playwright 模块路径，`PAGES_QA_ORIGIN` 指定公开版测试地址。该测试使用独立浏览器上下文，不操作真实学习记录。

## 内容边界

四、六级仅对已经匹配官方大纲的词目标注，不宣称完整覆盖。雅思模式展示当前精编库及拓展义项，不是封闭的官方雅思词表。词源联系与英语造词步骤会区分，记忆联想不替代词源解释。已有来源核验的音标覆盖 190 个词，朗读使用设备英语语音。内容仍应持续复核、扩充常用义项与高频独立词。
