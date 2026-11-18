//
//  InitialView.swift
//  OptibotShare
//
// Copyright (c) 2015-present Optibot, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
//

import SwiftUI

struct InitialView: View {
  @EnvironmentObject var shareViewModel: ShareViewModel

  @Binding var attachments: [AttachmentModel]
  @Binding var linkPreviewUrl: String
  @Binding var message: String
  @State var error: String?

  let onError = NotificationCenter.default.publisher(for: Notification.Name("errorPosting"))

  var noServers: Bool {
    shareViewModel.allServers.count == 0 || shareViewModel.server == nil
  }

  var noChannels: Bool {
    shareViewModel.allServers.allSatisfy({!$0.hasChannels})
  }

  var canSend: Bool {
    shareViewModel.server != nil &&
    shareViewModel.channel != nil &&
    !shareViewModel.allServers.isEmpty &&
    shareViewModel.server!.hasChannels &&
    (!message.isEmpty || !linkPreviewUrl.isEmpty || !attachments.isEmpty) &&
    message.count <= shareViewModel.server!.maxMessageLength &&
    !(attachments.count > 0 && shareViewModel.server!.uploadsDisabled) &&
    !attachments.contains {
      (($0.imagePixels ?? 0) > shareViewModel.server!.maxImageResolution) ||
      ($0.fileSize > shareViewModel.server!.maxFileSize)
    }
  }

  func close() {
    let userInfo: [String: Any] = [
      "attachments": attachments
    ]
    NotificationCenter.default.post(name: Notification.Name("close"), object: nil, userInfo: userInfo)
  }

  func submit() {
    let userInfo: [String: Any] = [
      "serverUrl": shareViewModel.server?.url as Any,
      "channelId": shareViewModel.channel?.id as Any,
      "attachments": attachments,
      "linkPreviewUrl": linkPreviewUrl,
      "message": message,
    ]
    NotificationCenter.default.post(name: Notification.Name("doPost"), object: nil, userInfo: userInfo)
  }

  var body: some View {
    VStack(spacing: 0) {
      // Custom header bar
      HStack(spacing: 0) {
        Button(action: close) {
          FontIcon.text(
            .compassIcons(code: .close),
            fontsize: 24,
            color: Color.theme.centerChannelColor
          )
          .frame(width: 40, height: 40)
        }

        Spacer()

        Text(
          NSLocalizedString("share_extension.forward_title",
            value: "Forward",
            comment: ""
          )
        )
        .font(Font.custom("Metropolis-SemiBold", size: 17))
        .foregroundColor(Color.theme.centerChannelColor)

        Spacer()

        Button(action: submit) {
          Text(
            NSLocalizedString("share_extension.send_button",
              value: "Send",
              comment: ""
            )
          )
          .font(Font.custom("OpenSans-SemiBold", size: 17))
          .foregroundColor(canSend ? Color.theme.buttonBg : Color.theme.buttonBg.opacity(0.4))
        }
        .disabled(!canSend)
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 8)

      Divider()
        .background(Color.theme.centerChannelColor.opacity(0.16))

      // Content area
      VStack {
        if error != nil {
          ErrorSharingView(error: error!)
            .transition(.opacity)
        } else if noServers {
          NoServersView()
        } else if noChannels {
          NoMembershipView()
        } else {
          ContentView(
            attachments: $attachments,
            linkPreviewUrl: $linkPreviewUrl,
            message: $message
          )
        }
      }
    }
    .animation(.linear(duration: 0.3))
    .onReceive(onError) {obj in
      if let userInfo = obj.userInfo, let info = userInfo["info"] as? String {
        error = info
      }
    }
  }
}
