# 多语言支持说明

## 概述

所有 ERP 屏幕已添加多语言支持，使用 `react-intl` 的 `useIntl` hook 进行文本国际化。

## 实现方式

### 1. 使用 useIntl Hook

所有屏幕组件都使用 `useIntl` hook：

```typescript
import {useIntl} from 'react-intl';

const MyScreen = () => {
    const intl = useIntl();
    
    return (
        <Text>
            {intl.formatMessage({
                id: 'workbench.my_label',
                defaultMessage: '默认文本'
            })}
        </Text>
    );
};
```

### 2. 带参数的消息

```typescript
intl.formatMessage(
    {id: 'workbench.inventory.days', defaultMessage: '{days}天'},
    {days: 30}
)
// 输出: "30天"
```

## 已修复的文件

### 1. sales_screen.tsx

**修复的硬编码文本**:
- ✅ 订单、金额、已收款、未收款
- ✅ 客户表头
- ✅ 年、半年、季度、月
- ✅ 上半年、下半年
- ✅ 年份和月份显示（改为纯数字）

**使用的 i18n ID**:
```
workbench.sales.order_count
workbench.sales.total_amount
workbench.sales.paid_amount
workbench.sales.outstanding
workbench.sales.customer
workbench.filter.year
workbench.filter.half_year
workbench.filter.quarter
workbench.filter.month
workbench.filter.half_year_first
workbench.filter.half_year_second
```

### 2. inventory_screen.tsx

**修复的硬编码文本**:
- ✅ 品数显示（{count}品）
- ✅ 天数显示（{days}天）
- ✅ 月度周转趋势
- ✅ 暂无数据
- ✅ 全部物料周转
- ✅ 呆滞库存数量
- ✅ 低库存数量
- ✅ 全部仓库
- ✅ 周转天数筛选
- ✅ 呆滞天数筛选
- ✅ 库龄天数筛选

**使用的 i18n ID**:
```
workbench.inventory.item_count
workbench.inventory.days
workbench.inventory.monthly_trend
workbench.inventory.empty
workbench.inventory.all_items_turnover
workbench.inventory.dead_stock_count
workbench.inventory.low_stock_count
workbench.inventory.all_warehouses
workbench.inventory.turnover_days
workbench.inventory.dead_days
workbench.inventory.aging_days
```

### 3. api.ts

**修复的硬编码文本**:
- ✅ 日期格式化（改为 `M/D` 格式，由 UI 层处理本地化）

## 待处理的文件

### hot_products_screen.tsx

**仍有硬编码**:
- 金额格式化中的"亿"、"万"
- 综合评分中的"分"

**建议修复**:
```typescript
// 当前
return `${sign}¥${(absNum / 100000000).toFixed(2)}亿`;

// 建议
if (locale.startsWith('zh')) {
    return `${sign}¥${(absNum / 100000000).toFixed(2)}亿`;
} else {
    return `${sign}¥${formatNumber(absNum)}`;
}
```

### finance_screen.tsx

**需要检查**:
- 方向标识（收/付/转）
- 日期格式
- 汇总标签

### approvals_screen.tsx

**需要检查**:
- 文档类型名称
- 状态标签
- 操作按钮文本

## 金额格式化建议

对于中文环境特有的"亿"、"万"单位，建议：

### 方案1: 根据语言环境显示

```typescript
const formatMoney = (num: number, locale: string) => {
    const absNum = Math.abs(num);
    const sign = num < 0 ? '-' : '';
    
    if (locale.startsWith('zh')) {
        // 中文环境使用亿/万
        if (absNum >= 100000000) {
            return `${sign}¥${(absNum / 100000000).toFixed(2)}亿`;
        }
        if (absNum >= 10000) {
            return `${sign}¥${(absNum / 10000).toFixed(2)}万`;
        }
    }
    
    // 其他语言使用标准格式
    return `${sign}¥${absNum.toLocaleString(locale)}`;
};
```

### 方案2: 使用国际化消息

```typescript
const formatMoney = (num: number) => {
    const absNum = Math.abs(num);
    
    if (absNum >= 100000000) {
        return intl.formatMessage(
            {id: 'format.billion', defaultMessage: '{value}B'},
            {value: (absNum / 100000000).toFixed(2)}
        );
    }
    if (absNum >= 10000) {
        return intl.formatMessage(
            {id: 'format.ten_thousand', defaultMessage: '{value}万'},
            {value: (absNum / 10000).toFixed(2)}
        );
    }
    
    return `¥${absNum.toLocaleString()}`;
};
```

## 需要添加的翻译条目

### 中文 (zh-CN)

```json
{
    "workbench.sales.order_count": "订单",
    "workbench.sales.total_amount": "金额",
    "workbench.sales.paid_amount": "已收款",
    "workbench.sales.outstanding": "未收款",
    "workbench.sales.customer": "客户",
    "workbench.filter.year": "年",
    "workbench.filter.half_year": "半年",
    "workbench.filter.quarter": "季度",
    "workbench.filter.month": "月",
    "workbench.filter.half_year_first": "上半年",
    "workbench.filter.half_year_second": "下半年",
    "workbench.inventory.item_count": "{count}品",
    "workbench.inventory.days": "{days}天",
    "workbench.inventory.monthly_trend": "月度周转趋势",
    "workbench.inventory.empty": "暂无数据",
    "workbench.inventory.all_items_turnover": "全部物料周转",
    "workbench.inventory.dead_stock_count": " ({count}品 · {value})",
    "workbench.inventory.low_stock_count": " ({count}品)",
    "workbench.inventory.all_warehouses": "全部仓库",
    "workbench.inventory.turnover_days": "周转 {days}天",
    "workbench.inventory.dead_days": "呆滞 ≥{days}天",
    "workbench.inventory.aging_days": "库龄 >{days}天"
}
```

### 英文 (en-US)

```json
{
    "workbench.sales.order_count": "Orders",
    "workbench.sales.total_amount": "Amount",
    "workbench.sales.paid_amount": "Paid",
    "workbench.sales.outstanding": "Outstanding",
    "workbench.sales.customer": "Customer",
    "workbench.filter.year": "Year",
    "workbench.filter.half_year": "Half Year",
    "workbench.filter.quarter": "Quarter",
    "workbench.filter.month": "Month",
    "workbench.filter.half_year_first": "H1",
    "workbench.filter.half_year_second": "H2",
    "workbench.inventory.item_count": "{count} items",
    "workbench.inventory.days": "{days} days",
    "workbench.inventory.monthly_trend": "Monthly Turnover Trend",
    "workbench.inventory.empty": "No data available",
    "workbench.inventory.all_items_turnover": "All Items Turnover",
    "workbench.inventory.dead_stock_count": " ({count} items · {value})",
    "workbench.inventory.low_stock_count": " ({count} items)",
    "workbench.inventory.all_warehouses": "All Warehouses",
    "workbench.inventory.turnover_days": "Turnover {days}d",
    "workbench.inventory.dead_days": "Dead ≥{days}d",
    "workbench.inventory.aging_days": "Age >{days}d"
}
```

## 测试清单

- [ ] 切换语言后，所有文本正确显示
- [ ] 带参数的消息正确格式化
- [ ] 金额格式在不同语言下正确显示
- [ ] 日期格式符合语言习惯
- [ ] 空状态文本已国际化
- [ ] 错误消息已国际化
- [ ] 筛选器选项已国际化

## 注意事项

1. **defaultMessage**: 始终提供中文作为默认消息
2. **参数顺序**: 不同语言的参数顺序可能不同，使用命名参数
3. **复数处理**: 如需支持复数，使用 `intl.formatMessage` 的 `plural` 功能
4. **日期格式**: 使用 `Intl.DateTimeFormat` 或 `date-fns` 处理日期本地化
5. **数字格式**: 使用 `Intl.NumberFormat` 处理数字本地化

## 相关文件

- `app/screens/home/apps/erp/*.tsx` - ERP 屏幕
- `app/i18n/` - 翻译文件目录
- `react-intl` 文档: https://formatjs.io/docs/react-intl/
