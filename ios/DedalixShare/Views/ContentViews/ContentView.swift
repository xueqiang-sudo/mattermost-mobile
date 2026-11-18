//
//  ContentView.swift
//  OptibotShare
//
// Copyright (c) 2015-present Optibot, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
//

import SwiftUI

struct ContentView: View {
  @EnvironmentObject var shareViewModel: ShareViewModel

  @Binding var attachments: [AttachmentModel]
  @Binding var linkPreviewUrl: String
  @Binding var message: String

  @State private var showServerPicker = false

  var hasChannels: Bool {
    shareViewModel.server?.hasChannels ?? false
  }

  var body: some View {
    VStack(spacing: 0) {
      // File preview strip
      if !attachments.isEmpty {
        FilePreviewStrip(attachments: $attachments)
        Divider()
          .background(Color.theme.centerChannelColor.opacity(0.08))
      }

      // Server selector (only when multiple servers)
      if shareViewModel.allServers.count > 1 {
        Button(action: { showServerPicker = true }) {
          HStack(spacing: 6) {
            Text(
              NSLocalizedString("share_extension.server_label",
                value: "Server",
                comment: ""
              )
            )
            .font(Font.custom("OpenSans", size: 13))
            .foregroundColor(Color.theme.centerChannelColor.opacity(0.56))

            Text(shareViewModel.server?.displayName ?? "")
              .font(Font.custom("OpenSans-SemiBold", size: 13))
              .foregroundColor(Color.theme.buttonBg)
              .lineLimit(1)

            Image(systemName: "chevron.down")
              .font(.system(size: 10))
              .foregroundColor(Color.theme.buttonBg)
          }
          .padding(.horizontal, 16)
          .padding(.vertical, 8)
        }
        .actionSheet(isPresented: $showServerPicker) {
          ActionSheet(
            title: Text(
              NSLocalizedString("share_extension.servers_screen.title",
                value: "Select server",
                comment: ""
              )
            ),
            buttons: shareViewModel.allServers.map { server in
              .default(Text(server.displayName)) {
                shareViewModel.selectServer(server)
              }
            } + [.cancel()]
          )
        }

        Divider()
          .background(Color.theme.centerChannelColor.opacity(0.08))
      }

      // Search bar
      SearchBarView()
        .padding(.horizontal, 12)
        .padding(.vertical, 8)

      // Channel list
      if hasChannels {
        ScrollView {
          LazyVStack(spacing: 0) {
            ForEach(shareViewModel.allChannels) { channel in
              ChannelItemView(channel: channel)
              Divider()
                .padding(.leading, 56)
                .background(Color.theme.centerChannelColor.opacity(0.08))
            }
          }
        }
      } else {
        VStack {
          Spacer()
          ErrorLabelView(
            error: NSLocalizedString("share_extension.channel_error",
              value: "You are not a member of a team on the selected server. Select another server or open Optibot to join a team.",
              comment: ""
            )
          )
          .padding(.horizontal, 16)
          Spacer()
        }
      }
    }
  }
}

// File preview strip component
struct FilePreviewStrip: View {
  @EnvironmentObject var shareViewModel: ShareViewModel
  @Binding var attachments: [AttachmentModel]

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        ForEach(attachments.indices, id: \.self) { index in
          let attachment = attachments[index]
          let isFirst = index == 0
          let isLast = index == attachments.count - 1

          AttachmentThumbnail(attachment: attachment)
            .padding(.leading, isFirst ? 12 : 0)
            .padding(.trailing, isLast ? 12 : 0)
        }
      }
      .padding(.vertical, 8)
    }
    .frame(maxHeight: 80)
    .background(Color.theme.centerChannelColor.opacity(0.02))
  }
}

// Single attachment thumbnail
struct AttachmentThumbnail: View {
  var attachment: AttachmentModel

  var body: some View {
    VStack(spacing: 2) {
      if attachment.type == .image {
        ImageThumbnail(small: true, attachment: attachment, hasError: false)
      } else if attachment.type == .video {
        VideoThumbnail(small: true, attachment: attachment, hasError: false)
      } else {
        FileThumbnail(small: true, attachment: attachment, hasError: false)
      }

      Text(attachment.fileName)
        .font(Font.custom("OpenSans", size: 10))
        .foregroundColor(Color.theme.centerChannelColor.opacity(0.72))
        .lineLimit(1)
        .frame(width: 64)
    }
  }
}
