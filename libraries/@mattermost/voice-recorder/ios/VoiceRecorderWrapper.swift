import Foundation
import AVFoundation
import os.log

@objc public class VoiceRecorderWrapper: NSObject, AVAudioRecorderDelegate {
    
    private var audioRecorder: AVAudioRecorder?
    private var recordingStartTime: Date?
    private var recordingURL: URL?
    
    private let logger = OSLog(subsystem: "com.mattermost.voicerecorder", category: "VoiceRecorder")
    
    typealias StartRecordingCompletion = (Bool) -> Void
    typealias StopRecordingCompletion = ([String: Any]) -> Void
    
    private var startCompletion: StartRecordingCompletion?
    private var stopCompletion: StopRecordingCompletion?
    
    private func log(_ message: String, type: OSLogType = .default) {
        os_log("%{public}@", log: logger, type: type, message)
    }
    
    @objc public func startRecording(format: String?, completion: @escaping StartRecordingCompletion) {
        log("========== Swift 开始录音流程 ==========")
        log("请求参数 - format: \(format ?? "nil")")
        
        let audioSession = AVAudioSession.sharedInstance()
        
        do {
            log("步骤1：配置音频会话")
            try audioSession.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .duckOthers])
            try audioSession.setActive(true)
            log("音频会话配置成功")
            
            log("步骤2：创建录音文件")
            let tempDir = NSTemporaryDirectory()
            let fileExtension = format ?? "m4a"
            let fileName = "voice_\(UUID().uuidString).\(fileExtension)"
            let filePath = (tempDir as NSString).appendingPathComponent(fileName)
            recordingURL = URL(fileURLWithPath: filePath)
            log("录音文件路径: \(filePath)")
            log("录音格式: \(fileExtension)")
            
            log("步骤3：配置录音参数")
            var settings: [String: Any] = [:]
            
            if format == "amr" {
                settings = [
                    AVFormatIDKey: Int(kAudioFormatAMR),
                    AVSampleRateKey: 8000.0,
                    AVNumberOfChannelsKey: 1,
                    AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
                ]
                log("AMR 配置 - 采样率: 8000.0, 声道数: 1")
            } else {
                settings = [
                    AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
                    AVSampleRateKey: 44100.0,
                    AVNumberOfChannelsKey: 1,
                    AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
                ]
                log("AAC 配置 - 采样率: 44100.0, 声道数: 1")
            }
            
            log("步骤4：初始化音频录音器")
            audioRecorder = try AVAudioRecorder(url: recordingURL!, settings: settings)
            audioRecorder?.delegate = self
            log("音频录音器初始化成功")
            
            log("步骤5：开始录音")
            if let recorder = audioRecorder, recorder.record() {
                recordingStartTime = Date()
                log("录音已开始，开始时间: \(recordingStartTime!)")
                log("========== Swift 录音启动成功 ==========")
                startCompletion?(true)
            } else {
                log("录音启动失败", type: .error)
                log("========== Swift 录音启动失败 ==========")
                startCompletion?(false)
            }
        } catch {
            log("录音启动异常: \(error.localizedDescription)", type: .error)
            log("========== Swift 录音启动失败 ==========")
            startCompletion?(false)
        }
    }
    
    @objc public func stopRecording(completion: @escaping StopRecordingCompletion) {
        log("========== Swift 停止录音流程 ==========")
        
        guard let recorder = audioRecorder, recorder.isRecording else {
            log("没有活跃的录音", type: .default)
            completion([
                "success": false,
                "error": "No active recording"
            ])
            return
        }
        
        log("停止录音器")
        stopCompletion = completion
        recorder.stop()
        log("录音器已停止")
    }
    
    @objc public func cancelRecording() {
        log("========== Swift 取消录音流程 ==========")
        
        guard let recorder = audioRecorder, recorder.isRecording else {
            log("没有活跃的录音，无需取消")
            return
        }
        
        log("停止录音")
        recorder.stop()
        
        log("删除录音文件")
        deleteRecordingFile()
        
        do {
            log("停用音频会话")
            try AVAudioSession.sharedInstance().setActive(false)
            log("音频会话已停用")
        } catch {
            log("停用音频会话失败: \(error.localizedDescription)", type: .error)
        }
        
        log("========== Swift 取消录音完成 ==========")
    }
    
    private func deleteRecordingFile() {
        guard let url = recordingURL else {
            log("没有录音文件需要删除")
            return
        }
        
        log("删除录音文件: \(url.path)")
        do {
            try FileManager.default.removeItem(at: url)
            log("录音文件删除成功")
        } catch {
            log("删除录音文件失败: \(error.localizedDescription)", type: .error)
        }
    }
    
    /**
     * 删除指定的录音文件
     * @param filePath - 要删除的文件路径
     * @returns 是否成功删除
     */
    @objc public func deleteRecordingFile(filePath: String) -> Bool {
        log("========== Swift 删除指定录音文件 ==========")
        log("文件路径: \(filePath)")
        
        let fileURL = URL(fileURLWithPath: filePath)
        do {
            try FileManager.default.removeItem(at: fileURL)
            log("文件删除成功")
            log("========== Swift 删除文件完成 ==========")
            return true
        } catch {
            log("文件删除失败: \(error.localizedDescription)", type: .error)
            log("========== Swift 删除文件完成 ==========")
            return false
        }
    }
    
    /**
     * 清理指定前缀的过期临时录音文件
     * @param prefix - 文件前缀
     * @param maxAgeMs - 文件最大保留时间（毫秒）
     * @returns 删除的文件数量
     */
    @objc public func cleanExpiredRecordingFiles(prefix: String, maxAgeMs: Double) -> Int {
        log("========== Swift 清理过期录音文件 ==========")
        log("文件前缀: \(prefix)")
        log("最大保留时间: \(maxAgeMs)ms")
        
        let tempDir = NSTemporaryDirectory()
        let tempDirURL = URL(fileURLWithPath: tempDir)
        let fileManager = FileManager.default
        var deletedCount = 0
        
        log("临时目录: \(tempDir)")
        
        do {
            let fileURLs = try fileManager.contentsOfDirectory(at: tempDirURL, includingPropertiesForKeys: [.creationDateKey, .nameKey])
            log("临时目录文件总数: \(fileURLs.count)")
            
            for fileURL in fileURLs {
                let fileName = fileURL.lastPathComponent
                
                if fileName.hasPrefix(prefix) {
                    let resourceValues = try fileURL.resourceValues(forKeys: [.creationDateKey])
                    if let creationDate = resourceValues.creationDate {
                        let ageMs = Date().timeIntervalSince(creationDate) * 1000
                        log("检查文件: \(fileName), 年龄: \(ageMs)ms")
                        
                        if ageMs > maxAgeMs {
                            try fileManager.removeItem(at: fileURL)
                            deletedCount += 1
                            log("已删除过期文件: \(fileName)")
                        }
                    }
                }
            }
            
            log("总共删除了 \(deletedCount) 个过期文件")
        } catch {
            log("清理过期文件失败: \(error.localizedDescription)", type: .error)
        }
        
        log("========== Swift 清理完成 ==========")
        return deletedCount
    }
    
    public func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        log("========== Swift 录音完成回调 ==========")
        log("录音成功: \(flag)")
        
        defer {
            audioRecorder = nil
            recordingStartTime = nil
            log("录音器已重置")
        }
        
        do {
            log("停用音频会话")
            try AVAudioSession.sharedInstance().setActive(false)
            log("音频会话已停用")
        } catch {
            log("停用音频会话失败: \(error.localizedDescription)", type: .error)
        }
        
        var result: [String: Any] = [:]
        
        if flag, let url = recordingURL {
            let duration = recordingStartTime.flatMap { Date().timeIntervalSince($0) * 1000 } ?? 0
            log("录音时长: \(duration)ms")
            log("录音文件路径: \(url.path)")
            
            result = [
                "success": true,
                "filePath": url.path,
                "durationMs": Int(duration)
            ]
        } else {
            log("录音失败，删除录音文件")
            deleteRecordingFile()
            result = [
                "success": false,
                "error": "Recording failed"
            ]
        }
        
        log("========== Swift 录音完成回调结束 ==========")
        stopCompletion?(result)
    }
    
    public func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
        log("========== Swift 录音编码错误 ==========")
        if let error = error {
            log("错误信息: \(error.localizedDescription)", type: .error)
        }
        
        log("删除录音文件")
        deleteRecordingFile()
        
        do {
            log("停用音频会话")
            try AVAudioSession.sharedInstance().setActive(false)
            log("音频会话已停用")
        } catch {
            log("停用音频会话失败: \(error.localizedDescription)", type: .error)
        }
        
        stopCompletion?([
            "success": false,
            "error": error?.localizedDescription ?? "Unknown error"
        ])
        
        audioRecorder = nil
        recordingStartTime = nil
        log("录音器已重置")
        log("========== Swift 录音编码错误结束 ==========")
    }
}
