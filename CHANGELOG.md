# Changelog

## 0.4.0 - 2026-04-28

### Added — 智能标注系统（五层语义理解）
- Layer 1: 项目概述自动生成（package.json + README + 框架检测）
- Layer 2: 文件功能描述（模板规则引擎：文件名模式 + 导出特征 + 动词映射）
- Layer 3: 角色标签（entry/hub/core/utility/type/config/leaf）基于图分析
- Layer 4: 逻辑分组（前缀聚类，同目录文件 >6 时触发）
- Layer 5: 影响半径（BFS 传递依赖计算，实时返回）
- `POST /api/projects/:id/annotate` 手动修改描述接口
- 前端节点卡片显示描述 + 彩色角色 tag
- 详情面板描述可编辑（铅笔图标 → inline input → 保存）
- 详情面板显示影响半径 + 风险等级
- ProjectView header 显示项目一句话概述
- DB migration: files/modules 加 description/role 字段, 新增 file_groups 表

## 0.3.0 - 2026-04-27

### Added — 层级式模块地图
- 新增 `GET /api/projects/:id/tree?path=` 接口：按目录层级返回子项 + 聚合指标 + 依赖边
- 文件级 import 解析：从 `files.imports` JSON 构建文件间依赖，聚合到当前层级
- ModuleNode 双形态：目录卡片（可展开）+ 文件卡片（紧凑）
- GroupNode 新组件：展开后的目录容器（半透明背景 + 虚线边框）
- 层级 ELK 布局：支持嵌套 group node 的自动排列
- 双击目录节点展开/收起，保留上层上下文
- 边按权重分色分线型：虚线（弱）/实线（中）/动画 cyan（强）
- Store 扩展：treeCache + expandedPaths 管理展开状态

## 0.2.0 - 2026-04-27

### Changed — Frontend Dashboard Overhaul
- 设计系统：CSS 变量 token 体系（配色/字体/动画），JetBrains Mono 数据字体
- 新增 framer-motion 动画库
- 后端 `GET /api/projects` 返回 `ProjectWithStats[]`（含 stats 聚合）
- ProjectList 重做为仪表盘首页：聚合统计条 + 项目卡片网格 + Modal 表单 + 空状态
- ProjectView 增加指标条 + 扫描进度条动画 + 加载 spinner
- ModuleNode 全面重做：顶部色条 + 复杂度进度条 + glow 选中态
- ModuleMap：径向渐变背景 + 边按权重分色分线型 + 点状网格
- ModuleDetail：三 Tab 面板（概览/依赖/文件）+ 滑入动画 + 文件搜索
- App 层页面切换加 AnimatePresence 过渡

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
