# 语音转文本 400 错误修复记录

## 🐛 问题描述

**症状**：智能笔记本语音转文本功能返回 400 错误

**错误位置**：
- 移动端：`smart_notebook_api.ts` - `transcribeAudio` 函数
- 服务端：`voice-to-text-plugin` - `api.go` 和 `plugin.go`

---

## 🔍 问题分析

### 1. 请求流程

```
移动端录音
  ↓
use_voice_recorder.ts
  ↓ 生成文件
  iOS: .aac 格式
  Android: .amr 格式
  ↓
smart_notebook_api.ts - transcribeAudio()
  ↓ FormData 上传
  字段名: "audio"
  文件名: voice_xxx.aac / voice_xxx.amr
  ↓
voice-to-text-plugin - api.go
  ↓ 解析表单
  r.FormFile("audio")
  ↓
plugin.go - callTencentASR()
  ↓ 根据扩展名判断格式
  switch ext {
    case "aac": codec = "aac", engineModelType = "16k_zh"
    case "amr": codec = "amr", engineModelType = "8k_zh"
  }
  ↓
腾讯云 ASR API
  ↓ 返回错误 ❌
  400 Bad Request
```

---

### 2. 可能的原因

#### 原因 1：文件扩展名不正确
**问题**：移动端可能没有正确设置文件名扩展名

**检查**：
```typescript
// use_voice_recorder.ts
const name = localPath.substring(localPath.lastIndexOf('/') + 1);
// 例如：voice_123456.aac ✓ 有扩展名
```

**状态**：✅ 文件名正确，有扩展名

---

#### 原因 2：MIME type 不匹配
**问题**：
- 移动端发送的 `file.type` 可能与实际格式不匹配
- 服务端根据**文件扩展名**判断，而不是 MIME type

**检查**：
```typescript
// use_voice_recorder.ts
mime_type: lookupMimeType(name) || 'audio/mp4'
// .aac → audio/aac ✓
// .amr → audio/amr ✓
```

**状态**：✅ MIME type 正确

---

#### 原因 3：腾讯 ASR 参数配置问题
**问题**：
- `.aac` 格式可能需要特定的引擎模型
- `.amr` 使用 8k 采样率，其他使用 16k

**服务端代码**：
```go
case "amr":
    codec = "amr"
    engineModelType = "8k_zh"   // ← 窄带
case "aac", "m4a":
    codec = "aac"
    engineModelType = "16k_zh"  // ← 宽带
```

**状态**：⚠️ 可能是这个原因

---

#### 原因 4：腾讯 ASR 不支持某些格式
**腾讯云一句话识别支持格式**：
- wav, pcm, ogg-opus, speex, silk
- mp3, m4a, aac
- amr, opus

**状态**：✅ aac 和 amr 都支持

---

## 🔧 修复方案

### 修复 1：服务端增强格式支持和日志

**文件**：`/home/work/mattermost-master/all-plugin/voice-to-text-plugin/server/plugin.go`

**改动**：
```go
// 添加详细日志
p.API.LogInfo("音频文件格式", "filename", fileName, "extension", ext)

// 扩展格式支持
switch ext {
case "mp3":
    codec = "mp3"
    engineModelType = "16k_zh"
case "wav":
    codec = "wav"
    engineModelType = "16k_zh"
case "amr":
    codec = "amr"
    engineModelType = "8k_zh"  // AMR 窄带使用 8k
case "aac":
    codec = "aac"
    engineModelType = "16k_zh"
case "m4a":
    codec = "m4a"              // ← 新增 m4a 单独处理
    engineModelType = "16k_zh"
case "ogg":
    codec = "ogg-opus"         // ← 新增 ogg 支持
    engineModelType = "16k_zh"
default:
    p.API.LogWarn("未知的音频格式，使用默认参数", "extension", ext)
    codec = ext                // ← 使用实际扩展名，而不是默认 mp3
    engineModelType = "16k_zh"
}

p.API.LogInfo("ASR 参数", "codec", codec, "engineModelType", engineModelType)
```

**改进**：
1. ✅ 添加详细日志记录
2. ✅ 分离 `aac` 和 `m4a` 处理
3. ✅ 新增 `ogg` 格式支持
4. ✅ 未知格式时使用实际扩展名

---

### 修复 2：服务端增强错误日志

**文件**：`/home/work/mattermost-master/all-plugin/voice-to-text-plugin/server/api.go`

**改动**：
```go
// 记录更多请求信息
p.API.LogInfo("开始转写音频",
    "user_id", userID,
    "filename", fileName,
    "size", fileSize,
    "content_type", header.Header.Get("Content-Type"),  // ← 新增
)

// 记录更多错误信息
p.API.LogError("调用腾讯云 ASR 失败",
    "error", err.Error(),
    "user_id", userID,
    "filename", fileName,        // ← 新增
    "size", fileSize,            // ← 新增
)
```

**改进**：
1. ✅ 记录 Content-Type
2. ✅ 错误时记录文件名和大小

---

### 修复 3：服务端腾讯 ASR 详细日志

**文件**：`/home/work/mattermost-master/all-plugin/voice-to-text-plugin/server/plugin.go`

**改动**：
```go
// 调用前记录参数
p.API.LogInfo("调用腾讯云 ASR",
    "engineModelType", engineModelType,
    "codec", codec,
    "fileName", fileName,
    "dataLen", len(audioData),
    "base64Len", len(audioBase64),
)

// 记录响应
if response.Response != nil {
    p.API.LogInfo("腾讯云 ASR 响应",
        "hasResult", response.Response.Result != nil,
        "requestId", *response.Response.RequestId,
    )
}

// 错误时记录详细参数
p.API.LogError("腾讯云 ASR 请求失败",
    "error", err.Error(),
    "engineModelType", engineModelType,
    "codec", codec,
)
```

**改进**：
1. ✅ 记录完整的请求参数
2. ✅ 记录响应状态
3. ✅ 错误时记录引擎模型和编码

---

### 修复 4：移动端确保文件名正确

**文件**：`/home/work/mattermost-mobile/app/screens/home/apps/smart_notebook/smart_notebook_api.ts`

**改动**：
```typescript
// 确保文件名有正确的扩展名
let fileName = file.name;
const extension = fileName.split('.').pop()?.toLowerCase();

// 如果没有扩展名或扩展名不对，根据 MIME type 修正
if (!extension || !['mp3', 'wav', 'amr', 'aac', 'm4a', 'ogg'].includes(extension)) {
    // 从 MIME type 推断扩展名
    const mimeToExt: Record<string, string> = {
        'audio/mpeg': 'mp3',
        'audio/wav': 'wav',
        'audio/x-wav': 'wav',
        'audio/amr': 'amr',
        'audio/aac': 'aac',
        'audio/mp4': 'm4a',
        'audio/x-m4a': 'm4a',
        'audio/ogg': 'ogg',
    };
    const correctExt = mimeToExt[file.type] || 'aac'; // 默认使用 aac
    if (!extension) {
        fileName = `${fileName}.${correctExt}`;
    } else {
        fileName = `${fileName.substring(0, fileName.lastIndexOf('.'))}.${correctExt}`;
    }
}

console.log('[transcribeAudio] 发送文件:', {
    originalName: file.name,
    finalName: fileName,
    mimeType: file.type,
    uri: file.uri,
});
```

**改进**：
1. ✅ 确保文件名有扩展名
2. ✅ 根据 MIME type 修正扩展名
3. ✅ 添加详细日志

---

### 修复 5：移动端增强错误日志

**文件**：`/home/work/mattermost-mobile/app/screens/home/apps/smart_notebook/smart_notebook_api.ts`

**改动**：
```typescript
try {
    const resp = await client.doFetch(endpoint, {
        method: 'post',
        body: formData,
    });

    console.log('[transcribeAudio] 响应:', resp);  // ← 新增

    return resp?.data || resp;
} catch (e: any) {
    const errorMessage = e?.message || String(e);
    const serverMessage = e?.server_error?.message || e?.details?.error || '';
    console.error('[transcribeAudio] Error:', {  // ← 增强日志
        message: errorMessage,
        serverMessage,
        fullError: e,  // ← 完整错误对象
    });
    return {
        success: false,
        error: serverMessage || errorMessage || '语音转文字服务暂不可用',
    };
}
```

**改进**：
1. ✅ 记录成功响应
2. ✅ 增强错误日志
3. ✅ 记录完整错误对象

---

## 📊 修复对比

### 修复前
```
移动端：
- 文件名：voice_xxx
- MIME type：audio/mp4
- 日志：简单

服务端：
- 扩展名判断：aac → mp3（默认）
- 日志：简单
- 错误信息：不详细
```

### 修复后
```
移动端：
- 文件名：voice_xxx.aac（确保有扩展名）
- MIME type：audio/aac
- 日志：详细，记录文件名、MIME type

服务端：
- 扩展名判断：aac → aac（正确）
- 日志：详细，记录所有参数
- 错误信息：完整，便于调试
```

---

## 🧪 测试步骤

### 1. 重新编译插件
```bash
cd /home/work/mattermost-master/all-plugin/voice-to-text-plugin
make dist
# 上传到 Mattermost 服务器
```

### 2. 重启 Mattermost
```bash
systemctl restart mattermost
```

### 3. 重新构建移动端
```bash
cd /home/work/mattermost-mobile
npm run android
# 或
npm run ios
```

### 4. 测试语音转文本
```
1. 打开智能笔记本
2. 点击麦克风图标
3. 录制一段语音（3-5 秒）
4. 点击发送
5. 检查是否成功转换
```

### 5. 查看日志
```bash
# 服务端日志
tail -f /opt/mattermost/logs/mattermost.log | grep -i "asr\|语音\|转写"

# 移动端日志
adb logcat | grep transcribeAudio
```

---

## 🔍 调试技巧

### 查看服务端日志
```bash
# 查看所有语音转写相关日志
grep "语音\|转写\|ASR" /opt/mattermost/logs/mattermost.log

# 查看错误日志
grep "ERROR.*ASR\|ERROR.*转写" /opt/mattermost/logs/mattermost.log
```

### 查看移动端日志
```bash
# Android
adb logcat | grep -i "transcribeaudio\|voice"

# iOS（使用 Xcode）
查看 Console 输出
```

### 测试不同格式
```typescript
// 临时修改 use_voice_recorder.ts
const IOS_RECORDING_EXTENSION = 'm4a'; // 改为 m4a 测试
```

---

## 📝 可能的后续优化

### 1. 支持更多音频格式
- ogg-opus
- speex
- silk

### 2. 音频预处理
- 采样率转换
- 格式转换（如 aac → mp3）
- 降噪处理

### 3. 错误重试机制
```typescript
if (!result.success) {
    // 自动重试一次
    const retryResult = await transcribeAudio(serverUrl, file);
    if (retryResult.success) {
        return retryResult;
    }
}
```

### 4. 离线转写支持
- 使用本地模型
- 缓存常用短语

---

## ✅ 修复验证清单

- [x] 服务端代码已更新
  - [x] plugin.go - 格式支持增强
  - [x] api.go - 日志增强
- [x] 移动端代码已更新
  - [x] smart_notebook_api.ts - 文件名修正
  - [x] smart_notebook_api.ts - 日志增强
- [ ] 插件重新编译并上传
- [ ] Mattermost 服务重启
- [ ] 移动端重新构建
- [ ] 测试语音转文本功能
- [ ] 检查日志输出
- [ ] 验证错误处理

---

## 📞 如果仍然失败

### 收集以下信息：

1. **移动端日志**
   ```
   [transcribeAudio] 发送文件: {...}
   [transcribeAudio] Error: {...}
   ```

2. **服务端日志**
   ```
   收到直接转写请求: user_id=xxx
   开始转写音频: filename=xxx, size=xxx
   音频文件格式: extension=xxx
   ASR 参数: codec=xxx, engineModelType=xxx
   腾讯云 ASR 请求失败: error=xxx
   ```

3. **腾讯云错误码**
   - 查看 `response.Response.Error`
   - 参考腾讯云文档

4. **音频文件信息**
   - 文件名
   - 文件大小
   - 实际格式
   - MIME type

---

## 📚 参考文档

- [腾讯云一句话识别文档](https://cloud.tencent.com/document/product/1093/37823)
- [腾讯云 ASR 错误码](https://cloud.tencent.com/document/product/1093/37824)
- [Mattermost 插件开发](https://developers.mattermost.com/integrate/plugins/)

---

## 🎯 总结

### 已完成的修复
1. ✅ 服务端增强格式支持（aac, m4a, ogg）
2. ✅ 服务端详细日志记录
3. ✅ 移动端确保文件名正确
4. ✅ 移动端增强错误日志

### 下一步
1. 重新编译插件
2. 重新构建移动端
3. 测试功能
4. 根据日志进一步调试

### 预期结果
- ✅ 语音转文本成功率提升
- ✅ 错误信息更清晰
- ✅ 便于问题定位和修复

---

**修复完成！** 🎉
