# Changelog

## 0.1.0 - 2026-04-27

### Added
- 项目注册：通过 Git URL 克隆仓库，支持私有仓库 Token 认证
- 分析引擎：自动识别 TypeScript 项目的模块结构和依赖关系
  - 基于一级目录的模块检测
  - Regex 解析器提取 import/export
  - 支持 tsconfig.json path alias 解析
  - 外部依赖（node_modules）自动过滤
- 模块地图：ReactFlow + elkjs 实现交互式可视化
  - 节点大小映射代码量
  - 节点颜色映射复杂度（绿/黄/红）
  - 边粗细映射依赖强度
  - 点击模块查看详情（文件列表、导出符号、依赖关系）
- MCP Server：5 个 tools 供 AI 查询项目结构
  - get_projects / get_project_overview / get_module_detail
  - get_dependencies / get_impact_analysis
- Docker 部署：单容器（backend + nginx）一键启动
- REST API：项目 CRUD + 扫描触发 + 模块查询 + 依赖图
