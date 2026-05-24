#import <Foundation/Foundation.h>
#import <AVFoundation/AVFoundation.h>

NS_ASSUME_NONNULL_BEGIN

__attribute__((objc_runtime_name("_TtC13VoiceRecorder20VoiceRecorderWrapper")))
@interface VoiceRecorderWrapper : NSObject <AVAudioRecorderDelegate>

- (void)startRecording:(NSDictionary<NSString *, id> * _Nullable)options
            completion:(void (^)(BOOL success, NSString * _Nullable errorCode))completion;

- (void)stopRecordingWithCompletion:(void (^)(NSDictionary<NSString *, id> *result))completion;

- (void)cancelRecording;

- (BOOL)deleteRecordingFileWithFilePath:(NSString *)filePath;

- (NSInteger)cleanExpiredRecordingFilesWithPrefix:(NSString *)prefix
                                         maxAgeMs:(double)maxAgeMs;

@end

NS_ASSUME_NONNULL_END
