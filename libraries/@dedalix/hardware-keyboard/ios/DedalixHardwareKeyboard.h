
#import <React/RCTEventEmitter.h>

#ifdef RCT_NEW_ARCH_ENABLED
#import "DedalixHardwareKeyboardSpec.h"

@interface DedalixHardwareKeyboard : RCTEventEmitter <NativeDedalixHardwareKeyboardSpec>
#else
#import <React/RCTBridgeModule.h>

@interface DedalixHardwareKeyboard : RCTEventEmitter <RCTBridgeModule>
#endif

@end
