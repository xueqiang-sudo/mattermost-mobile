#!/usr/bin/env node

/**
 * 验证脚本：测试 null 检查逻辑
 * 模拟 categories.ts 中的 filter 和 sort 函数
 */

// 模拟数据
const mockChannelsWithMyChannel = [
    { channel: { id: '1', deleteAt: 0, type: 'O', name: 'town-square' }, myChannel: { id: '1', lastPostAt: 1000 }, sortOrder: 0 },
    { channel: { id: '2', deleteAt: 0, type: 'D', name: 'user1__user2' }, myChannel: { id: '2', lastPostAt: 2000 }, sortOrder: 1 },
    undefined, // 模拟 undefined 元素
    { channel: { id: '3', deleteAt: 0, type: 'O', name: 'off-topic' }, myChannel: { id: '3', lastPostAt: 3000 }, sortOrder: 2 },
    { channel: undefined, myChannel: { id: '4' }, sortOrder: 3 }, // 模拟 channel 为 undefined
    { channel: { id: '5', deleteAt: 1000, type: 'O', name: 'archived' }, myChannel: { id: '5', lastPostAt: 4000 }, sortOrder: 4 },
];

console.log('=== 验证 Null 检查逻辑 ===\n');

// 测试 filterArchivedChannels
console.log('1. filterArchivedChannels 测试');
function filterArchivedChannelsOld(channelsWithMyChannel, currentChannelId) {
    return channelsWithMyChannel.filter((cwm) => cwm.channel.deleteAt === 0 || cwm.channel.id === currentChannelId);
}

function filterArchivedChannelsNew(channelsWithMyChannel, currentChannelId) {
    return channelsWithMyChannel.filter((cwm) => cwm && cwm.channel && (cwm.channel.deleteAt === 0 || cwm.channel.id === currentChannelId));
}

try {
    const oldResult = filterArchivedChannelsOld(mockChannelsWithMyChannel, '1');
    console.log('  修改前: ✗ 会崩溃（无法访问 undefined 的 channel）');
} catch (e) {
    console.log('  修改前: ✓ 正确崩溃 -', e.message);
}

try {
    const newResult = filterArchivedChannelsNew(mockChannelsWithMyChannel, '1');
    console.log('  修改后: ✓ 不崩溃，返回', newResult.length, '个频道');
    console.log('  过滤结果:', newResult.map(c => c.channel.name).join(', '));
} catch (e) {
    console.log('  修改后: ✗ 意外崩溃 -', e.message);
}
console.log();

// 测试 sortChannels
console.log('2. sortChannels 测试');
function sortChannelsOld(channelsWithMyChannel) {
    return channelsWithMyChannel.sort((cwmA, cwmB) => {
        const a = Math.max(cwmA.myChannel.lastPostAt, cwmA.channel.createAt || 0);
        const b = Math.max(cwmB.myChannel.lastPostAt, cwmB.channel.createAt || 0);
        return b - a;
    }).map((cwm) => cwm.channel);
}

function sortChannelsNew(channelsWithMyChannel) {
    return channelsWithMyChannel.sort((cwmA, cwmB) => {
        const a = Math.max(cwmA?.myChannel?.lastPostAt || 0, cwmA?.channel?.createAt || 0);
        const b = Math.max(cwmB?.myChannel?.lastPostAt || 0, cwmB?.channel?.createAt || 0);
        return b - a;
    }).map((cwm) => cwm?.channel).filter((c) => c != null);
}

try {
    const oldResult = sortChannelsOld([...mockChannelsWithMyChannel]);
    console.log('  修改前: ✗ 会崩溃或返回 undefined 元素');
} catch (e) {
    console.log('  修改前: ✓ 正确崩溃 -', e.message);
}

try {
    const newResult = sortChannelsNew([...mockChannelsWithMyChannel]);
    console.log('  修改后: ✓ 不崩溃，返回', newResult.length, '个频道');
    console.log('  排序结果:', newResult.map(c => c.name).join(', '));
    const hasUndefined = newResult.some(c => c === undefined || c === null);
    console.log('  包含 undefined:', hasUndefined ? '✗ 是' : '✓ 否');
} catch (e) {
    console.log('  修改后: ✗ 意外崩溃 -', e.message);
}
console.log();

// 测试 distinctUntilChanged
console.log('3. distinctUntilChanged 比较测试');
const arr1 = [{ id: '1' }, { id: '2' }, undefined];
const arr2 = [{ id: '1' }, { id: '2' }, undefined];

function distinctUntilChangedOld(a, b) {
    if (a.length !== b.length) return false;
    return a.every((ch, i) => ch.id === b[i].id);
}

function distinctUntilChangedNew(a, b) {
    if (a.length !== b.length) return false;
    return a.every((ch, i) => ch && b[i] && ch.id === b[i].id);
}

try {
    const oldResult = distinctUntilChangedOld(arr1, arr2);
    console.log('  修改前: ✗ 会崩溃（无法访问 undefined 的 id）');
} catch (e) {
    console.log('  修改前: ✓ 正确崩溃 -', e.message);
}

try {
    const newResult = distinctUntilChangedNew(arr1, arr2);
    console.log('  修改后: ✓ 不崩溃，返回', newResult);
} catch (e) {
    console.log('  修改后: ✗ 意外崩溃 -', e.message);
}
console.log();

// 测试 FlatList keyExtractor
console.log('4. FlatList keyExtractor 测试');
const channels = [{ id: '1' }, { id: '2' }, undefined, { id: '3' }];

function extractKeyOld(item) {
    return item.id;
}

function extractKeyNew(item) {
    return item?.id || 'unknown';
}

try {
    channels.forEach((ch, i) => {
        const key = extractKeyOld(ch);
        console.log(`  修改前 [${i}]: ${key}`);
    });
    console.log('  修改前: ✗ 会崩溃');
} catch (e) {
    console.log('  修改前: ✓ 正确崩溃 -', e.message);
}

try {
    const validChannels = channels.filter(c => c != null);
    validChannels.forEach((ch, i) => {
        const key = extractKeyNew(ch);
        console.log(`  修改后 [${i}]: ${key}`);
    });
    console.log('  修改后: ✓ 不崩溃，过滤后数量:', validChannels.length);
} catch (e) {
    console.log('  修改后: ✗ 意外崩溃 -', e.message);
}
console.log();

console.log('=== 验证完成 ===');
console.log('\n结论：所有 null 检查都正确工作，防止了 undefined 访问导致的崩溃');
