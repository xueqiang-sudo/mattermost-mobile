# ERP 应用原生化改造 - 快速参考

## 改造完成

5个 ERP 应用已从 WebView 改造为原生 React Native 组件：

✅ **热销榜** (hotproducts) - `erp/hot_products_screen.tsx`
✅ **审批清单** (approvals) - `erp/approvals_screen.tsx`  
✅ **流水账** (finance) - `erp/finance_screen.tsx`
✅ **销售统计** (sales) - `erp/sales_screen.tsx`
✅ **库存分析** (inventory) - `erp/inventory_screen.tsx`

## 修改文件清单

| 文件 | 修改类型 | 说明 |
|------|---------|------|
| `app/screens/home/apps/api.ts` | 新增 | API 层 + 类型定义 (~300行) |
| `app/screens/home/apps/erp/hot_products_screen.tsx` | 新建 | 热销榜屏幕 (~700行) |
| `app/screens/home/apps/erp/approvals_screen.tsx` | 新建 | 审批清单屏幕 (~510行) |
| `app/screens/home/apps/erp/finance_screen.tsx` | 新建 | 流水账屏幕 (~620行) |
| `app/screens/home/apps/erp/sales_screen.tsx` | 新建 | 销售统计屏幕 (~690行) |
| `app/screens/home/apps/erp/inventory_screen.tsx` | 新建 | 库存分析屏幕 (~690行) |
| `app/constants/screens.ts` | 修改 | 新增5个屏幕常量 |
| `app/screens/home/apps/apps.tsx` | 修改 | 新增5个导航处理 |
| `app/screens/home/apps/apps_stack.tsx` | 修改 | 新增5个 Stack 屏幕 |
| `app/screens/home/apps/apps_stack_param_list.ts` | 修改 | 新增5个参数类型 |

**新增代码**: ~3500行

## 核心 API

```typescript
// 热销榜
fetchHotProducts(serverUrl, teamId, from?, to?)

// 审批清单
fetchApprovals(serverUrl, teamId)
postApprovalAction(serverUrl, doctype, name, action, teamId)

// 流水账
fetchCashJournal(serverUrl, teamId, from?, to?, type?)

// 销售统计
fetchSales(serverUrl, teamId, months?, from?, to?)

// 库存分析
fetchInventory(serverUrl, teamId, days?, deadDays?, agingDays?, warehouse?)
fetchWarehouseList(serverUrl, teamId)
```

## 测试要点

1. **权限**: 只有 ERP 团队可见（`erpOnly: true`）
2. **数据隔离**: 通过 `team_id` 参数
3. **主题**: 支持深色/浅色
4. **国际化**: 所有文本支持多语言
5. **下拉刷新**: 所有屏幕支持

## 下一步

- 在真机上测试所有功能
- 验证 API 数据格式
- 优化加载性能
- 添加数据缓存
