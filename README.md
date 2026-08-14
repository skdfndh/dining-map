# Dining Map / 聚餐地图

一个面向聚餐活动的静态地图模板：组织者在桌面编辑地点、时间、参与人、交通与费用，参与者在手机地图中查看行程、导航、记录个人进度并查看 AA 结算。

## 当前状态

第一版已经实现，可在本地运行、编辑活动数据并构建为 GitHub Pages 静态站点。

- 初始讨论记录：[`design0.md`](./design0.md)
- OpenSpec 变更：[`openspec/changes/build-dining-map`](./openspec/changes/build-dining-map)
- 实施任务：[`tasks.md`](./openspec/changes/build-dining-map/tasks.md)

## 计划架构

- GitHub Pages 纯静态部署
- Vite + TypeScript 多页面应用
- 桌面组织者编辑器与手机参与者展示页分离
- 高德 Web 端 JavaScript API 地图与路线
- 版本化 `event.json` 数据交换
- 多模式 AA 分摊、多人垫付与简化转账

## 本地运行

```bash
npm install
copy .env.example .env.local
npm run dev
```

- 参与者页面：`http://localhost:5173/`
- 组织者编辑器：`http://localhost:5173/editor.html`
- 默认演示密码：`dinner`

在 `.env.local` 中配置高德 Web 端 JS API Key 和安全密钥。未配置或地图加载失败时，页面仍会显示冻结路线的纸质示意图。

## 验证

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## 发布一次活动

1. 打开编辑器，填写活动、参与人、地点、时间、路线和费用。
2. 编辑器会将草稿自动保存到当前浏览器；顶部“草稿箱”可在不同活动的最新草稿之间恢复和管理。
3. 点击“JSON”下载 `event.json`。
4. 用下载文件替换 `public/event.json`，提交并推送到 GitHub。
5. GitHub Actions 构建并发布展示页与编辑器。

活动结束后可重新导入旧 `event.json`，补充金额和垫付记录，再次导出并替换。

详细说明见 [`docs/usage.md`](./docs/usage.md)。

## 数据来源

省级和地级市近似中心点由 MIT 许可的 [Supeset/China-GeoData](https://github.com/Supeset/China-GeoData) 派生，用于省市区选择后的离线大概定位；详细版本和更新方式见 [`docs/data-attribution.md`](./docs/data-attribution.md)。

## 安全说明

请勿提交真实密码、访问令牌或未限制域名的地图服务凭据。纯静态前端中的配置可被访问者查看，正式发布前应使用项目专用凭据并设置允许域名。
