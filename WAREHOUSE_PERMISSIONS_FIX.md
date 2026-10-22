# 仓库出入库权限配置修复

## 问题

角色权限管理中缺少仓库出库和入库权限的配置项。

## 解决方案

### 1. 添加权限配置项

**文件**: `app/screens/home/apps/role_management/role_management_screen.tsx`

在 `CONFIG_ITEMS` 中添加：

```typescript
{key: 'warehouse_inout', labelId: 'workbench.tab.warehouse_inout', defaultLabel: '出入库', erpOnly: true},
{key: 'warehouse_stock_in', labelId: 'workbench.permissions.warehouse_stock_in', defaultLabel: '入库权限', isFlag: true, parentFlag: 'warehouse_inout', erpOnly: true},
{key: 'warehouse_stock_out', labelId: 'workbench.permissions.warehouse_stock_out', defaultLabel: '出库权限', isFlag: true, parentFlag: 'warehouse_inout', erpOnly: true},
```

**权限层级结构**:
```
出入库 (warehouse_inout) - 父权限
  ├── 入库权限 (warehouse_stock_in) - 子权限
  └── 出库权限 (warehouse_stock_out) - 子权限
```

### 2. 添加类型定义

**文件**: `app/screens/home/apps/api.ts`

在 `DashboardAccess` 类型中添加：

```typescript
export type DashboardAccess = {
    // ... 其他字段
    warehouse_stock_in?: boolean;   // 入库权限
    warehouse_stock_out?: boolean;  // 出库权限
    // ...
};
```

## 权限配置说明

### erpOnly: true

所有仓库相关权限都标记为 `erpOnly: true`，意味着：
- 只有配置了 ERP 地址的团队才会显示这些权限项
- 与热销榜、审批清单、流水账、销售统计、库存分析保持一致
- 非 ERP 团队不会看到这些权限配置

### 父子权限关系

```typescript
{
    key: 'warehouse_stock_in',
    parentFlag: 'warehouse_inout',  // 依赖于 warehouse_inout
    isFlag: true                     // 这是一个开关权限
}
```

- `warehouse_stock_in` 和 `warehouse_stock_out` 都依赖于 `warehouse_inout`
- 只有当 `warehouse_inout` 权限启用时，子权限才会显示
- 角色管理界面会自动处理父子权限的显示逻辑

## 权限过滤逻辑

在 `role_management_screen.tsx` 的 `filteredConfigItems` 中：

```typescript
const filteredConfigItems = useMemo(() => {
    // ...
    return CONFIG_ITEMS.filter((item) => {
        // Filter out ERP-only items if team doesn't have ERP
        if (item.erpOnly && !isErpTeam) {
            return false;
        }
        // ... 其他过滤逻辑
        return true;
    });
}, [dashboardAccess]);
```

**过滤规则**:
1. 如果团队没有 ERP（`!isErpTeam`），隐藏所有 `erpOnly: true` 的权限项
2. 如果父权限未启用，隐藏子权限（由 UI 组件自动处理）

## 权限使用场景

### 场景1: 仓库管理员角色

配置：
- ✅ warehouse_inout: 启用
- ✅ warehouse_stock_in: 启用
- ✅ warehouse_stock_out: 启用

结果：可以执行入库和出库操作

### 场景2: 入库专员角色

配置：
- ✅ warehouse_inout: 启用
- ✅ warehouse_stock_in: 启用
- ❌ warehouse_stock_out: 禁用

结果：只能执行入库操作，无法出库

### 场景3: 出库专员角色

配置：
- ✅ warehouse_inout: 启用
- ❌ warehouse_stock_in: 禁用
- ✅ warehouse_stock_out: 启用

结果：只能执行出库操作，无法入库

### 场景4: 普通员工（无仓库权限）

配置：
- ❌ warehouse_inout: 禁用

结果：无法看到出入库功能（子权限自动隐藏）

## UI 显示逻辑

### ERP 团队的角色管理界面

```
ERP 应用权限
  ├── 热销榜
  ├── 审批清单
  ├── 流水账
  ├── 销售统计
  ├── 库存分析
  └── 出入库 ☑️
      ├── 入库权限 ☑️
      └── 出库权限 ☐
```

### 非 ERP 团队的角色管理界面

```
应用权限
  ├── 会话查询
  ├── 价格表
  ├── 云盘
  └── 知识库
  
（仓库相关权限不显示）
```

## 测试验证

### 测试步骤

1. **ERP 团队测试**:
   - [ ] 以管理员身份登录 ERP 团队
   - [ ] 进入 应用 → 角色管理
   - [ ] 验证"出入库"权限项显示
   - [ ] 验证"入库权限"和"出库权限"子项显示
   - [ ] 为不同角色配置权限

2. **非 ERP 团队测试**:
   - [ ] 以管理员身份登录非 ERP 团队
   - [ ] 进入 应用 → 角色管理
   - [ ] 验证"出入库"权限项不显示

3. **权限生效测试**:
   - [ ] 配置角色只有入库权限
   - [ ] 以该角色用户登录
   - [ ] 验证只能执行入库操作
   - [ ] 验证出库操作被拒绝

## 相关文件

- `app/screens/home/apps/role_management/role_management_screen.tsx` - 权限配置项
- `app/screens/home/apps/api.ts` - DashboardAccess 类型定义
- `app/screens/home/apps/erp/warehouse_inout_screen.tsx` - 出入库功能屏幕

## 多语言支持

需要添加的翻译条目：

### 中文 (zh-CN)
```json
{
    "workbench.tab.warehouse_inout": "出入库",
    "workbench.permissions.warehouse_stock_in": "入库权限",
    "workbench.permissions.warehouse_stock_out": "出库权限"
}
```

### 英文 (en-US)
```json
{
    "workbench.tab.warehouse_inout": "Warehouse In/Out",
    "workbench.permissions.warehouse_stock_in": "Stock In Permission",
    "workbench.permissions.warehouse_stock_out": "Stock Out Permission"
}
```

## 注意事项

1. **权限继承**: 子权限（stock_in, stock_out）只有在父权限（warehouse_inout）启用时才显示
2. **ERP 限制**: 所有仓库权限都只对 ERP 团队可见
3. **服务端同步**: 确保服务端 API 也支持这些权限字段
4. **权限检查**: warehouse_inout_screen 需要检查用户是否有对应的入库/出库权限
