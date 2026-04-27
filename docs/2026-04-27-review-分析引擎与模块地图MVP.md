# Review Report: 分析引擎与模块地图 MVP

## 审查概要
**审查日期**：2026-04-27
**对应设计文档**：2026-04-27-分析引擎与模块地图MVP.md
**审查结论**：有问题需修复

## 审查结果

### 架构对齐
| 检查项 | 状态 | 说明 |
|--------|------|------|
| 接口实现与设计一致 | ✅ | 全部 API 端点已实现 |
| 前端交互与设计一致 | ⚠️ | 缺少孤立模块标记、自定义 DependencyEdge、项目设置页 |
| 数据模型与设计一致 | ✅ | 四表结构 + CASCADE + 事务写入 |
| 解析引擎选型偏差 | ⚠️ | 从 tree-sitter 降级为 regex（开发中有意决策，需回溯更新设计文档） |

### 代码质量

| 问题 | 严重度 | 文件 | 建议 |
|------|--------|------|------|
| crypto.ts 硬编码 salt | P0 | utils/crypto.ts:14 | 每次加密生成随机 salt 并附加到密文 |
| parser.ts 多行 import 解析失败 | P1 | analysis/parser.ts | 预处理合并多行 import 后再 regex 匹配 |
| parser.ts 注释过滤粗糙 | P1 | analysis/parser.ts | 增加多行注释状态跟踪 |
| scanJobs 内存无上限无清理 | P1 | analysis/index.ts:11 | 完成后 TTL 清理 |
| scan 状态 cloning 从未出现 | P1 | routes/projects.ts:156 | 在 pull 前设置状态 |
| git clone URL 含 token 可能泄露到日志 | P1 | analysis/git.ts | 配置 simple-git 禁止 debug 输出 |
| CORS origin: true | P1 | server.ts:9 | 改为环境变量配置白名单 |
| Zod 验证错误未处理 | P1 | routes/projects.ts | 用 safeParse 或全局错误处理器 |
| ProjectView 中 getState() 不触发重渲染 | P1 | pages/ProjectView.tsx:71 | 改用 hook selector |
| 缺少 .dockerignore | P1 | 项目根 | 添加排除 node_modules/.git |
| 前端缺少 delete/update project UI | P2 | 前端 | 补充项目设置入口 |
| clone 失败后孤儿目录未清理 | P2 | routes/projects.ts | catch 分支清理 |

### 安全检查
| 检查项 | 状态 | 说明 |
|--------|------|------|
| SQL 注入 | ✅ | 全部参数化查询 |
| XSS | ✅ | React 默认 escape |
| 硬编码密钥 | ✅ | 从环境变量读取 |
| Token 加密算法 | ✅ | AES-256-GCM 正确 |
| Token 加密 salt | ❌ | 硬编码 salt 削弱安全性 |
| 敏感信息泄露 | ❌ | git URL 含明文 token 可能进日志 |
| CORS | ❌ | 允许所有来源 |
| 输入验证 | ⚠️ | Zod 验证存在但错误未优雅处理 |

## 总结
- **必须修复**（P0）：1 个（crypto salt）
- **建议修复**（P1）：9 个
- **可选优化**（P2）：3 个

## 下一步
修复 P0 + 全部 P1 后可进入部署验证阶段。P2 项目可留到下轮迭代。
