#import "DedalixHardwareKeyboard.h"

#if __has_include("dedalix_hardware_keyboard-Swift.h")
#import "dedalix_hardware_keyboard-Swift.h"
#else
#import <dedalix_hardware_keyboard/dedalix_hardware_keyboard-Swift.h>
#endif

@interface DedalixHardwareKeyboard () <DedalixHardwareKeyboardDelegate>
@end

@implementation DedalixHardwareKeyboard {
    DedalixHardwareKeyboardWrapper *wrapper;
    bool hasListeners;
}

-(instancetype) init {
    self = [super init];
    if (self) {
        DedalixHardwareKeyboardWrapper.delegate = self;
    }
    
    return self;
}

-(void)startObserving {
    hasListeners = YES;
}

// Will be called when this module's last listener is removed, or on dealloc.
-(void)stopObserving {
    hasListeners = NO;
}

RCT_EXPORT_MODULE(DedalixHardwareKeyboard)

// Don't compile this code when we build for the old architecture.
#ifdef RCT_NEW_ARCH_ENABLED
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
    return std::make_shared<facebook::react::NativeDedalixHardwareKeyboardSpecJSI>(params);
}
#endif

- (void)sendEventWithName:(NSString * _Nonnull)name result:(NSDictionary<NSString *,NSString *> * _Nonnull)result {
    if (hasListeners) {
        [self sendEventWithName:name body:result];
    }
}

-(NSArray<NSString *>*)supportedEvents {
    return [DedalixHardwareKeyboardWrapper supportedEvents];
}

-(BOOL)requiresMainQueueSetup {
    return NO;
}

@end
