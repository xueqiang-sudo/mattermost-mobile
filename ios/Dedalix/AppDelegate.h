#import <RNNAppDelegate.h>
#import <UIKit/UIKit.h>
#import <Expo/Expo.h>
#import "ExpoModulesCore-Swift.h"
#import <dedalix_rnutils-Swift.h>
#import <dedalix_hardware_keyboard-Swift.h>


@interface AppDelegate : EXAppDelegateWrapper<OrientationLockable>

@property (nonatomic) UIInterfaceOrientationMask orientationLock;

@end
