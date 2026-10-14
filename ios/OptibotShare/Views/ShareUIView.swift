//
//  ShareUIView.swift
//  OptibotShare
//
// Copyright (c) 2015-present Optibot, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
//

import SwiftUI

struct ShareUIView: View {
  @StateObject var shareViewModel = ShareViewModel()
  @State var attachments: [AttachmentModel] = []
  @State var linkPreviewUrl: String = ""
  @State var message: String = ""

  var body: some View {
    InitialView(
      attachments: $attachments,
      linkPreviewUrl: $linkPreviewUrl,
      message: $message
    )
    .environmentObject(shareViewModel)
  }
}
