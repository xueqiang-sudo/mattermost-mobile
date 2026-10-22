# ERP 应用原生化改造

## 概述

将5个 ERP 应用从 WebView 实现改造为原生 React Native 组件，参考 webapp 前端实现。

## 改造的应用

| 应用 | 中文名称 | 屏幕文件 | 代码行数 |
|------|---------|---------|---------|
| hotproducts | 热销榜 | `erp/hot_products_screen.tsx` | ~700行 |
| approvals | 审批清单 | `erp/approvals_screen.tsx` | ~510行 |
| finance | 流水账 | `erp/finance_screen.tsx` | ~620行 |
| sales | 销售统计 | `erp/sales_screen.tsx` | ~690行 |
| inventory | 库存分析 | `erp/inventory_screen.tsx` | ~690行 |

**总计**: ~3200行原生代码

## 修改的文件

### 1. API 层 - `app/screens/home/apps/api.ts`

**新增内容**:
- 5个应用的数据类型定义（约200行）
- MCP API 调用封装（mcpGet, mcpPost）
- 数据获取函数：
  - `fetchHotProducts()` - 获取热销商品数据
  - `fetchApprovals()` - 获取待审批列表
  - `postApprovalAction()` - 提交审批动作
  - `fetchCashJournal()` - 获取流水账数据
  - `fetchSales()` - 获取销售统计数据
  - `fetchInventory()` - 获取库存分析数据
  - `fetchWarehouseList()` - 获取仓库列表

**API 端点**:
```
GET /plugins/com.mattermost.frappe-sync/api/mcp/tools/hot_products
GET /plugins/com.mattermost.frappe-sync/api/mcp/tools/pending_approvals
POST /plugins/com.mattermost.frappe-sync/api/mcp/tools/approval_action
GET /plugins/com.mattermost.frappe-sync/api/mcp/tools/finance
GET /plugins/com.mattermost.frappe-sync/api/mcp/tools/sales_ranking
GET /plugins/com.mattermost.frappe-sync/api/mcp/tools/inventory
GET /plugins/com.mattermost.frappe-sync/api/mcp/tools/erpnext_warehouse_list
```

### 2. 屏幕常量 - `app/constants/screens.ts`

**新增常量**:
```typescript
export const APPS_HOT_PRODUCTS = 'AppsHotProducts';
export const APPS_APPROVALS = 'AppsApprovals';
export const APPS_FINANCE = 'AppsFinance';
export const APPS_SALES = 'AppsSales';
export const APPS_INVENTORY = 'AppsInventory';
```

### 3. 应用导航 - `app/screens/home/apps/apps.tsx`

**新增导航处理**:
```typescript
case 'hotproducts':
    navigation.navigate(Screens.APPS_HOT_PRODUCTS);
    break;
case 'approvals':
    navigation.navigate(Screens.APPS_APPROVALS);
    break;
case 'finance':
    navigation.navigate(Screens.APPS_FINANCE);
    break;
case 'sales':
    navigation.navigate(Screens.APPS_SALES);
    break;
case 'inventory':
    navigation.navigate(Screens.APPS_INVENTORY);
    break;
```

### 4. 导航栈 - `app/screens/home/apps/apps_stack.tsx`

**新增导入**:
```typescript
import ApprovalsScreen from './erp/approvals_screen';
import FinanceScreen from './erp/finance_screen';
import HotProductsScreen from './erp/hot_products_screen';
import InventoryScreen from './erp/inventory_screen';
import SalesScreen from './erp/sales_screen';
```

**新增 Stack 屏幕**:
```typescript
<Stack.Screen name={Screens.APPS_APPROVALS} component={ApprovalsScreen}/>
<Stack.Screen name={Screens.APPS_FINANCE} component={FinanceScreen}/>
<Stack.Screen name={Screens.APPS_HOT_PRODUCTS} component={HotProductsScreen}/>
<Stack.Screen name={Screens.APPS_INVENTORY} component={InventoryScreen}/>
<Stack.Screen name={Screens.APPS_SALES} component={SalesScreen}/>
```

### 5. 参数类型 - `app/screens/home/apps/apps_stack_param_list.ts`

**新增类型定义**:
```typescript
[Screens.APPS_APPROVALS]: undefined;
[Screens.APPS_FINANCE]: undefined;
[Screens.APPS_HOT_PRODUCTS]: undefined;
[Screens.APPS_INVENTORY]: undefined;
[Screens.APPS_SALES]: undefined;
```

## 各应用功能特性

### 1. 热销榜 (Hot Products)

**功能**:
- 三种排名模式：销售金额、销售数量、综合评估
- 时间筛选：年/月选择
- 商品排行展示：名称、数量、金额、订单数
- 进度条可视化
- Top 3 奖牌标识（🥇🥈🥉）
- 汇总卡片：总销量、总金额、订单数

**API 参数**: `sort_by`, `from`, `to`, `months`, `team_id`

### 2. 审批清单 (Approvals)

**功能**:
- 待审批文档列表（销售订单、采购订单、发票等）
- 卡片显示：单据类型、名称、工作流状态、往来方、金额、日期
- 审批/拒绝按钮
- 拒绝确认对话框
- 乐观 UI 更新（操作后即时移除）
- 下拉刷新

**API**: `pending_approvals` (GET), `approval_action` (POST)

### 3. 流水账 (Finance)

**功能**:
- 按日期分组的收支记录
- 汇总栏：总收入、总支出、净额
- 日期筛选：年/月/日
- 方向筛选：全部/收款/付款
- 每条记录：方向标识（收/付/转）、往来方、金额、支付方式
- 颜色编码：收入（绿色）、支出（红色）

**API 参数**: `from`, `to`, `type`, `team_id`

### 4. 销售统计 (Sales)

**功能**:
- 销售员业绩排名
- 时间段选择：全年/半年/季度/月
- 汇总 KPI：订单数、总金额、已收款（绿）、未收款（红）
- 可展开行：点击销售员查看客户明细
- Top 3 奖牌标识
- 智能金额格式：¥1.23亿、¥45.67万、¥8,900

**API 参数**: `months`, `from`, `to`, `team_id`

### 5. 库存分析 (Inventory)

**功能**:
- 三标签页布局：
  - 总览：KPI 卡片 + 仓库明细
  - 周转：月度趋势 + 商品周转率
  - 预警：呆滞库存、低库存预警
- 可配置参数：
  - 周转窗口：7/15/30/60/90天
  - 呆滞阈值：60/90/180天
  - 库龄阈值：60/90/180/365天
- 仓库筛选
- 可展开仓库行显示商品明细

**API 参数**: `days`, `dead_days`, `aging_days`, `warehouse`, `team_id`

## 技术实现模式

### 通用模式

1. **Hooks 使用**:
   - `useIntl()` - 国际化
   - `useTheme()` - 主题样式
   - `useServerUrl()` - 服务器 URL
   - `useNavigation()` - 导航

2. **数据获取**:
   ```typescript
   useEffect(() => {
       loadData();
   }, [serverUrl, teamId, filters]);
   ```

3. **Team ID 获取**:
   ```typescript
   const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
   const teamId = await getCurrentTeamId(database);
   ```

4. **样式**:
   - `makeStyleSheetFromTheme` - 主题感知样式
   - `changeOpacity` - 透明度调整
   - `typography` - 字体样式

5. **状态管理**:
   - `loading` - 加载状态
   - `error` - 错误状态
   - `data` - 数据状态
   - 下拉刷新支持

### 导航流程

```
应用网格 (AppsScreen)
    ↓ 点击应用图标
handleAppPress(app)
    ↓ navigation.navigate(Screens.APPS_XXX)
原生屏幕组件
    ↓ useEffect 加载数据
API 调用 → 渲染数据
```

## 对比 WebView 实现的优势

| 特性 | WebView | 原生组件 |
|------|---------|---------|
| 加载速度 | 慢（需加载网页） | 快（直接渲染） |
| 用户体验 | 网页感 | 原生流畅 |
| 离线支持 | 无 | 可缓存数据 |
| 性能 | 较低 | 高 |
| 交互响应 | 延迟 | 即时 |
| 内存占用 | 高 | 低 |
| 调试难度 | 高 | 低 |

## 测试验证

### 功能测试

1. **热销榜**:
   - [ ] 切换排名模式（金额/数量/综合）
   - [ ] 切换时间（年/月）
   - [ ] 验证 Top 3 奖牌显示
   - [ ] 验证进度条比例

2. **审批清单**:
   - [ ] 加载待审批列表
   - [ ] 点击审批通过
   - [ ] 点击拒绝（验证确认框）
   - [ ] 验证乐观 UI 更新

3. **流水账**:
   - [ ] 按日期分组显示
   - [ ] 切换方向筛选
   - [ ] 验证汇总计算
   - [ ] 切换日期

4. **销售统计**:
   - [ ] 切换时间段
   - [ ] 展开销售员查看客户
   - [ ] 验证金额格式化
   - [ ] 验证排名徽章

5. **库存分析**:
   - [ ] 切换三个标签页
   - [ ] 修改配置参数
   - [ ] 展开仓库查看商品
   - [ ] 验证预警数据

### 兼容性测试

- [ ] iOS 设备
- [ ] Android 设备
- [ ] 不同屏幕尺寸
- [ ] 深色/浅色主题
- [ ] 不同语言

## 相关文件

- `app/screens/home/apps/api.ts` - API 层
- `app/screens/home/apps/erp/` - ERP 屏幕目录
- `app/screens/home/apps/apps.tsx` - 应用导航
- `app/screens/home/apps/apps_stack.tsx` - 导航栈
- `app/constants/screens.ts` - 屏幕常量
- Webapp 参考: `/home/work/mattermost-master/webapp/channels/src/components/sidebar/workbench_panel/`

## 注意事项

1. **权限控制**: 所有 ERP 应用都标记为 `erpOnly: true`，只在有 ERP 地址的团队显示
2. **数据隔离**: 通过 `team_id` 参数实现团队级别数据隔离
3. **错误处理**: 所有 API 调用都有 try-catch 和用户友好的错误提示
4. **国际化**: 所有文本使用 `useIntl()` 支持多语言
5. **主题支持**: 使用 `useTheme()` 支持深色/浅色主题
