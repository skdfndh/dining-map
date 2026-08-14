# 行政区中心点数据说明

编辑器内置的省级、地级市近似中心点来自 [Supeset/China-GeoData](https://github.com/Supeset/China-GeoData)，使用其提交 `5822c4c0a0bdfd73327f9454976c8661bfd6ad9f` 中的 `china_province_full.geojson` 与 `china_province_city_full.geojson` 派生生成。

原项目采用 MIT License。项目只保留“六位行政区代码 → 中心点”这一小型派生表，不包含行政区边界。区县没有独立离线中心时回退到所属地级市中心，因此该数据只用于编辑时的大概定位，不用于导航、距离计算或精确地址判断。

如需更新，运行：

```bash
node scripts/update-area-centers.mjs
```

更新时应同时核对源项目许可证、固定新的提交版本，并运行全部地图回归测试。
