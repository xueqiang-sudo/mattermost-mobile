package com.mattermost.voicerecorder

import com.facebook.react.TurboReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class VoiceRecorderPackage : TurboReactPackage() {
    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
        return if (name == VoiceRecorderModuleImpl.NAME) {
            VoiceRecorderModule(reactContext)
        } else {
            null
        }
    }

    override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
        mapOf(
                VoiceRecorderModuleImpl.NAME to ReactModuleInfo(
                        VoiceRecorderModuleImpl.NAME,
                        VoiceRecorderModuleImpl.NAME,
                        _canOverrideExistingModule = false,
                        _needsEagerInit = false,
                        isCxxModule = false,
                        isTurboModule = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
                )
        )
    }
}
