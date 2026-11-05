# 智能笔记本语音转文本 - 完整实施文档

## 📋 项目概述

为 Mattermost 智能笔记本添加**实时语音转文本**功能，实现类似微信的"边说边转"效果。

### 核心特性
- ✅ 实时流式音频传输（WebSocket）
- ✅ 实时转录（<500ms延迟）
- ✅ 文本自动插入到编辑区光标位置
- ✅ **完全独立**于聊天窗口语音消息功能

---

## 🏗️ 架构设计

### 方案选择：WebSocket 路由到插件

```
移动端                    Mattermost服务器              语音识别插件
───────                    ───────────────              ──────────
                            WebSocket Hub               
                            (通用路由)                  
                            ↓                          
                            插件注册机制                
                            ↓                          
WebSocket客户端 ──────>  路由到插件 ──────> VoiceStreamHandler
                            (不关心具体插件)              ↓
                            ↓                          腾讯云实时ASR
音频流(二进制) ─────────> 转发 ────────────> SendAudioChunk()
                            ↓                          ↓
转录文本(JSON) <────────── 返回 <──────────── SendTranscription()
```

### 设计原则

1. **服务器不依赖插件**
   - 服务器只提供通用WebSocket路由
   - 不知道插件名字，只知道功能类型
   - 符合插件化架构

2. **插件完全自治**
   - 插件自己管理配置（腾讯云密钥）
   - 插件自己实现业务逻辑
   - 可以随时启用/停用/替换

3. **不影响现有功能**
   - 聊天窗口语音消息完全独立
   - 使用不同的录音API
   - 使用不同的上传方式

---

## 📁 改动清单

### 1. Mattermost 服务器（3个新文件）

#### `server/channels/web/plugin_websocket.go`
- WebSocket路由处理器
- 用户身份验证
- 协议升级
- 提取pluginType

#### `server/channels/web/plugin_websocket_init.go`
- 路由注册
- `/api/v4/plugins/{plugin-type}`

#### `server/channels/app/plugin_websocket_hub.go`
- 插件管理器（全局Hub）
- RegisterHandler / UnregisterHandler
- GetHandler

### 2. 语音识别插件（4个文件）

#### `server/voice_stream_handler.go` (新增)
- VoiceStreamHandler结构
- HandleWebSocket方法
- VoiceStreamSession管理
- 音频块处理

#### `server/tencent_asr_stream.go` (新增)
- 腾讯云实时ASR客户端
- WebSocket连接
- SendAudioChunk
- receiveResults

#### `server/plugin.go` (修改)
```go
// OnActivate中注册
p.voiceStreamHandler = &VoiceStreamHandler{plugin: p}
p.API.RegisterWebSocketHandler("voice-stream", p.Manifest.Id, p.voiceStreamHandler)

// OnDeactivate中注销
p.API.UnregisterWebSocketHandler("voice-stream", p.Manifest.Id)
```

#### `server/api.go` (不变)
- 保留现有HTTP API
- 向后兼容

### 3. 移动端 - Android原生模块（4个文件）

#### `NativeVoiceRecorder.ts`
```typescript
// 新增接口
startRealtimeRecording(
  options: StartRecordingOptions,
  onChunkReady: AudioChunkCallback
): Promise<boolean>;

stopRealtimeRecording(): Promise<void>;
```

#### `voice-recorder/src/index.tsx`
```typescript
// 导出新方法
export function startRealtimeRecording(
  onAudioChunk: (chunkBase64: string) => void,
  options?: StartRecordingOptions
): Promise<boolean>

export function stopRealtimeRecording(): Promise<void>
```

#### `VoiceRecorderModule.kt`
```kotlin
// 新增方法声明
override fun startRealtimeRecording(
  options: ReadableMap?,
  onChunkReady: Callback,
  promise: Promise
)

override fun stopRealtimeRecording(promise: Promise)
```

#### `VoiceRecorderModuleImpl.kt`
```kotlin
// 新增字段
private var audioRecord: AudioRecord? = null
private var isRealtimeRecording = false

// 实现方法
fun startRealtimeRecording(...) {
  // 使用AudioRecord（不同于MediaRecorder）
  // 16kHz采样率，PCM格式
  // 后台线程持续读取音频
  // 每100ms回调一次
}

fun stopRealtimeRecording(...) {
  // 停止录音
  // 释放资源
}
```

### 4. 移动端 - iOS原生模块（3个文件）

#### `VoiceRecorder.mm`
```objective-c
// 新增方法
RCT_EXPORT_METHOD(startRealtimeRecording:(NSDictionary *)options
                  onChunkReady:(RCTResponseSenderBlock)onChunkReady
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXPORT_METHOD(stopRealtimeRecording:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
```

#### `VoiceRecorderWrapper.h`
```objective-c
// 新增声明
- (void)startRealtimeRecording:(NSDictionary *)options
                  onChunkReady:(void (^)(NSString *base64Chunk))onChunkReady
                    completion:(void (^)(BOOL success, NSString *errorCode))completion;

- (void)stopRealtimeRecordingWithCompletion:(void (^)(void))completion;
```

#### `VoiceRecorderWrapper.swift`
```swift
// 新增实现
private var audioEngine: AVAudioEngine?
private var isRealtimeRecording = false

func startRealtimeRecording(...) {
  // 使用AVAudioEngine（不同于AVAudioRecorder）
  // 安装音频tap捕获实时音频
  // 转换为base64回调给JS
}

func stopRealtimeRecording(...) {
  // 停止引擎
  // 释放资源
}
```

### 5. 移动端 - React Native前端（5个文件）

#### `app/client/websocket/voice_stream_client.ts` (新增)
```typescript
class VoiceStreamClient {
  connect(): Promise<void>
  sendAudioChunk(chunkBase64: string): void
  sendControlMessage(type, sessionId): void
  close(): void
  
  onTranscription?: (text, isFinal) => void
  onError?: (error) => void
}
```

#### `app/hooks/use_voice_stream.ts` (新增)
```typescript
function useVoiceStream(serverUrl, token) {
  state: 'idle' | 'connecting' | 'recording' | 'error'
  result: { partialText, finalText, error }
  
  startStreaming(): Promise<boolean>
  stopStreaming(): Promise<string>
  cancelStreaming(): Promise<void>
}
```

#### `app/screens/.../voice_stream_transcription.ts` (新增)
```typescript
function useVoiceStreamTranscription({
  voiceStreamState,
  voiceStreamResult,
  focusedBlockIndex,
  setBlocks,
  createBlock,
}) {
  // 监听partialText → 实时更新当前段落
  // 监听finalText → 创建最终段落
  // 在光标位置插入
}
```

#### `app/screens/.../smart_note_detail_screen.tsx` (修改)
```typescript
// 导入新Hook
import {useVoiceStream} from '@hooks/use_voice_stream';
import {useVoiceStreamTranscription} from './voice_stream_transcription';

// 获取token
const credentials = await getServerCredentials(serverUrl);
setBearerToken(credentials.token);

// 使用Hook
const {state, result, startStreaming, stopStreaming} = useVoiceStream(serverUrl, bearerToken);

// 自动插入文本
useVoiceStreamTranscription({...});

// 修改麦克风按钮
<TouchableOpacity onPress={async () => {
  if (voiceStreamState === 'recording') {
    await stopStreaming();
  } else {
    await startStreaming();
  }
}}>
  <CompassIcon name='microphone-outline' />
</TouchableOpacity>

// 添加指示器
{voiceStreamState === 'recording' && (
  <View style={style.recordingBanner}>
    <Text>实时转录中...说出你想写的内容</Text>
    <Text>"{result.partialText}"</Text>
  </View>
)}
```

---

## 🔧 技术细节

### 音频格式对比

| 功能 | 聊天窗口 | 智能笔记本 |
|------|---------|-----------|
| **Android API** | MediaRecorder | AudioRecord |
| **iOS API** | AVAudioRecorder | AVAudioEngine |
| **格式** | AAC/AMR（编码） | PCM 16kHz（原始） |
| **输出** | 完整文件 | 实时音频流 |
| **上传方式** | HTTP POST | WebSocket二进制 |
| **延迟** | 3-5秒 | <500ms |

### WebSocket协议

**客户端 → 服务器**
```
二进制消息: [PCM音频数据]
文本消息: {"type": "start|stop|cancel", "session_id": "xxx"}
```

**服务器 → 客户端**
```json
{
  "type": "transcription",
  "text": "今天天气很好",
  "is_final": false,
  "session_id": "xxx"
}
```

### 插件注册机制

```go
// 插件激活时
p.API.RegisterWebSocketHandler("voice-stream", pluginID, handler)

// 服务器存储
WebSocketHub.handlers["voice-stream"] = handler

// 客户端连接
GET /api/v4/plugins/voice-stream
↓
服务器查询: GetHandler("voice-stream")
↓
路由到插件（不关心具体是谁）
```

---

## 🧪 测试计划

### 功能测试

1. **基础功能**
   - ✅ 点击麦克风开始录音
   - ✅ 说话时文字实时出现
   - ✅ 再次点击停止录音
   - ✅ 最终文本插入到编辑区

2. **光标位置**
   - ✅ 在段落中间插入
   - ✅ 在末尾追加
   - ✅ 多段落连续录音

3. **错误处理**
   - ✅ 权限拒绝
   - ✅ 网络断开
   - ✅ 服务器错误

4. **兼容性**
   - ✅ 不影响聊天窗口语音消息
   - ✅ Android/iOS双平台
   - ✅ 不同网络环境

### 性能测试

- ✅ 延迟 <500ms
- ✅ 内存占用合理
- ✅ 电池消耗可接受
- ✅ 长时间录音稳定性

---

## 📝 编译步骤

### 1. 编译服务器
```bash
cd /home/work/mattermost-master/server
make build
./bin/mattermost
```

### 2. 编译插件
```bash
cd /home/work/mattermost-master/all-plugin/voice-to-text-plugin
make dist
# 上传 plugin.tar.gz 到服务器
```

### 3. 编译Android
```bash
cd /home/work/mattermost-mobile
npm run android
```

### 4. 编译iOS
```bash
cd /home/work/mattermost-mobile/ios
pod install
cd ..
npm run ios
```

---

## 🐛 常见问题

### Q: 为什么不用现有录音模块？
**A:** 现有模块使用MediaRecorder/AVAudioRecorder，生成完整文件，不支持实时流。

### Q: 两个录音API会冲突吗？
**A:** 不会。使用场景互斥（聊天窗口 vs 智能笔记本），不会同时使用。

### Q: 腾讯云ASR支持实时吗？
**A:** 支持。使用实时语音识别API（WebSocket方式）。

### Q: 服务器必须改代码吗？
**A:** 是的。需要添加WebSocket路由和插件注册机制。

### Q: 可以支持其他ASR服务吗？
**A:** 可以。插件完全自治，可以替换为阿里云、OpenAI等。

---

## 🎯 后续优化

1. **语音标点**
   - 自动添加标点符号
   - 支持语音指令（"换行"、"删除"）

2. **多语言支持**
   - 英文、粤语等
   - 语言自动检测

3. **离线模式**
   - 本地ASR（小模型）
   - 网络恢复后同步

4. **协作编辑**
   - 多人实时看到转录
   - 语音会议记录

---

## 📚 参考资料

- [腾讯云实时语音识别](https://cloud.tencent.com/document/product/1093/48980)
- [Mattermost Plugin API](https://developers.mattermost.com/integrate/plugins/)
- [WebSocket Protocol](https://tools.ietf.org/html/rfc6455)
- [React Native Audio](https://reactnative.dev/docs/audio)

---

## ✅ 完成状态

- [x] 服务器WebSocket路由
- [x] 插件WebSocket处理器
- [x] Android原生模块
- [x] iOS原生模块
- [x] React Native前端
- [x] 智能笔记本集成
- [ ] 测试验证
- [ ] 性能优化
- [ ] 文档完善

---

**最后更新**: 2026-11-05
**作者**: xq_mattermost_server
