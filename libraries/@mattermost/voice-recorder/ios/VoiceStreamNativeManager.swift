import Foundation

/// 【优化】原生端 WebSocket 管理器
/// 直接在原生层管理 WebSocket 连接和音频发送，避免 Bridge 开销
class VoiceStreamNativeManager: NSObject, URLSessionWebSocketDelegate {
    private var webSocketTask: URLSessionWebSocketTask?
    private var urlSession: URLSession?

    // 回调（传回 JS 层）
    var onTranscription: ((String, Bool) -> Void)?
    var onConnected: (() -> Void)?
    var onError: ((String) -> Void)?
    var onClose: ((Int, String) -> Void)?

    /// 连接到语音流 WebSocket
    func connect(serverUrl: String, token: String) {
        let wsProtocol = serverUrl.hasPrefix("https") ? "wss" : "ws"
        let baseUrl = serverUrl.replacingOccurrences(of: "^https?://", with: "", options: .regularExpression)
        let wsUrlString = "\(wsProtocol)://\(baseUrl)/api/v4/voice-stream?token=\(token)"

        guard let url = URL(string: wsUrlString) else {
            onError?("Invalid WebSocket URL")
            return
        }

        let config = URLSessionConfiguration.default
        urlSession = URLSession(configuration: config, delegate: self, delegateQueue: OperationQueue.main)
        webSocketTask = urlSession?.webSocketTask(with: url)
        webSocketTask?.resume()

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
        guard let task = webSocketTask else { return }

        var message: [String: Any] = ["type": type]
        if let sessionId = sessionId {
            message["session_id"] = sessionId
        }

        guard let jsonData = try? JSONSerialization.data(withJSONObject: message) else { return }

        let wsMessage = URLSessionWebSocketTask.Message.data(jsonData)
        task.send(wsMessage) { error in
            if let error = error {
                print("[VoiceStreamNative] Failed to send control: \(error.localizedDescription)")
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
                    self?.handleTextMessage(text)
                case .data(let data):
                    if let text = String(data: data, encoding: .utf8) {
                        self?.handleTextMessage(text)
                    }
                @unknown default:
                    break
                }
                // 继续接收
                self?.receiveMessage()

            case .failure(let error):
                print("[VoiceStreamNative] Receive error: \(error.localizedDescription)")
            }
        }
    }

    /// 处理文本消息
    private func handleTextMessage(_ text: String) {
        guard let data = text.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return
        }

        guard let type = json["type"] as? String else { return }

        switch type {
        case "transcription":
            let transcription = json["text"] as? String ?? ""
            let isFinal = json["is_final"] as? Bool ?? false
            onTranscription?(transcription, isFinal)

        case "started":
            print("[VoiceStreamNative] Session started")

        case "completed":
            let finalText = json["text"] as? String ?? ""
            onTranscription?(finalText, true)

        case "error":
            let errorMsg = json["error"] as? String ?? "Unknown error"
            onError?(errorMsg)

        default:
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
