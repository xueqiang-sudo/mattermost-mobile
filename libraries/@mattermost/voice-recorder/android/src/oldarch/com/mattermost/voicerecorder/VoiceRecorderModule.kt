package com.mattermost.voicerecorder

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap

class VoiceRecorderModule(context: ReactApplicationContext) :
    ReactContextBaseJavaModule(context) {
    private var implementation: VoiceRecorderModuleImpl = VoiceRecorderModuleImpl(context)

    override fun getName(): String = VoiceRecorderModuleImpl.NAME

    override fun invalidate() {
        implementation.invalidate()
        super.invalidate()
    }

    override fun getConstants(): MutableMap<String, Any> = implementation.getTypedExportedConstants()

    @ReactMethod
    fun addListener(eventType: String?) {
    }

    @ReactMethod
    fun removeListeners(count: Double) {
    }

    /**
     * 开始录音
     * @param options - 录音配置选项对象
     * @param promise - Promise 回调
     */
    @ReactMethod
    fun startRecording(options: ReadableMap?, promise: Promise) {
        implementation.startRecording(options, promise)
    }

    @ReactMethod
    fun stopRecording(promise: Promise) {
        implementation.stopRecording(promise)
    }

    @ReactMethod
    fun cancelRecording(promise: Promise) {
        implementation.cancelRecording(promise)
    }

    /**
     * 删除指定的录音文件
     * @param filePath - 要删除的文件路径
     * @param promise - Promise 回调
     */
    @ReactMethod
    fun deleteRecordingFile(filePath: String, promise: Promise) {
        implementation.deleteRecordingFile(filePath, promise)
    }

    /**
     * 清理指定前缀的过期临时录音文件
     * @param prefix - 文件前缀
     * @param maxAgeMs - 文件最大保留时间（毫秒）
     * @param promise - Promise 回调
     */
    @ReactMethod
    fun cleanExpiredRecordingFiles(prefix: String, maxAgeMs: Double, promise: Promise) {
        implementation.cleanExpiredRecordingFiles(prefix, maxAgeMs, promise)
    }

    // ═══════════════════════════════════════════════════════════════
    // 【优化】原生直传模式方法
    // ═══════════════════════════════════════════════════════════════

    /**
     * 启动实时录音（原生直传模式）
     * 音频数据直接通过 WebSocket 发送到服务器，避免 Bridge 开销
     * @param options - 包含 serverUrl 和 token 的选项对象
     * @param promise - Promise 回调
     */
    @ReactMethod
    fun startRealtimeRecordingDirect(options: ReadableMap?, promise: Promise) {
        implementation.startRealtimeRecordingDirect(options, promise)
    }

    /**
     * 发送控制消息到语音流服务器
     * @param message - 控制消息对象，包含 type 和可选的 session_id
     */
    @ReactMethod
    fun sendControlMessage(message: ReadableMap?) {
        implementation.sendControlMessage(message)
    }

    /**
     * 断开语音流 WebSocket 连接
     */
    @ReactMethod
    fun disconnectVoiceStream() {
        implementation.disconnectVoiceStream()
    }
}
