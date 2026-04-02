// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import FindChannelsScreen from './find_channels';
import {timeouts, wait} from '@support/utils';
import {expect} from 'detox';

/**
 * Browse-channels entry was removed from the home + menu; E2E flows use Find Channels (search) instead.
 * Dropdown/archived-only flows still reference browse_channels testIDs and are skipped in specs.
 */
class BrowseChannelsScreen {
    testID = {
        channelItemPrefix: 'browse_channels.custom_list.channel_item.',
        browseChannelsScreen: 'browse_channels.screen',
        closeButton: 'close.browse_channels.button',
        createButton: 'browse_channels.create.button',
        searchInput: 'browse_channels.search_bar.search.input',
        searchClearButton: 'browse_channels.search_bar.search.clear.button',
        searchCancelButton: 'browse_channels.search_bar.search.cancel.button',
        channelDropdown: 'browse_channels.channel_dropdown',
        channelDropdownTextPublic: 'browse_channels.channel_dropdown.text.public',
        channelDropdownTextArchived: 'browse_channels.channel_dropdown.text.archived',
        channelDropdownTextShared: 'browse_channels.channel_dropdown.text.shared',
        flatChannelList: 'browse_channels.channel_list.flat_list',
        scheduledPostTooltipCloseButton: 'scheduled_post.tooltip.close.button',
    };

    scheduledPostTooltipCloseButton = element(by.id(this.testID.scheduledPostTooltipCloseButton));
    browseChannelsScreen = FindChannelsScreen.findChannelsScreen;
    closeButton = FindChannelsScreen.closeButton;
    createButton = element(by.id(this.testID.createButton));
    searchInput = FindChannelsScreen.searchInput;
    searchClearButton = FindChannelsScreen.clearButton;
    searchCancelButton = FindChannelsScreen.cancelButton;
    channelDropdown = element(by.id(this.testID.channelDropdown));
    channelDropdownTextPublic = element(by.id(this.testID.channelDropdownTextPublic));
    channelDropdownTextArchived = element(by.id(this.testID.channelDropdownTextArchived));
    channelDropdownTextShared = element(by.id(this.testID.channelDropdownTextShared));
    flatChannelList = FindChannelsScreen.sectionUnfilteredChannelList;

    getChannelItem = (channelName: string) => {
        return FindChannelsScreen.getFilteredChannelItem(channelName);
    };

    getChannelItemDisplayName = (channelName: string) => {
        return FindChannelsScreen.getFilteredChannelItemDisplayName(channelName);
    };

    toBeVisible = async () => {
        return FindChannelsScreen.toBeVisible();
    };

    open = async () => {
        return FindChannelsScreen.open();
    };

    close = async () => {
        await FindChannelsScreen.close();
    };

    dismissScheduledPostTooltip = async () => {
        try {
            await this.scheduledPostTooltipCloseButton.tap();
        } catch (error) {
            // eslint-disable-next-line no-console
            console.log('Element not visible, skipping click');
        }
    };
}

const browseChannelsScreen = new BrowseChannelsScreen();
export default browseChannelsScreen;
