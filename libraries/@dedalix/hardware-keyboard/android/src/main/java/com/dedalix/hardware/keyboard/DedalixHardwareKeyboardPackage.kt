package com.dedalix.hardware.keyboard

import com.facebook.react.TurboReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class DedalixHardwareKeyboardPackage : TurboReactPackage() {
    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
        return if (name == DedalixHardwareKeyboardImpl.NAME) {
            DedalixHardwareKeyboardModule(reactContext)
        } else {
            null
        }
    }

    override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
        mapOf(
                DedalixHardwareKeyboardImpl.NAME to ReactModuleInfo(
                    name = DedalixHardwareKeyboardImpl.NAME,
                    className = DedalixHardwareKeyboardImpl.NAME,
                    canOverrideExistingModule = false,
                    needsEagerInit = false,
                    hasConstants = false,
                    isCxxModule = false,
                    isTurboModule = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
                )
        )
    }
}
