#import "AppDelegate.h"

#import <AVFoundation/AVFoundation.h>

#import <React/RCTBundleURLProvider.h>
#import <React/RCTLinkingManager.h>
#import <RNKeychain/RNKeychainManager.h>
#import <ReactNativeNavigation/ReactNativeNavigation.h>
#import <UserNotifications/UserNotifications.h>
#import <TurboLogIOSNative/TurboLog.h>

#import "Optibot-Swift.h"
#import <os/log.h>

#import <RCTJPushModule.h>
#import "JPUSHService.h"

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

@interface AppDelegate () <JPUSHRegisterDelegate>
@end

@implementation AppDelegate

@synthesize orientationLock;

-(void)application:(UIApplication *)application handleEventsForBackgroundURLSession:(NSString *)identifier completionHandler:(void (^)(void))completionHandler {
  os_log(OS_LOG_DEFAULT, "Optibot will attach session from handleEventsForBackgroundURLSession!! identifier=%{public}@", identifier);
  [[GekidouWrapper default] attachSession:identifier completionHandler:completionHandler];
  os_log(OS_LOG_DEFAULT, "Optibot session ATTACHED from handleEventsForBackgroundURLSession!! identifier=%{public}@", identifier);
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

  // JPush 初始化由 JS JPush.init() 触发；AppDelegate 负责 APNs/JPush 系统回调转发至 RCTJPushModule
  os_log(OS_LOG_DEFAULT, "Optibot started!!");
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

#pragma mark - JPush / APNs

// 注册 APNS 成功并上报 DeviceToken
- (void)application:(UIApplication *)application didRegisterForRemoteNotificationsWithDeviceToken:(NSData *)deviceToken {
  [JPUSHService registerDeviceToken:deviceToken];
}

// iOS 7+ 后台/静默远程通知
- (void)application:(UIApplication *)application didReceiveRemoteNotification:(NSDictionary *)userInfo fetchCompletionHandler:(void (^)(UIBackgroundFetchResult))completionHandler {
  [JPUSHService handleRemoteNotification:userInfo];
  [[NSNotificationCenter defaultCenter] postNotificationName:J_APNS_NOTIFICATION_ARRIVED_EVENT object:userInfo];
  completionHandler(UIBackgroundFetchResultNewData);
}

// iOS 10+ 前台收到远程/本地通知
- (void)jpushNotificationCenter:(UNUserNotificationCenter *)center willPresentNotification:(UNNotification *)notification withCompletionHandler:(void (^)(NSInteger))completionHandler {
  NSDictionary *userInfo = notification.request.content.userInfo;
  if ([notification.request.trigger isKindOfClass:[UNPushNotificationTrigger class]]) {
    [JPUSHService handleRemoteNotification:userInfo];
    [[NSNotificationCenter defaultCenter] postNotificationName:J_APNS_NOTIFICATION_ARRIVED_EVENT object:userInfo];
  } else {
    [[NSNotificationCenter defaultCenter] postNotificationName:J_LOCAL_NOTIFICATION_ARRIVED_EVENT object:userInfo];
  }
  completionHandler(UNNotificationPresentationOptionAlert | UNNotificationPresentationOptionSound | UNNotificationPresentationOptionBadge);
}

// iOS 10+ 用户点击通知
- (void)jpushNotificationCenter:(UNUserNotificationCenter *)center didReceiveNotificationResponse:(UNNotificationResponse *)response withCompletionHandler:(void (^)(void))completionHandler {
  NSDictionary *userInfo = response.notification.request.content.userInfo;
  if ([response.notification.request.trigger isKindOfClass:[UNPushNotificationTrigger class]]) {
    [JPUSHService handleRemoteNotification:userInfo];
    // 冷启动点击通知时 JS 尚未就绪，先入队再由 RCTJPushModule 回放
    [[RCTJPushEventQueue sharedInstance]._notificationQueue insertObject:userInfo atIndex:0];
    [[NSNotificationCenter defaultCenter] postNotificationName:J_APNS_NOTIFICATION_OPENED_EVENT object:userInfo];
  } else {
    [[RCTJPushEventQueue sharedInstance]._localNotificationQueue insertObject:userInfo atIndex:0];
    [[NSNotificationCenter defaultCenter] postNotificationName:J_LOCAL_NOTIFICATION_OPENED_EVENT object:userInfo];
  }
  completionHandler();
}

// JPush 自定义消息（RCTJPushModule.setupWithConfig 会向 AppDelegate 注册此 selector）
- (void)networkDidReceiveMessage:(NSNotification *)notification {
  NSDictionary *userInfo = [notification userInfo];
  [[NSNotificationCenter defaultCenter] postNotificationName:J_CUSTOM_NOTIFICATION_EVENT object:userInfo];
}

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
