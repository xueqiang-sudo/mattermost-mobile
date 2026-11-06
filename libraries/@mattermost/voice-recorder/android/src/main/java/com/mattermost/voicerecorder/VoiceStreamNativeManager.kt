package com.mattermost.voicerecorder

import okhttp3.*
import okio.ByteString
import okio.ByteString.Companion.toByteString
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * 【优化】原生端 WebSocket 管理器
 * 直接在原生层管理 WebSocket 连接和音频发送，避免 Bridge 开销
 */
class VoiceStreamNativeManager {
    private var webSocket: WebSocket? = null
    private var client: OkHttpClient? = null

    // 回调接口
    var onTranscription: ((String, Boolean) -> Unit)? = null
    var onConnected: (() -> Unit)? = null
    var onError: ((String) -> Unit)? = null
    var onClose: ((Int, String) -> Unit)? = null

    /**
     * 连接到语音流 WebSocket
     */
    fun connect(serverUrl: String, token: String) {
        val wsProtocol = if (serverUrl.startsWith("https")) "wss" else "ws"
        val baseUrl = serverUrl.replace(Regex("^https?://"), "")
        val wsUrl = "$wsProtocol://$baseUrl/api/v4/voice-stream?token=$token"

        client = OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(0, TimeUnit.MINUTES) // 无超时（长连接）
            .writeTimeout(10, TimeUnit.SECONDS)
            .build()

        val request = Request.Builder()
            .url(wsUrl)
            .build()

        webSocket = client?.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                println("[VoiceStreamNative] WebSocket connected")
                onConnected?.invoke()
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                handleTextMessage(text)
            }

            override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
                // 服务器不会发送二进制消息，忽略
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                println("[VoiceStreamNative] WebSocket closing: $code, $reason")
                webSocket.close(1000, null)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                println("[VoiceStreamNative] WebSocket closed: $code, $reason")
                onClose?.invoke(code, reason)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                println("[VoiceStreamNative] WebSocket failure: ${t.message}")
                onError?.invoke(t.message ?: "Unknown error")
            }
        })
    }

    /**
     * 直接发送音频数据（二进制，无 Base64 编码）
     */
    fun sendAudioData(data: ByteArray) {
        webSocket?.send(data.toByteString(0, data.size))
    }

    /**
     * 发送控制消息（JSON）
     */
    fun sendControlMessage(type: String, sessionId: String? = null) {
        val json = JSONObject()
        json.put("type", type)
        sessionId?.let { json.put("session_id", it) }

        webSocket?.send(json.toString())
    }

    /**
     * 断开连接
     */
    fun disconnect() {
        webSocket?.close(1000, "Normal closure")
        webSocket = null
        client?.dispatcher?.executorService?.shutdown()
        client = null
    }

    /**
     * 处理文本消息
     */
    private fun handleTextMessage(text: String) {
        try {
            val json = JSONObject(text)
            val type = json.optString("type", "")

            when (type) {
                "transcription" -> {
                    val transcription = json.optString("text", "")
                    val isFinal = json.optBoolean("is_final", false)
                    onTranscription?.invoke(transcription, isFinal)
                }
                "started" -> {
                    println("[VoiceStreamNative] Session started")
                }
                "completed" -> {
                    val finalText = json.optString("text", "")
                    onTranscription?.invoke(finalText, true)
                }
                "error" -> {
                    val errorMsg = json.optString("error", "Unknown error")
                    onError?.invoke(errorMsg)
                }
            }
        } catch (e: Exception) {
            println("[VoiceStreamNative] Failed to parse message: ${e.message}")
        }
    }
}
