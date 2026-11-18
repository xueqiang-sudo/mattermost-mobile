package com.dedalix.hardware.keyboard

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class DedalixHardwareKeyboardModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    private val impl = DedalixHardwareKeyboardImpl(context)

    override fun getName() = DedalixHardwareKeyboardImpl.NAME

    @ReactMethod
    fun addListener(eventName: String) {
        // Keep: Required for RN built in Event Emitter Calls
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Keep: Required for RN built in Event Emitter Calls
    }
}
