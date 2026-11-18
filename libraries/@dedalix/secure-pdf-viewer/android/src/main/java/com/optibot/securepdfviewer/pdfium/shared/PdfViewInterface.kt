package com.optibot.securepdfviewer.pdfium.shared

interface PdfViewInterface {
    val viewWidth: Int
    val viewHeight: Int
    fun invalidate()
}
