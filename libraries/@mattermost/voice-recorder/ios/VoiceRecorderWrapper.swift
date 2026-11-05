import Foundation
import AVFoundation
import os.log

@objc public class VoiceRecorderWrapper: NSObject, AVAudioRecorderDelegate {
    private var audioRecorder: AVAudioRecorder?
    private var recordingStartTime: Date?
    private var recordingURL: URL?

    private let logger = OSLog(subsystem: "com.mattermost.voicerecorder", category: "VoiceRecorder")

    public typealias StopRecordingCompletion = ([String: Any]) -> Void
    private var stopCompletion: StopRecordingCompletion?

    private func log(_ message: String, type: OSLogType = .default) {
        os_log("%{public}@", log: logger, type: type, message)
    }

    private func runOnMain(_ work: @escaping () -> Void) {
        if Thread.isMainThread {
            work()
        } else {
            DispatchQueue.main.async(execute: work)
        }
    }

    @objc(startRecording:completion:)
    public func startRecording(_ options: [String: Any]?, completion: @escaping (Bool, NSString?) -> Void) {
        let session = AVAudioSession.sharedInstance()

        switch session.recordPermission {
        case .undetermined:
            session.requestRecordPermission { [weak self] granted in
                self?.runOnMain {
                    guard let self else { return }
                    if granted {
                        self.beginRecordingSession(options: options, completion: completion)
                    } else {
                        completion(false, "PERMISSION_DENIED")
                    }
                }
            }
        case .denied:
            completion(false, "PERMISSION_DENIED")
        case .granted:
            beginRecordingSession(options: options, completion: completion)
        @unknown default:
            completion(false, "PERMISSION_DENIED")
        }
    }

    private func beginRecordingSession(options: [String: Any]?, completion: @escaping (Bool, NSString?) -> Void) {
        let format = options?["format"] as? String
        let prefix = options?["prefix"] as? String
        let audioSession = AVAudioSession.sharedInstance()

        do {
            try audioSession.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .duckOthers])
            try audioSession.setActive(true)

            let tempDir = NSTemporaryDirectory()
            let fileExtension = format == "amr" ? "amr" : "m4a"
            let filePrefix = prefix ?? "voice_"
            let fileName = "\(filePrefix)\(UUID().uuidString).\(fileExtension)"
            let filePath = (tempDir as NSString).appendingPathComponent(fileName)
            let url = URL(fileURLWithPath: filePath)
            recordingURL = url

            let settings: [String: Any]
            if format == "amr" {
                settings = [
                    AVFormatIDKey: Int(kAudioFormatAMR),
                    AVSampleRateKey: 8000.0,
                    AVNumberOfChannelsKey: 1,
                    AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
                ]
            } else {
                settings = [
                    AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
                    AVSampleRateKey: 44100.0,
                    AVNumberOfChannelsKey: 1,
                    AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
                ]
            }

            let recorder = try AVAudioRecorder(url: url, settings: settings)
            recorder.delegate = self
            audioRecorder = recorder

            if recorder.record() {
                recordingStartTime = Date()
                completion(true, nil)
            } else {
                audioRecorder = nil
                recordingURL = nil
                recordingStartTime = nil
                completion(false, nil)
            }
        } catch {
            audioRecorder = nil
            recordingURL = nil
            recordingStartTime = nil
            completion(false, nil)
        }
    }

    @objc public func stopRecording(completion: @escaping StopRecordingCompletion) {
        guard let recorder = audioRecorder, recorder.isRecording else {
            completion([
                "success": false,
                "error": "No active recording",
            ])
            return
        }

        stopCompletion = completion
        recorder.stop()
    }

    @objc public func cancelRecording() {
        stopCompletion = nil

        guard let recorder = audioRecorder else {
            return
        }

        if recorder.isRecording {
            recorder.stop()
        }

        deleteActiveRecordingFile()

        audioRecorder = nil
        recordingStartTime = nil
        recordingURL = nil

        try? AVAudioSession.sharedInstance().setActive(false)
    }

    private func deleteActiveRecordingFile() {
        guard let url = recordingURL else {
            return
        }
        try? FileManager.default.removeItem(at: url)
    }

    @objc public func deleteRecordingFile(filePath: String) -> Bool {
        let fileURL = URL(fileURLWithPath: filePath)
        do {
            try FileManager.default.removeItem(at: fileURL)
            return true
        } catch {
            return false
        }
    }

    @objc public func cleanExpiredRecordingFiles(prefix: String, maxAgeMs: Double) -> Int {
        let tempDir = NSTemporaryDirectory()
        let tempDirURL = URL(fileURLWithPath: tempDir)
        let fileManager = FileManager.default
        var deletedCount = 0

        do {
            let fileURLs = try fileManager.contentsOfDirectory(at: tempDirURL, includingPropertiesForKeys: [.creationDateKey, .nameKey])
            for fileURL in fileURLs {
                let fileName = fileURL.lastPathComponent
                if fileName.hasPrefix(prefix) {
                    let resourceValues = try fileURL.resourceValues(forKeys: [.creationDateKey])
                    if let creationDate = resourceValues.creationDate {
                        let ageMs = Date().timeIntervalSince(creationDate) * 1000
                        if ageMs > maxAgeMs {
                            try fileManager.removeItem(at: fileURL)
                            deletedCount += 1
                        }
                    }
                }
            }
        } catch {
            log("cleanExpiredRecordingFiles failed", type: .error)
        }

        return deletedCount
    }

    public func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        runOnMain { [weak self] in
            self?.handleDidFinishRecording(successfully: flag)
        }
    }

    private func handleDidFinishRecording(successfully flag: Bool) {
        defer {
            audioRecorder = nil
            recordingStartTime = nil
        }

        try? AVAudioSession.sharedInstance().setActive(false)

        var result: [String: Any]
        if flag, let url = recordingURL {
            let durationMs = recordingStartTime.map { Int(Date().timeIntervalSince($0) * 1000) } ?? 0
            result = [
                "success": true,
                "filePath": url.path,
                "durationMs": durationMs,
            ]
        } else {
            deleteActiveRecordingFile()
            result = [
                "success": false,
                "error": "Recording failed",
            ]
        }

        let completion = stopCompletion
        stopCompletion = nil
        completion?(result)
    }

    public func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
        runOnMain { [weak self] in
            self?.handleEncodeError(error: error)
        }
    }

    private func handleEncodeError(error: Error?) {
        deleteActiveRecordingFile()
        try? AVAudioSession.sharedInstance().setActive(false)

        let completion = stopCompletion
        stopCompletion = nil
        completion?([
            "success": false,
            "error": error?.localizedDescription ?? "Unknown error",
        ])

        audioRecorder = nil
        recordingStartTime = nil
    }

    // ═══════════════════════════════════════════════════════════════
    // 新增：实时录音方法（用于智能笔记本语音转文本）
    // 使用 AVAudioEngine 实现流式音频捕获
    // 不影响现有的 startRecording / stopRecording
    // ═══════════════════════════════════════════════════════════════

    private var audioEngine: AVAudioEngine?
    private var isRealtimeRecording = false

    @objc(startRealtimeRecording:onChunkReady:completion:)
    public func startRealtimeRecording(_ options: [String: Any]?,
                                       onChunkReady: @escaping (String) -> Void,
                                       completion: @escaping (Bool, NSString?) -> Void) {
        log("========== iOS 开始实时录音 ==========")

        let session = AVAudioSession.sharedInstance()

        // 检查权限
        switch session.recordPermission {
        case .undetermined:
            session.requestRecordPermission { [weak self] granted in
                self?.runOnMain {
                    guard let self else { return }
                    if granted {
                        self.beginRealtimeRecording(options: options, onChunkReady: onChunkReady, completion: completion)
                    } else {
                        completion(false, "PERMISSION_DENIED")
                    }
                }
            }
        case .denied:
            completion(false, "PERMISSION_DENIED")
        case .granted:
            beginRealtimeRecording(options: options, onChunkReady: onChunkReady, completion: completion)
        @unknown default:
            completion(false, "PERMISSION_DENIED")
        }
    }

    private func beginRealtimeRecording(options: [String: Any]?,
                                        onChunkReady: @escaping (String) -> Void,
                                        completion: @escaping (Bool, NSString?) -> Void) {
        let audioSession = AVAudioSession.sharedInstance()

        do {
            // 配置音频会话
            try audioSession.setCategory(.record, mode: .measurement, options: [.duckOthers])
            try audioSession.setActive(true)

            // 创建 AVAudioEngine
            let engine = AVAudioEngine()
            let inputNode = engine.inputNode

            // 配置录音格式（PCM 16kHz 单声道，适合流式传输）
            let recordingFormat = AVAudioFormat(
                commonFormat: .pcmFormatInt16,
                sampleRate: 16000.0,
                channels: 1,
                interleaved: true
            )!

            // 安装音频tap，捕获实时音频
            inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] buffer, time in
                guard let self = self, self.isRealtimeRecording else { return }

                // 将音频数据转换为 base64
                let audioData = buffer.audioBufferList.pointee.mBuffers

                // 检查 mData 指针是否有效
                guard let mDataPointer = audioData.mData else {
                    return
                }

                // Data(bytes:count:) 返回非 Optional 的 Data，直接使用
                let data = Data(bytes: mDataPointer, count: Int(audioData.mDataByteSize))
                let base64String = data.base64EncodedString()

                // 回调给JS
                self.runOnMain {
                    onChunkReady(base64String)
                }
            }

            // 启动引擎
            try engine.start()

            audioEngine = engine
            isRealtimeRecording = true

            log("========== iOS 实时录音已启动 ==========")
            completion(true, nil)

        } catch {
            log("实时录音启动失败: \(error.localizedDescription)", type: .error)
            completion(false, "RECORD_ERROR")
        }
    }

    @objc(stopRealtimeRecordingWithCompletion:)
    public func stopRealtimeRecording(completion: @escaping () -> Void) {
        log("========== iOS 停止实时录音 ==========")

        isRealtimeRecording = false

        // 停止音频引擎
        audioEngine?.stop()
        audioEngine?.inputNode.removeTap(onBus: 0)
        audioEngine = nil

        // 释放音频会话
        try? AVAudioSession.sharedInstance().setActive(false)

        log("========== iOS 停止实时录音完成 ==========")
        runOnMain {
            completion()
        }
    }
}
