# 知识库白屏问题排查

## 已修复

1. **API 错误处理** - 在 `workbench_api.ts` 的 `apiFetch` 函数中添加了错误捕获
2. **调试日志** - 在初始化阶段添加了 `[KB]` 前缀的日志

## 可能的原因

### 1. API 请求失败
- 服务器没有安装 `fact-extractor` 插件
- API 端点不存在（404）
- 网络请求超时

### 2. 初始化失败
- `serverUrl` 为空
- `teamId` 获取失败
- 数据库连接问题

### 3. 组件渲染错误
- 某个子组件抛出异常
- 样式计算错误
- 国际化字符串缺失

## 真机测试步骤

1. **检查导航**
   - 点击知识库按钮后，URL 是否变化？
   - 是否有短暂的加载动画？

2. **检查网络请求**
   - 使用 Charles/Wireshark 抓包
   - 查看是否有 `/plugins/com.mattermost.fact-extractor/api/kb/list` 请求
   - 检查响应状态码（200/404/500）

3. **检查服务器日志**
   - 查看 Mattermost 服务器日志
   - 查找 `fact-extractor` 插件相关错误

4. **检查插件状态**
   ```bash
   # 在服务器上检查插件是否安装
   curl -H "Authorization: Bearer YOUR_TOKEN" \
        https://your-server.com/api/v4/plugins
   ```

## 快速验证

如果服务器没有安装 `fact-extractor` 插件，知识库功能无法工作。

**解决方案：**
1. 在服务器上安装 `com.mattermost.fact-extractor` 插件
2. 或者在 mobile 端添加插件检测，未安装时显示友好提示

## 临时修复

如果确认是插件未安装导致，可以修改 `knowledge_base_screen.tsx` 在初始化时检测插件状态：

```typescript
// 在 init 函数中添加
try {
    const plugins = await client.doFetch('/api/v4/plugins', {method: 'get'});
    const hasKBPlugin = plugins?.active?.some(p => p.id === 'com.mattermost.fact-extractor');
    if (!hasKBPlugin) {
        throw new Error('Knowledge base plugin not installed');
    }
} catch (err) {
    // Handle plugin check error
}
```
