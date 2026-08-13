# 聚餐地图项目进度

最后更新：2026-08-14

## 项目定位

- GitHub 仓库：`https://github.com/skdfndh/dining-map`
- 参与者展示页：`https://skdfndh.github.io/dining-map/`
- 组织者编辑器：`https://skdfndh.github.io/dining-map/editor.html`
- 技术栈：Vite、React、TypeScript、高德 Web 端 JavaScript API、IndexedDB、GitHub Pages。
- 部署形态：纯静态多页面网站，不使用后端和数据库。
- 本地编辑器密码：`dinner`，仅用于防止误入，不属于安全认证。

## 当前完成度

OpenSpec 变更名称为 `build-dining-map`，采用 `spec-driven` 工作流。目前 76 项任务中已完成 71 项，剩余 5 项均为正式发布前或真实设备验收任务。

已实现的主要能力：

- 编辑器与参与者展示页完全分离。
- 新建聚餐、恢复上个活动、IndexedDB 自动保存、JSON 导入导出。
- 省、市、可选区县联动选择和空活动地图大概定位。
- 高德搜索、地图右键选点、悬停地名后精确右键选择、高德/百度链接解析降级。
- 精确时间、上午/下午等模糊时段、待定时间、结束时间和跨日时间。
- 待安排地点快捷删除；把已有时间的待安排地点按时间顺序一键追加到现有行程。
- 地图地点牌直接显示开始与结束时间，例如 `14:30–16:30`；跨日显示结束日。
- 手机地图逐站浏览、完整路线、已到达/撤销、当前站推断、高德/百度导航。
- 活动级与站点级费用、均分/权重/自定义/固定后分配、多人垫付、个人账单和简化转账。
- 编辑器预览、发布校验、结算 CSV 导出。

## 最近完成的路线修复

此前路线存在两个逻辑问题：新路段只进入 `stale` 状态但不自动计算；骑行结果使用高德的 `rides` 字段，而旧解析器只读取 `steps/segments`，导致骑行路线被错误替换为端点直线。

当前行为已经调整为：

- 新形成的相邻路段默认自动计算步行道路路线，无需先点击路线卡或计算按钮。
- 切换为骑行、驾车、打车或公交后自动重新计算相应道路路线。
- `计算中`不绘制误导性的端点直线。
- 只有高德算路失败或交通方式为自定义时才使用虚线端点连接。
- 骑行的 `rides` 和公交嵌套段可以正确提取道路折线。
- 少于两个有效折线点的返回结果不会被标记为“已冻结”。
- 旧草稿中曾被误标为成功的端点直线，重新打开或导入后会自动失效并重算。
- 页面实测：切换骑行后无需点击计算按钮，示例路线得到 `2.4 km / 10 分钟`并进入“已冻结”。

## 当前验证结果

- TypeScript 类型检查通过。
- ESLint 无错误或警告。
- 生产构建通过。
- 29 个单元与组件测试通过。
- 12 个桌面/窄屏端到端场景已覆盖；一次展示页首次导航出现环境性超时，单独复跑后通过。
- 本地高德地图实测确认默认步行自动算路和骑行自动重算有效。

## 本地使用

在项目根目录运行：

```bash
npm install
npm run dev -- --host 127.0.0.1
```

然后访问：

- 展示页：`http://127.0.0.1:5173/`
- 编辑器：`http://127.0.0.1:5173/editor.html`

高德本地凭据保存在被 Git 忽略的 `.env.local` 中。不要把该文件提交到仓库。

## 完成活动后发布给观看者

1. 在编辑器中确认相邻路线都显示“已冻结”，没有意外的“算路失败”。
2. 点击“预览”，检查手机地图、时间、参与人和费用状态。
3. 点击“JSON”下载最新 `event.json`。
4. 用下载文件覆盖仓库中的 `public/event.json`。
5. 提交并推送到 `main` 分支。
6. GitHub Actions 的 `Deploy GitHub Pages` 工作流会自动构建并部署。
7. 工作流成功后，把 `https://skdfndh.github.io/dining-map/` 发给参与者。

编辑器地址不需要发给参与者。以后修改活动或补账时，重新导出、替换 `public/event.json` 并推送即可更新同一个观看链接。

## GitHub 与安全状态

- 部署工作流位于 `.github/workflows/deploy-pages.yml`，只在 `main` 分支推送后部署。
- 工作流从 GitHub Actions Secrets 读取 `VITE_AMAP_KEY` 和 `VITE_AMAP_SECURITY_CODE`。
- `.env.local`、构建产物、依赖目录和测试产物均被 Git 忽略。
- 纯静态前端无法真正隐藏 Web JS API 凭据。正式对外使用前，必须在高德控制台把该 Key 的允许域名限制为 `skdfndh.github.io`，不要给它开放任意来源。
- 当前简单密码也不能保护公开源码或活动数据，不应在活动中填写敏感隐私。

## 接下来计划

按优先级继续：

1. 合并当前实现分支到 `main`，触发首次 GitHub Pages 部署。
2. 确认仓库 `Settings → Pages` 的 Source 为 `GitHub Actions`。
3. 检查首次部署工作流并验证展示页、编辑器、静态资源和 `public/event.json` 在项目子路径正常加载。
4. 在高德控制台配置 `skdfndh.github.io` 域名白名单；如当前凭据曾用于其他场景，正式发布前轮换为此项目专用凭据。
5. 在桌面 Chrome/Edge/Firefox 和真实 iOS/Android 手机完成布局、横竖屏、文字溢出与安全区验收。
6. 完成键盘操作、焦点、对比度、减少动画和地图错误界面验收。
7. 使用 iOS/Android 普通浏览器及微信内置浏览器，填写 `docs/navigation-test-matrix.md` 中的高德/百度导航结果。
8. 所有发布验收完成后，将 OpenSpec `build-dining-map` 变更归档。

## 下次继续时建议先检查

```bash
git status -sb
openspec instructions apply --change build-dining-map --json
npm run typecheck
npm run test
gh run list --repo skdfndh/dining-map --workflow "Deploy GitHub Pages" --limit 5
```

如果 GitHub Pages 尚未上线，优先检查：当前分支是否已合并到 `main`、Actions Secrets 是否存在、Pages Source 是否为 GitHub Actions，以及高德域名白名单是否允许正式站点。
