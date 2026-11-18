#import <Foundation/Foundation.h>
#import <AVFoundation/AVFoundation.h>
#import <React/RCTEventEmitter.h>

NS_ASSUME_NONNULL_BEGIN

__attribute__((objc_runtime_name("_TtC13VoiceRecorder20VoiceRecorderWrapper")))
@interface VoiceRecorderWrapper : NSObject <AVAudioRecorderDelegate>

// 【修复】设置 eventEmitter（延迟注入）
- (void)setEventEmitter:(RCTEventEmitter *)eventEmitter;

- (void)startRecording:(NSDictionary<NSString *, id> * _Nullable)options
            completion:(void (^)(BOOL success, NSString * _Nullable errorCode))completion;

- (void)stopRecordingWithCompletion:(void (^)(NSDictionary<NSString *, id> *result))completion;

- (void)cancelRecording;

- (BOOL)deleteRecordingFileWithFilePath:(NSString *)filePath;

- (NSInteger)cleanExpiredRecordingFilesWithPrefix:(NSString *)prefix
                                         maxAgeMs:(double)maxAgeMs;

// 新增：实时录音方法（用于智能笔记本）
- (void)startRealtimeRecording:(NSDictionary<NSString *, id> * _Nullable)options
                  onChunkReady:(void (^)(NSString *base64Chunk))onChunkReady
                    completion:(void (^)(BOOL success, NSString * _Nullable errorCode))completion;

- (void)stopRealtimeRecordingWithCompletion:(void (^)(void))completion;

// 【优化】原生直传模式方法（避免 Bridge 瓶颈）
- (void)startRealtimeRecordingDirect:(NSDictionary<NSString *, id> * _Nullable)options
                          completion:(void (^)(BOOL success, NSString * _Nullable errorCode))completion;

- (void)sendControlMessage:(NSDictionary<NSString *, id> * _Nullable)message;

- (void)disconnectVoiceStream;

@end

NS_ASSUME_NONNULL_END
