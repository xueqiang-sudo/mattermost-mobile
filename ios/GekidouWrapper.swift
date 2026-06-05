//
//  GekidouWrapper.swift
//  Mattermost
//
//  Created by Elias Nahum on 06-04-22.
//  Copyright © 2022 Facebook. All rights reserved.
//

import Foundation
import Gekidou
import react_native_emm
import TurboLogIOSNative

@objc class GekidouWrapper: NSObject {
  @objc public static let `default` = GekidouWrapper()

  override init() {
    ScreenCaptureManager.startTrackingScreens()
  }

  @objc func configureTurboLogForGekidou() {
    GekidouLogger.shared.setLogHandler { level, message in
      let turboLevel: TurboLogIOSNative.TurboLogLevel
      switch level {
      case .debug:
        turboLevel = .debug
      case .info:
        turboLevel = .info
      case .warning:
        turboLevel = .warning
      case .error:
        turboLevel = .error
      }

      TurboLogIOSNative.TurboLogger.write(level: turboLevel, message: message)
    }
  }

  @objc func attachSession(_ id: String, completionHandler: @escaping () -> Void) {
    let shareExtension = ShareExtension()
    shareExtension.attachSession(
      id: id,
      completionHandler: completionHandler
    )
  }

  @objc func setPreference(_ value: Any?, forKey name: String) {
    Preferences.default.set(value, forKey: name)
  }

  @objc func getToken(for url: String) -> String? {
    if let credentials = try? Keychain.default.getCredentials(for: url) {
      return credentials.token
    }

    return nil
  }
}
