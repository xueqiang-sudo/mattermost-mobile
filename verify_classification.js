#!/usr/bin/env node

/**
 * 验证脚本：测试内部/外部分类逻辑
 * 模拟 categories.tsx 的分类逻辑
 */

// 模拟类别数据
const mockCategories = [
    { id: '1', type: 'channels', displayName: '频道', sortOrder: 0 },
    { id: '2', type: 'direct_messages', displayName: '私信', sortOrder: 1 },
    { id: '3', type: 'favorites', displayName: '收藏', sortOrder: 2 },
    { id: '4', type: 'custom', displayName: '客户群', sortOrder: 3 },
    { id: '5', type: 'custom', displayName: '项目群', sortOrder: 4 },
];

// 修改前的逻辑（只查找 3 个特定类型）
function splitCategoriesOld(categories) {
    const BUILT_IN_TYPES = new Set(['channels', 'direct_messages', 'favorites']);
    const builtIn = [];
    const custom = [];

    for (const cat of categories) {
        if (BUILT_IN_TYPES.has(cat.type)) {
            builtIn.push(cat);
        } else if (cat.type === 'custom') {
            custom.push(cat);
        }
    }

    return { builtIn, custom };
}

// 修改后的逻辑（所有非自定义类别）
function splitCategoriesNew(categories) {
    const builtIn = [];
    const custom = [];

    for (const cat of categories) {
        if (cat.type === 'custom') {
            custom.push(cat);
        } else {
            builtIn.push(cat);
        }
    }

    return { builtIn, custom };
}

// 测试
console.log('=== 验证分类逻辑 ===\n');

console.log('输入类别:', mockCategories.map(c => `${c.displayName}(${c.type})`).join(', '));
console.log();

const oldResult = splitCategoriesOld(mockCategories);
console.log('修改前:');
console.log('  内置类别:', oldResult.builtIn.map(c => c.displayName).join(', ') || '(无)');
console.log('  自定义类别:', oldResult.custom.map(c => c.displayName).join(', ') || '(无)');
console.log('  内置类别数量:', oldResult.builtIn.length);
console.log();

const newResult = splitCategoriesNew(mockCategories);
console.log('修改后:');
console.log('  内置类别:', newResult.builtIn.map(c => c.displayName).join(', ') || '(无)');
console.log('  自定义类别:', newResult.custom.map(c => c.displayName).join(', ') || '(无)');
console.log('  内置类别数量:', newResult.builtIn.length);
console.log();

// 验证结果
console.log('=== 验证结果 ===');
if (newResult.builtIn.length >= oldResult.builtIn.length) {
    console.log('✓ 修改后内置类别数量 >= 修改前（符合预期）');
} else {
    console.log('✗ 错误：修改后内置类别数量减少了');
}

if (newResult.custom.length === oldResult.custom.length) {
    console.log('✓ 自定义类别数量保持不变');
} else {
    console.log('✗ 错误：自定义类别数量变化');
}

if (newResult.builtIn.length > 0) {
    console.log('✓ 内置类别不为空，将显示内部群/外部群');
} else {
    console.log('✗ 警告：内置类别为空，不会显示内部群/外部群');
}

console.log();

// 测试边界情况
console.log('=== 边界情况测试 ===\n');

// 情况1：只有自定义类别
const onlyCustom = [
    { id: '1', type: 'custom', displayName: '客户群', sortOrder: 0 },
    { id: '2', type: 'custom', displayName: '项目群', sortOrder: 1 },
];
const result1 = splitCategoriesNew(onlyCustom);
console.log('情况1：只有自定义类别');
console.log('  内置类别:', result1.builtIn.length, '个');
console.log('  自定义类别:', result1.custom.length, '个');
console.log('  预期：内置=0，自定义=2');
console.log('  结果:', result1.builtIn.length === 0 && result1.custom.length === 2 ? '✓ 通过' : '✗ 失败');
console.log();

// 情况2：只有标准类别
const onlyStandard = [
    { id: '1', type: 'channels', displayName: '频道', sortOrder: 0 },
    { id: '2', type: 'direct_messages', displayName: '私信', sortOrder: 1 },
];
const result2 = splitCategoriesNew(onlyStandard);
console.log('情况2：只有标准类别');
console.log('  内置类别:', result2.builtIn.length, '个');
console.log('  自定义类别:', result2.custom.length, '个');
console.log('  预期：内置=2，自定义=0');
console.log('  结果:', result2.builtIn.length === 2 && result2.custom.length === 0 ? '✓ 通过' : '✗ 失败');
console.log();

// 情况3：混合类别（包含未知类型）
const mixedWithUnknown = [
    { id: '1', type: 'channels', displayName: '频道', sortOrder: 0 },
    { id: '2', type: 'custom', displayName: '客户群', sortOrder: 1 },
    { id: '3', type: 'unknown', displayName: '未知类型', sortOrder: 2 },
];
const result3 = splitCategoriesNew(mixedWithUnknown);
console.log('情况3：混合类别（包含未知类型）');
console.log('  内置类别:', result3.builtIn.length, '个（包括未知类型）');
console.log('  自定义类别:', result3.custom.length, '个');
console.log('  预期：内置=2（channels + unknown），自定义=1');
console.log('  结果:', result3.builtIn.length === 2 && result3.custom.length === 1 ? '✓ 通过' : '✗ 失败');
console.log();

console.log('=== 验证完成 ===');
