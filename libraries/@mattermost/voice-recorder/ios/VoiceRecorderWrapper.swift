import Foundation
import AVFoundation
import os.log

@objc public class VoiceRecorderWrapper: NSObject, AVAudioRecorderDelegate {
    private var audioRecorder: AVAudioRecorder?
    private var recordingStartTime: Date?
    private var recordingURL: URL?

    private let logger = OSLog(subsystem: "com.mattermost.voicerecorder", category: "VoiceRecorder")

    typealias StopRecordingCompletion = ([String: Any]) -> Void
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
}
