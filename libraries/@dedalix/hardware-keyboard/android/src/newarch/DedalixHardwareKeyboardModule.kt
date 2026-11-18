package com.dedalix.hardware.keyboard

import com.facebook.react.bridge.ReactApplicationContext

class DedalixHardwareKeyboardModule(context: ReactApplicationContext) : NativeDedalixHardwareKeyboardSpec(context) {
    private val impl = DedalixHardwareKeyboardImpl(context)

    override fun getName(): String = DedalixHardwareKeyboardImpl.NAME

    override fun addListener(eventType: String?) {
        // Keep: Required for RN built in Event Emitter Calls
    }

    override fun removeListeners(count: Double) {
        // Keep: Required for RN built in Event Emitter Calls
    }
}
