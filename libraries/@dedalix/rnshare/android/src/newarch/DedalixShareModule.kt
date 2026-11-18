package com.optibot.cnshare

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap

class DedalixShareModule(private val reactContext: ReactApplicationContext) : NativeDedalixShareSpec(reactContext) {
    private var implementation = DedalixShareImpl(reactContext)

    override fun getCurrentActivityName(): String = implementation.getCurrentActivityName()

    override fun clear() {
        implementation.clear()
    }

    override fun close(data: ReadableMap?) {
        implementation.close(data)
    }

    override fun getSharedData(promise: Promise?) {
        implementation.getSharedData(promise)
    }
}
