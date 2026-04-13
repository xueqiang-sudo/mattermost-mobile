---
name: mattermost-mobile-delivery
description: Mattermost Mobile 交付自检 Skills A–G。在新屏/大改 UI、加文案主题、异步状态、声称完成或提交前，必须按本 Skill 逐项执行；与 .cursor/rules/mattermost-mobile-ai-standards.mdc（Rules）配套。
---

# Mattermost Mobile：交付自检 Skills（A–G）

**Rules（规矩）** 在 `.cursor/rules/mattermost-mobile-ai-standards.mdc`。本 Skill 只描述 **交付前如何自检**：做什么、何时做、怎么验收。

**Plan 模板**：`docs/development/ai-feature-plan-template.md`（须含 UI 草图、视觉规格、设计理由后再编码）。

---

## Skill A — UI 合成（高端标准）

- **能力说明**：把 Plan 里的视觉规格落到实现，保证高级、克制、统一，而非 demo。
- **使用时机**：新屏或大改 UI。
- **执行动作**：先完成 Plan 模板中的 **UI 草图 + 视觉规格 + 设计理由**；间距仅用 `4/8/12/16/20/24/32`；四级 typography（Title / Section / Body / Caption）；颜色 ≤3–4 角色且全 `theme`；Section + Card + 统一圆角与 subtle border；主按钮 disabled、列表 press 反馈。
- **自检**：若看起来像 demo（挤、乱、色杂），**退回改 Plan 再编码**。

## Skill B — 组件设计

- **能力说明**：高内聚低耦合，便于测试与复用。
- **使用时机**：拆分功能或列表。
- **执行动作**：容器负责订阅 DB / 调 action；展示组件纯 props；列表行独立文件；避免在 `map` 里写内联 `onPress={() => ...}`。

## Skill C — 结构与性能

- **能力说明**：长列表与重渲染场景下保持流畅。
- **使用时机**：长列表或滚动卡顿风险。
- **执行动作**：优先 `@shopify/flash-list` + `estimatedItemSize`；样式用 `makeStyleSheetFromTheme` 缓存；`useCallback` 传给子项的处理器。

## Skill D — 国际化

- **能力说明**：用户可见文案可翻译、可维护。
- **使用时机**：任何用户可见字符串。
- **执行动作**：`defineMessages` + `useIntl().formatMessage`；key 建议 `screen.feature.element`；与上游流程一致时仅 `assets/base/i18n/en.json` 增键（若 `.cursor/rules/i18n-zh-en.mdc` 命中则按其同步多语言）。

## Skill E — 主题适配

- **能力说明**：明暗主题与品牌色一致，无硬编码语义色。
- **使用时机**：任何颜色、导航栏/状态栏外观。
- **执行动作**：逐项映射 `theme.*`；半透明用 `changeOpacity`；错误文案用 `theme.errorTextColor` 等语义字段。

## Skill F — UX 状态

- **能力说明**：异步场景体验完整、可恢复。
- **使用时机**：拉取数据、搜索无结果、权限或网络失败。
- **执行动作**：Loading / Empty / Error 三态齐全；`logError('[Context]', err)` + i18n 用户文案；必要时提供重试。

## Skill G — 提交前审查

- **能力说明**：合并前与 CI 对齐，减少返工。
- **使用时机**：声称任务完成或准备提交前。
- **执行动作**：对照 `.cursor/rules/mattermost-mobile-ai-standards.mdc` 全文 **Rules** 快速勾选；运行 `npm run tsc` 与 `npm run fix`；交互功能尽量用 Mobile MCP 验证（不可用则说明并保证静态检查通过）。

---

## 执行顺序建议

1. 任务开始前：用户确认 Plan（含 UI 草图 / 视觉规格 / 设计理由）后再编码。
2. 编码过程中：随功能触达 **B → C → D → E → F**。
3. UI 相关：始终以 **A** 为门槛。
4. 收尾：**G** 必做。
