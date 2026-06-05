#import "AppDelegate.h"

#import <AVFoundation/AVFoundation.h>

#import <React/RCTBundleURLProvider.h>
#import <React/RCTLinkingManager.h>
#import <RNKeychain/RNKeychainManager.h>
#import <ReactNativeNavigation/ReactNativeNavigation.h>
#import <UserNotifications/UserNotifications.h>
#import <TurboLogIOSNative/TurboLog.h>

#import "Mattermost-Swift.h"
#import <os/log.h>

#if __has_include(<MSAL/MSAL.h>)
  #import <MSAL/MSAL.h>
  #define HAS_MSAL 1
#else
  #define HAS_MSAL 0
#endif

#if __has_include(<mattermost_intune/IntuneAccess.h>)
  #import <mattermost_intune/IntuneAccess.h>
  #define HAS_INTUNE 1
#else
  #define HAS_INTUNE 0
#endif

#define INTUNE_AVAILABLE   ((HAS_MSAL) && (HAS_INTUNE))

@implementation AppDelegate

@synthesize orientationLock;

-(void)application:(UIApplication *)application handleEventsForBackgroundURLSession:(NSString *)identifier completionHandler:(void (^)(void))completionHandler {
  os_log(OS_LOG_DEFAULT, "Mattermost will attach session from handleEventsForBackgroundURLSession!! identifier=%{public}@", identifier);
  [[GekidouWrapper default] attachSession:identifier completionHandler:completionHandler];
  os_log(OS_LOG_DEFAULT, "Mattermost session ATTACHED from handleEventsForBackgroundURLSession!! identifier=%{public}@", identifier);
}

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  NSString *appGroupId = [[NSBundle mainBundle] objectForInfoDictionaryKey:@"AppGroupIdentifier"];
  NSURL *containerURL = [[NSFileManager defaultManager] containerURLForSecurityApplicationGroupIdentifier:appGroupId];
  containerURL = [containerURL URLByAppendingPathComponent:@"Logs"];
  NSError *error = nil;
  [TurboLog configureWithDailyRolling:FALSE maximumFileSize:1024*1024 maximumNumberOfFiles:2 logsDirectory:containerURL.path logsFilename:@"MMLogs" error:&error];
  if (error) {
      NSLog(@"Failed to configure TurboLog: %@", error.localizedDescription);
    }
  [TurboLog writeWithLogLevel:TurboLogLevelInfo message:@[@"Configured turbolog"]];

  // Configure Gekidou to use TurboLog via wrapper
  [[GekidouWrapper default] configureTurboLogForGekidou];
  
#if INTUNE_AVAILABLE
  // Initialize Intune MAM delegates BEFORE React Native
  [IntuneAccess initializeIntuneDelegates];
#endif
  
  OrientationManager.shared.delegate = self;
  
  // Clear keychain on first run in case of reinstallation
  if (![[NSUserDefaults standardUserDefaults] objectForKey:@"FirstRun"]) {

    RNKeychainManager *keychain = [[RNKeychainManager alloc] init];
    NSArray<NSString*> *servers = [keychain getAllServersForInternetPasswords];
    [TurboLog writeWithLogLevel:TurboLogLevelInfo message:@[@"Servers", servers]];
    for (NSString *server in servers) {
      [keychain deleteCredentialsForServer:server withOptions:nil];
    }

    [[NSUserDefaults standardUserDefaults] setValue:@YES forKey:@"FirstRun"];
    [[NSUserDefaults standardUserDefaults] synchronize];
  }

  [[AVAudioSession sharedInstance] setCategory:AVAudioSessionCategoryPlayback error: nil];
  [[GekidouWrapper default] setPreference:@"true" forKey:@"ApplicationIsRunning"];

  // JPush SDK 自行管理通知注册和展示，无需额外调用 RNNotifications
  os_log(OS_LOG_DEFAULT, "Mattermost started!!");
  [ReactNativeNavigation bootstrapWithDelegate:self launchOptions:launchOptions];

#if INTUNE_AVAILABLE
  // Restore enrollments if needed (silent, non-blocking)
  [IntuneAccess checkAndRestoreEnrollmentOnLaunch];
#endif
  
  return YES;
}

-(BOOL)bridgelessEnabled {
  return NO;
}

// JPush SDK 自行处理远程通知注册和设备 token，无需 AppDelegate 方法
// 通知接收和展示由 JPush iOS SDK 接管

// Required for deeplinking
- (BOOL)application:(UIApplication *)application openURL:(NSURL *)url options:(NSDictionary<UIApplicationOpenURLOptionsKey,id> *)options{
  // Handle MSAL URLs first before passing to RCTLinkingManager
  if ([self handleMSALURL:url]) {
    return YES;
  }
  return [RCTLinkingManager application:application openURL:url options:options];
}

- (BOOL)application:(UIApplication *)application openURL:(NSURL *)url sourceApplication:(NSString *)sourceApplication annotation:(id)annotation {
  // Handle MSAL URLs first before passing to RCTLinkingManager
  if ([self handleMSALURL:url]) {
    return YES;
  }
  return [RCTLinkingManager application:application openURL:url sourceApplication:sourceApplication annotation:annotation];
}

// Helper method to handle MSAL URL schemes
- (BOOL)handleMSALURL:(NSURL *)url {
#if INTUNE_AVAILABLE
  NSString *urlString = url.absoluteString;
  NSString *bundleId = [[NSBundle mainBundle] bundleIdentifier];
  NSString *expectedPrefix = [NSString stringWithFormat:@"msauth.%@", bundleId];

  if ([urlString hasPrefix:expectedPrefix]) {
    [TurboLog writeWithLogLevel:TurboLogLevelInfo message:@[@"[Intune] MSAL URL handled"]];
    return [MSALPublicClientApplication handleMSALResponse:url sourceApplication:nil];
  }
#endif
  return NO;
}

// Only if your app is using [Universal Links](https://developer.apple.com/library/prerelease/ios/documentation/General/Conceptual/AppSearch/UniversalLinks.html).
- (BOOL)application:(UIApplication *)application continueUserActivity:(NSUserActivity *)userActivity
 restorationHandler:(void (^)(NSArray<id<UIUserActivityRestoring>> *restorableObjects))restorationHandler
{
  return [RCTLinkingManager application:application continueUserActivity:userActivity restorationHandler:restorationHandler];
}

-(void)applicationDidBecomeActive:(UIApplication *)application {
  [[GekidouWrapper default] setPreference:@"true" forKey:@"ApplicationIsForeground"];
}

-(void)applicationWillResignActive:(UIApplication *)application {
  [[GekidouWrapper default] setPreference:@"false" forKey:@"ApplicationIsForeground"];
}

-(void)applicationDidEnterBackground:(UIApplication *)application {
  [[GekidouWrapper default] setPreference:@"false" forKey:@"ApplicationIsForeground"];
}

-(void)applicationWillTerminate:(UIApplication *)application {
  [[GekidouWrapper default] setPreference:@"false" forKey:@"ApplicationIsForeground"];
  [[GekidouWrapper default] setPreference:@"false" forKey:@"ApplicationIsRunning"];
}

- (UIInterfaceOrientationMask)application:(UIApplication *)application supportedInterfaceOrientationsForWindow:(UIWindow *)window {
  return self.orientationLock;
}

- (NSArray<id<RCTBridgeModule>> *)extraModulesForBridge:(RCTBridge *)bridge
{
  NSMutableArray<id<RCTBridgeModule>> *extraModules = [NSMutableArray new];
  [extraModules addObjectsFromArray:[ReactNativeNavigation extraModulesForBridge:bridge]];
  
  // You can inject any extra modules that you would like here, more information at:
  // https://facebook.github.io/react-native/docs/native-modules-ios.html#dependency-injection
  return extraModules;
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
  #if DEBUG
    return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
  #else
    return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
  #endif
}

- (NSMutableArray<UIKeyCommand *> *)keyCommands {
  return [MattermostHardwareKeyboardWrapper registerKeyCommandsWithEnterPressed:
          @selector(sendEnter:) shiftEnterPressed:@selector(sendShiftEnter:) findChannels:@selector(sendFindChannels:)];
}

- (void)sendEnter:(UIKeyCommand *)sender {
  [MattermostHardwareKeyboardWrapper enterKeyPressed];
}

- (void)sendShiftEnter:(UIKeyCommand *)sender {
  [MattermostHardwareKeyboardWrapper shiftEnterKeyPressed];
}

- (void)sendFindChannels:(UIKeyCommand *)sender {
  [MattermostHardwareKeyboardWrapper findChannels];
}

@end
