//
//  ChannelService.swift
//  OptibotShare
//
// Copyright (c) 2015-present Optibot, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
//

import Gekidou
import Foundation

class ChannelService: ObservableObject {
  private var serverUrl: String
  
  @Published var selected: ChannelModel?
  @Published var channels: [ChannelModel] = []
  
  init() {
    self.serverUrl = ""
  }
  
  init(_ serverUrl: String) {
    self.serverUrl = serverUrl
    setServerUrl(serverUrl)
  }
  
  func setServerUrl(_ url: String) {
    self.serverUrl = url
    getCurrentChannel()
    getChannels()
  }
  
  func getCurrentChannel() {
    selected = Gekidou.Database.default.getCurrentChannelWithTeam(self.serverUrl)
  }
  
  func getChannels() {
    let allChannels = Array(Gekidou.Database.default.getChannelsWithTeam(self.serverUrl))
    channels = allChannels
      .filter { (channel: ChannelModel) in
        if let deactivated = channel.deactivated {
          return !deactivated || (deactivated && channel.type != "D")
        }

        return true
      }
      .map { (channel: ChannelModel) -> ChannelModel in
        // 公共频道显示团队名称，而不是频道名称
        if channel.type == "O" && channel.teamName != nil && !channel.teamName!.isEmpty {
          var modifiedChannel = channel
          modifiedChannel.displayName = channel.teamName!
          return modifiedChannel
        }
        return channel
      }

    if selected == nil || ((selected!.deactivated ?? false) && selected?.type == "D") {
      selected = channels.first
    }
  }
  
  func searchChannels(_ term: String) -> [ChannelModel] {
    let joinedChannelsMatchStart: [ChannelModel] = Gekidou.Database.default.searchJoinedChannels(serverUrl, term: term)
    let directChannelsMatchStart: [ChannelModel] = Gekidou.Database.default.searchDirectChannels(serverUrl, term: term)
    let channelsMatchStart = (joinedChannelsMatchStart + directChannelsMatchStart).sorted { ($0.lastViewedAt ?? 0) > ($1.lastViewedAt ?? 0)}

    let joinedChannelsMatch: [ChannelModel] = Gekidou.Database.default.searchJoinedChannels(serverUrl, term: term, matchStart: false)
    let directChannelsMatch: [ChannelModel] = Gekidou.Database.default.searchDirectChannels(serverUrl, term: term, matchStart: false)
    let channelsMatch = (joinedChannelsMatch + directChannelsMatch).sorted { ($0.lastViewedAt ?? 0) > ($1.lastViewedAt ?? 0)}

    let allChannels = channelsMatchStart + channelsMatch
    return allChannels
      .filter { (channel: ChannelModel) in
        if let deactivated = channel.deactivated {
          return !deactivated || (deactivated && channel.type != "D")
        }

        return true
      }
      .map { (channel: ChannelModel) -> ChannelModel in
        // 公共频道显示团队名称，而不是频道名称
        if channel.type == "O" && channel.teamName != nil && !channel.teamName!.isEmpty {
          var modifiedChannel = channel
          modifiedChannel.displayName = channel.teamName!
          return modifiedChannel
        }
        return channel
      }
  }
}
