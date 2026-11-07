import Foundation
import os.log

/// 【优化】原生端 WebSocket 管理器
/// 直接在原生层管理 WebSocket 连接和音频发送，避免 Bridge 开销
class VoiceStreamNativeManager: NSObject, URLSessionWebSocketDelegate {
    private var webSocketTask: URLSessionWebSocketTask?
    private var urlSession: URLSession?
    private let logger = OSLog(subsystem: "com.mattermost.voicerecorder", category: "VoiceStreamNative")

    // 回调（传回 JS 层）
    var onTranscription: ((String, Bool) -> Void)?
    var onConnected: (() -> Void)?
    var onError: ((String) -> Void)?
    var onClose: ((Int, String) -> Void)?
    var onLog: ((String, String) -> Void)?  // (level, message)

    private func log(_ message: String, type: OSLogType = .default) {
        os_log("%{public}@", log: logger, type: type, message)
        // 同时发送到 JS 层
        let level = type == .error ? "error" : "info"
        onLog?(level, message)
    }

    /// 连接到语音流 WebSocket
    func connect(serverUrl: String, token: String) {
        let wsProtocol = serverUrl.hasPrefix("https") ? "wss" : "ws"
        let baseUrl = serverUrl.replacingOccurrences(of: "^https?://", with: "", options: .regularExpression)
        let wsUrlString = "\(wsProtocol)://\(baseUrl)/api/v4/voice-stream?token=\(token)"

        print("[VoiceStreamNative] 正在连接 WebSocket: \(wsUrlString.prefix(100))...")

        guard let url = URL(string: wsUrlString) else {
            print("[VoiceStreamNative] ❌ Invalid WebSocket URL")
            onError?("Invalid WebSocket URL")
            return
        }

        let config = URLSessionConfiguration.default
        urlSession = URLSession(configuration: config, delegate: self, delegateQueue: OperationQueue.main)
        webSocketTask = urlSession?.webSocketTask(with: url)
        webSocketTask?.resume()

        print("[VoiceStreamNative] WebSocket 任务已启动，等待连接...")

        // 开始接收消息
        receiveMessage()
    }

    /// 直接发送音频数据（二进制，无 Base64 编码）
    func sendAudioData(_ data: Data) {
        guard let task = webSocketTask else { return }

        let message = URLSessionWebSocketTask.Message.data(data)
        task.send(message) { error in
            if let error = error {
                print("[VoiceStreamNative] Failed to send audio: \(error.localizedDescription)")
            }
        }
    }

    /// 发送控制消息（JSON）
    func sendControlMessage(type: String, sessionId: String? = nil) {
        log("📤 准备发送控制消息: type=\(type)")
        guard let task = webSocketTask else {
            log("❌ webSocketTask 为 nil，无法发送", type: .error)
            return
        }

        var message: [String: Any] = ["type": type]
        if let sessionId = sessionId {
            message["session_id"] = sessionId
        }

        guard let jsonData = try? JSONSerialization.data(withJSONObject: message) else {
            log("❌ JSON 序列化失败", type: .error)
            return
        }

        let wsMessage = URLSessionWebSocketTask.Message.data(jsonData)
        task.send(wsMessage) { [weak self] error in
            if let error = error {
                self?.log("❌ 发送控制消息失败: \(error.localizedDescription)", type: .error)
            } else {
                self?.log("✅ 控制消息发送成功: type=\(type)")
            }
        }
    }

    /// 断开连接
    func disconnect() {
        webSocketTask?.cancel(with: .normalClosure, reason: nil)
        webSocketTask = nil
        urlSession?.invalidateAndCancel()
        urlSession = nil
    }

    /// 接收 WebSocket 消息
    private func receiveMessage() {
        webSocketTask?.receive { [weak self] result in
            switch result {
            case .success(let message):
                switch message {
                case .string(let text):
                    print("[VoiceStreamNative] 收到文本消息: \(text.prefix(200))")
                    self?.handleTextMessage(text)
                case .data(let data):
                    if let text = String(data: data, encoding: .utf8) {
                        print("[VoiceStreamNative] 收到数据消息: \(text.prefix(200))")
                        self?.handleTextMessage(text)
                    }
                @unknown default:
                    break
                }
                // 继续接收
                self?.receiveMessage()

            case .failure(let error):
                print("[VoiceStreamNative] ❌ 接收消息失败: \(error.localizedDescription)")
            }
        }
    }

    /// 处理文本消息
    private func handleTextMessage(_ text: String) {
        guard let data = text.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            print("[VoiceStreamNative] ⚠️ 无法解析 JSON: \(text.prefix(100))")
            return
        }

        guard let type = json["type"] as? String else {
            print("[VoiceStreamNative] ⚠️ 消息缺少 type 字段")
            return
        }

        print("[VoiceStreamNative] 处理消息类型: \(type)")

        switch type {
        case "transcription":
            let transcription = json["text"] as? String ?? ""
            let isFinal = json["is_final"] as? Bool ?? false
            print("[VoiceStreamNative] 📝 转录: '\(transcription)', isFinal=\(isFinal)")
            onTranscription?(transcription, isFinal)

        case "started":
            print("[VoiceStreamNative] ✅ 会话已启动")

        case "completed":
            let finalText = json["text"] as? String ?? ""
            print("[VoiceStreamNative] ✅ 会话完成: '\(finalText)'")
            onTranscription?(finalText, true)

        case "error":
            let errorMsg = json["error"] as? String ?? "Unknown error"
            print("[VoiceStreamNative] ❌ 服务端错误: \(errorMsg)")
            onError?(errorMsg)

        default:
            print("[VoiceStreamNative] ⚠️ 未知消息类型: \(type)")
            break
        }
    }

    // MARK: - URLSessionWebSocketDelegate

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
        print("[VoiceStreamNative] WebSocket connected")
        onConnected?()
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        let reasonStr = reason.flatMap { String(data: $0, encoding: .utf8) } ?? ""
        print("[VoiceStreamNative] WebSocket closed: \(closeCode.rawValue), \(reasonStr)")
        onClose?(Int(closeCode.rawValue), reasonStr)
    }
}
