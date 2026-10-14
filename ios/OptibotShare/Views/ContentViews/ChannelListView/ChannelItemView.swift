//
//  ChannelItemView.swift
//  OptibotShare
//
// Copyright (c) 2015-present Optibot, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
//

import SwiftUI

struct ChannelItemView: View {
  @EnvironmentObject var shareViewModel: ShareViewModel

  var channel: ChannelModel

  var isSelected: Bool {
    shareViewModel.channel?.id == channel.id
  }

  var body: some View {
    Button(action: {
      shareViewModel.selectChannel(channel)
    }) {
      HStack(spacing: 12) {
        // Circular checkbox
        ZStack {
          Circle()
            .strokeBorder(
              isSelected ? Color.theme.buttonBg : Color.theme.centerChannelColor.opacity(0.32),
              lineWidth: 2
            )
            .background(
              Circle()
                .fill(isSelected ? Color.theme.buttonBg : Color.clear)
            )
            .frame(width: 24, height: 24)

          if isSelected {
            FontIcon.text(
              .compassIcons(code: .check),
              fontsize: 14,
              color: .white
            )
          }
        }

        // Channel icon
        if channel.type == "D" {
          channel.image(serverUrl: shareViewModel.server!.url)
        } else {
          channel.icon(serverUrl: shareViewModel.server!.url)
        }

        // Channel name + team name
        VStack(alignment: .leading, spacing: 2) {
          Text(channel.displayName)
            .lineLimit(1)
            .foregroundColor(Color.theme.centerChannelColor)
            .font(Font.custom("OpenSans", size: 16))

          if let teamName = channel.teamName, !teamName.isEmpty {
            Text(teamName)
              .lineLimit(1)
              .foregroundColor(Color.theme.centerChannelColor.opacity(0.64))
              .font(Font.custom("OpenSans", size: 12))
          }
        }

        Spacer()
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 10)
      .background(isSelected ? Color.theme.buttonBg.opacity(0.08) : Color.clear)
    }
    .buttonStyle(.plain)
  }
}
