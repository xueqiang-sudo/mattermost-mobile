//
//  SearchBarView.swift
//  OptibotShare
//
// Copyright (c) 2015-present Optibot, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
//

import SwiftUI

struct SearchBarView: View {
  @EnvironmentObject var shareViewModel: ShareViewModel

  var body: some View {
    HStack {
      Image(systemName: "magnifyingglass")
        .foregroundColor(Color.theme.centerChannelColor.opacity(0.56))
        .padding(.leading, 10)

      TextField(
        NSLocalizedString("forward.search_placeholder",
          value: "Search groups...",
          comment: ""
        ),
        text: $shareViewModel.search
      )
      .foregroundColor(Color.theme.centerChannelColor)
      .font(Font.custom("OpenSans", size: 15))

      if !shareViewModel.search.isEmpty {
        Button(action: {
          shareViewModel.search = ""
        }) {
          Image(systemName: "multiply.circle.fill")
            .foregroundColor(Color.theme.centerChannelColor.opacity(0.4))
        }
        .padding(.trailing, 10)
      }
    }
    .frame(height: 36)
    .background(
      RoundedRectangle(cornerRadius: 8)
        .fill(Color.theme.centerChannelColor.opacity(0.06))
    )
  }
}
