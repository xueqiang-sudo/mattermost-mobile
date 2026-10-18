//
//  GmAvatarGrid.swift
//  OptibotShare
//
// Copyright (c) 2015-present Optibot, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
//

import SwiftUI
import Foundation
import Gekidou

/// 群组消息头像网格组件（类似微信群头像）
/// 最多显示 9 个成员头像，根据人数自动调整布局
struct GmAvatarGrid: View {
  let serverUrl: String
  let memberIds: [String]
  let size: CGFloat

  init(serverUrl: String, memberIds: [String], size: CGFloat = 40) {
    self.serverUrl = serverUrl
    self.memberIds = Array(memberIds.prefix(9)) // 最多 9 个头像
    self.size = size
  }

  var body: some View {
    GeometryReader { geo in
      let actualSize = min(geo.size.width, geo.size.height)
      let slots = calculateSlots(count: memberIds.count, size: actualSize)

      ZStack {
        // 背景
        RoundedRectangle(cornerRadius: 4)
          .fill(Color.theme.centerChannelColor.opacity(0.16))
          .frame(width: actualSize, height: actualSize)

        // 头像网格
        ForEach(Array(memberIds.enumerated()), id: \.offset) { index, userId in
          if index < slots.count {
            let slot = slots[index]
            CustomAsyncImage(serverUrl: serverUrl, userId: userId) { image in
              image
                .resizable()
                .scaledToFill()
                .frame(width: slot.width, height: slot.height)
                .clipShape(Circle())
            } placeholder: {
              Circle()
                .fill(Color.theme.centerChannelColor.opacity(0.32))
                .frame(width: slot.width, height: slot.height)
                .overlay(
                  Text(getInitial(userId: userId))
                    .font(Font.custom("OpenSans-SemiBold", size: slot.width * 0.4))
                    .foregroundColor(Color.theme.centerChannelColor)
                )
            }
            .position(x: slot.left + slot.width / 2, y: slot.top + slot.height / 2)
          }
        }
      }
    }
    .frame(width: size, height: size)
  }

  /// 计算每个头像的位置和大小（与主应用 gm_avatar_grid.tsx 一致）
  private func calculateSlots(count: Int, size: CGFloat) -> [SlotLayout] {
    let gap: CGFloat = 2
    let pad = gap / 2

    // 1 人：整格
    if count == 1 {
      return [SlotLayout(
        left: pad,
        top: pad,
        width: size - gap,
        height: size - gap
      )]
    }

    // 2 人：左右各半、竖向拉满
    if count == 2 {
      let colW = (size - gap * 2) / 2
      let h = size - gap
      return [
        SlotLayout(left: pad, top: pad, width: colW, height: h),
        SlotLayout(left: pad + colW + gap, top: pad, width: colW, height: h)
      ]
    }

    // 3 人：上排两个、下排一个水平居中
    if count == 3 {
      let rowH = (size - gap * 2) / 2
      let cellW = (size - gap * 2) / 2
      let bottomTop = pad + rowH + gap
      let bottomLeft = (size - cellW) / 2
      return [
        SlotLayout(left: pad, top: pad, width: cellW, height: rowH),
        SlotLayout(left: pad + cellW + gap, top: pad, width: cellW, height: rowH),
        SlotLayout(left: bottomLeft, top: bottomTop, width: cellW, height: rowH)
      ]
    }

    // 4+ 人：网格布局
    let gridCols = count <= 4 ? 2 : 3
    let cellSize = size / CGFloat(gridCols)
    let avatarSize = max(4, cellSize - gap)

    return (0..<count).map { index in
      let row = index / gridCols
      let col = index % gridCols
      return SlotLayout(
        left: CGFloat(col) * cellSize + gap / 2,
        top: CGFloat(row) * cellSize + gap / 2,
        width: avatarSize,
        height: avatarSize
      )
    }
  }

  /// 获取用户名的首字母（用于占位符）
  private func getInitial(userId: String) -> String {
    // Try to get user's display name from database
    if let displayName = try? Gekidou.Database.default.queryUserDisplayName(for: userId, forServerUrl: serverUrl) {
      let trimmed = displayName.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines)
      if !trimmed.isEmpty {
        // For Chinese names, use the first character
        // For English names, use the first letter
        return String(trimmed.prefix(1)).uppercased()
      }
    }

    // Fallback: use first character of userId
    let firstChar = userId.first.map { String($0) } ?? "?"
    return firstChar.uppercased()
  }
}

/// 头像位置布局
private struct SlotLayout {
  let left: CGFloat
  let top: CGFloat
  let width: CGFloat
  let height: CGFloat
}
