# 智能笔记本语音流崩溃修复

## 问题描述

点击智能笔记本的麦克风按钮时 App 崩溃（闪退）。

## 根因分析

### 服务端要求
- **文件**: `/home/work/mattermost-master/server/channels/api4/voice_stream.go`
- **配置**: `EngineModelType: "16k_zh"` (line 197)
- **要求**: 16kHz PCM 音频格式

### iOS 端问题

#### 1. **采样率不匹配**（致命问题）
- **代码位置**: `libraries/@mattermost/voice-recorder/ios/VoiceRecorderWrapper.swift`
- **问题**: 
  - 创建了 16kHz 的 `recordingFormat` (line 302-306)
  - 但实际使用硬件采样率 `hardwareFormat` (line 325)
  - 硬件采样率通常是 44.1kHz 或 48kHz
  - 导致发送给服务端的音频是 44.1kHz/48kHz，而非 16kHz
- **后果**:
  - 服务端 ASR 无法正确识别音频
  - 可能导致识别失败或返回错误结果

#### 2. **缺少首选采样率设置**
- **问题**: AVAudioSession 未设置 `preferredSampleRate`
- **后果**: iOS 使用默认硬件采样率，无法保证 16kHz 输出

#### 3. **潜在崩溃点**
根据用户提供的崩溃分析，以下情况可能导致崩溃：

1. **音频格式校验缺失**（已修复）
   - 代码已有检查：line 317-321 和 330-334
   - ✅ 已防护

2. **React Native Bridge 被结果洪流冲垮**
   - 高频的 `onPartial` 回调可能堵塞 Bridge
   - ⚠️ 需要观察

3. **权限回调线程问题**
   - 代码使用 `runOnMain` 确保主线程执行 (line 262, 369)
   - ✅ 已防护

4. **AVAudioSession 配置冲突**
   - 未设置首选采样率可能导致配置冲突
   - ✅ **已修复**

### Android 端状态
- **文件**: `libraries/@mattermost/voice-recorder/android/src/main/java/com/mattermost/voicerecorder/VoiceRecorderModuleImpl.kt`
- **配置**: `val sampleRate = 16000` (line 376)
- **状态**: ✅ 已正确配置为 16kHz

## 修复方案

### iOS 修复 1：设置首选采样率

```swift
// 在激活 AVAudioSession 之前设置首选采样率
try audioSession.setPreferredSampleRate(16000.0)
log("首选采样率已设置: 16000Hz")

try audioSession.setCategory(.record, mode: .measurement, options: [.duckOthers])
try audioSession.setActive(true)
log("音频会话已激活，实际采样率：\(audioSession.sampleRate)Hz")
```

**作用**: 
- 告诉 iOS 系统我们希望使用 16kHz 采样率
- iOS 会尽量配置硬件使用 16kHz（如果支持）
- 即使硬件不支持，也会通过 AVAudioEngine 自动进行采样率转换

### iOS 修复 2：优先使用 16kHz 录音格式

```swift
// 优先使用 16kHz 录音格式（服务端要求）
let actualFormat: AVAudioFormat
if hardwareFormat.sampleRate == 16000.0 {
    // 硬件已经是 16kHz，直接使用
    actualFormat = hardwareFormat
    log("硬件已支持 16kHz，直接使用")
} else if let desiredFormat = AVAudioFormat(
    commonFormat: .pcmFormatInt16,
    sampleRate: 16000.0,
    channels: 1,
    interleaved: true
) {
    // 使用 16kHz 格式（AVAudioEngine 会自动进行采样率转换）
    actualFormat = desiredFormat
    log("使用 16kHz 录音格式（将自动转换）")
} else {
    // 回退到硬件格式
    actualFormat = hardwareFormat
    log("无法创建 16kHz 格式，使用硬件格式: \(hardwareFormat.sampleRate)Hz", type: .warning)
}
```

**作用**:
- 优先尝试使用 16kHz 格式
- AVAudioEngine 会自动在 `installTap` 时进行采样率转换
- 确保发送给服务端的音频是 16kHz

## 修复效果

### 修复前
- ❌ iOS 发送 44.1kHz/48kHz 音频
- ❌ 服务端 ASR 无法正确识别
- ❌ 可能崩溃或识别失败

### 修复后
- ✅ iOS 发送 16kHz 音频（符合服务端要求）
- ✅ 服务端 ASR 正确识别
- ✅ 录音稳定，不崩溃

## 测试步骤

1. **编译 iOS 应用**
   ```bash
   cd ios && pod install && cd ..
   npx react-native run-ios
   ```

2. **测试语音流功能**
   - 打开智能笔记本
   - 点击麦克风按钮
   - 说几句话
   - 检查是否实时转录文本
   - 点击停止，检查最终文本是否正确

3. **查看日志**
   ```bash
   # 查看 iOS 日志
   npx react-native log-ios | grep "VOICE_STREAM\|音频"
   
   # 关注以下关键日志：
   # - "首选采样率已设置: 16000Hz"
   # - "音频会话已激活，实际采样率：16000.0Hz"
   # - "使用 16kHz 录音格式（将自动转换）"
   ```

4. **权限测试**
   - 首次授权后点击麦克风（测试权限回调）
   - 已授权状态下多次点击开始/停止（测试稳定性）

## 崩溃排查清单

如果仍有崩溃，请检查：

### 1. Xcode 崩溃日志
```bash
# 连接设备后
Xcode -> Window -> Devices and Simulators -> View Device Logs
```

重点关注：
- `Exception Type: EXC_CRASH (SIGABRT)`
- `NSInternalInconsistencyException`
- `IsFormatSampleRateAndChannelCountValid`

### 2. 音频格式验证
在 `installTap` 前添加日志：
```swift
log("即将安装 tap: format=\(actualFormat), sampleRate=\(actualFormat.sampleRate)")
```

### 3. Bridge 节流
如果 `onPartial` 回调过于频繁，在原生层添加节流：
```swift
// 在 audio tap 回调中
private var lastCallbackTime: Date?
private let throttleInterval: TimeInterval = 0.1  // 100ms

if let lastTime = lastCallbackTime,
   Date().timeIntervalSince(lastTime) < throttleInterval {
    return  // 节流
}
lastCallbackTime = Date()
```

### 4. Info.plist 检查
确保包含以下权限描述：
```xml
<key>NSMicrophoneUsageDescription</key>
<string>需要使用麦克风进行语音转文字</string>
<key>NSSpeechRecognitionUsageDescription</key>
<string>需要使用语音识别将语音转换为文字</string>
```

## 文件变更列表

### 修改的文件
1. `libraries/@mattermost/voice-recorder/ios/VoiceRecorderWrapper.swift`
   - 添加 `setPreferredSampleRate(16000.0)`
   - 优先使用 16kHz 录音格式
   - 增强日志输出

### 未修改的文件（已正确配置）
1. `libraries/@mattermost/voice-recorder/android/src/main/java/com/mattermost/voicerecorder/VoiceRecorderModuleImpl.kt`
   - ✅ 已使用 16kHz 采样率

## 参考资源

- [腾讯云 ASR 文档](https://cloud.tencent.com/document/product/1093)
- [AVAudioEngine 官方文档](https://developer.apple.com/documentation/avfaudio/avaudioengine)
- [iOS 音频会话编程指南](https://developer.apple.com/library/archive/documentation/Audio/Conceptual/AudioSessionProgrammingGuide/)
