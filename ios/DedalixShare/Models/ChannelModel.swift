//
//  ChannelModel.swift
//  OptibotShare
//
// Copyright (c) 2015-present Optibot, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
//

import Gekidou
import SwiftUI
import Foundation

struct ChannelModel: Hashable, Codable, Identifiable {
  var id: String
  var name: String
  var displayName: String
  var type: String
  var teamName: String?
  var deactivated: Bool?
  var memberCount: Int?
  var lastViewedAt: Int64?
  
  enum ChannelCodingKeys: String, CodingKey {
    case id, name, type, deactivated
    case displayName = "display_name"
    case teamName = "team_display_name"
    case memberCount = "member_count"
    case lastViewedAt = "last_viewed_at"
  }
  
  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: ChannelCodingKeys.self)
    id = try container.decode(String.self, forKey: .id)
    name = try container.decode(String.self, forKey: .name)
    displayName = try container.decode(String.self, forKey: .displayName)
    type = try container.decode(String.self, forKey: .type)
    teamName = container.contains(.teamName) ? try? container.decode(String.self, forKey: .teamName) : nil
    memberCount = container.contains(.memberCount) ? try? container.decode(Int.self, forKey: .memberCount) : 0
    deactivated = container.contains(.deactivated) ? try? container.decode(Bool.self, forKey: .deactivated) : false
    lastViewedAt = container.contains(.lastViewedAt) ? try? container.decode(Int64.self, forKey: .lastViewedAt) : 0
  }
  
  init(id: String, name: String, displayName: String, type: String, teamName: String?, memberCount: Int?) {
    self.id = id
    self.name = name
    self.displayName = displayName
    self.type = type
    self.teamName = teamName
  }
  
  /// 从频道名称中提取所有用户 ID（用于群组消息）
  /// GM 频道名称格式: userId1__userId2__userId3...
  func getMemberIdsFromChannelName() -> [String] {
    let ids = name.components(separatedBy: "__")
    // 过滤空字符串
    return ids.filter { !$0.isEmpty }
  }

  /// 从频道名称中提取其他用户的 ID（用于直接消息）
  private func getUserIdFromChannelName(name: String, knownId: String) -> String? {
    let ids = name.components(separatedBy: "__")
    if ids.first == knownId {
      return ids.last
    }

    return ids.first
  }
  
  var formattedTeamName: String {
    if (teamName == nil || teamName!.isEmpty) {
      return ""
    }
    
    return "(\(teamName!))"
  }
  
  @ViewBuilder
  func icon(serverUrl: String) -> some View {
    switch (type) {
    case "P":
      // 私有频道：锁图标
      FontIcon.text(
        .compassIcons(code: .lock),
        fontsize: 24,
        color: Color.theme.centerChannelColor.opacity(0.72)
      )
      .frame(width: 24, height: 24)
    case "O":
      // 公开频道：地球图标
      FontIcon.text(
        .compassIcons(code: .globe),
        fontsize: 24,
        color: Color.theme.centerChannelColor.opacity(0.72)
      )
      .frame(width: 24, height: 24)
    case "G":
      // 群组消息：成员头像网格
      GmAvatarGrid(
        serverUrl: serverUrl,
        memberIds: getMemberIdsFromChannelName(),
        size: 40
      )
    case "D":
      // 直接消息：用户头像（由 image 方法处理）
      EmptyView()
    default:
      // 其他类型：默认图标
      FontIcon.text(
        .compassIcons(code: .globe),
        fontsize: 24,
        color: Color.theme.centerChannelColor.opacity(0.72)
      )
      .frame(width: 24, height: 24)
    }
  }
  
  @ViewBuilder
  func image(serverUrl: String) -> some View {
    if (type == "D") {
      if let currentUserId = try? Gekidou.Database.default.queryCurrentUserId(serverUrl),
         let otherId = getUserIdFromChannelName(name: name, knownId: currentUserId) {
        
        CustomAsyncImage(serverUrl: serverUrl, userId: otherId) {image in
          image
            .resizable()
            .scaledToFit()
            .frame(width: 24, height: 24)
            .clipShape(Circle())
        } placeholder: {
          ProgressView()
            .frame(width: 24, height: 24)
        }
      }
    }
    
    EmptyView()
  }
}
