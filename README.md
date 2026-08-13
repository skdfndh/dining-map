# Dining Map / 聚餐地图

一个面向聚餐活动的静态地图模板：组织者在桌面编辑地点、时间、参与人、交通与费用，参与者在手机地图中查看行程、导航、记录个人进度并查看 AA 结算。

## 当前状态

项目目前处于规格与任务规划阶段，应用代码尚未开始实现。

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

## 安全说明

请勿提交真实密码、访问令牌或未限制域名的地图服务凭据。纯静态前端中的配置可被访问者查看，正式发布前应使用项目专用凭据并设置允许域名。

