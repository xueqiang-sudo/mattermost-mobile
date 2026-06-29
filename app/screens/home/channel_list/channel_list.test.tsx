// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {type ComponentProps} from 'react';

import PerformanceMetricsManager from '@managers/performance_metrics_manager';
import {resetToTeams} from '@screens/navigation';
import {useTeamsLoading} from '@hooks/teams_loading';
import {renderWithEverything, waitFor} from '@test/intl-test-helper';
import TestHelper from '@test/test_helper';

import ChannelListScreen from './channel_list';

import type {Database} from '@nozbe/watermelondb';

jest.mock('@managers/performance_metrics_manager', () => ({
    __esModule: true,
    default: {
        finishLoad: jest.fn(),
        measureTimeToInteraction: jest.fn(),
    },
}));
jest.mock('./conversation_list', () => {
    const React = require('react');
    const {View} = require('react-native');
    return () => React.createElement(View, {testID: 'conversation-list'});
});
jest.mock('@actions/remote/user', () => ({
    refetchCurrentUser: jest.fn(),
}));
jest.mock('@calls/components/floating_call_container', () => () => null);
jest.mock('@components/announcement_banner', () => () => null);
jest.mock('./additional_tablet_view', () => () => null);
jest.mock('@screens/navigation', () => ({
    resetToTeams: jest.fn(),
    openToS: jest.fn(),
}));
jest.mock('@hooks/teams_loading', () => ({
    useTeamsLoading: jest.fn(() => false),
}));
jest.mock('@react-navigation/native', () => ({
    useIsFocused: () => true,
    useNavigation: () => ({isFocused: () => true}),
    useRoute: () => ({}),
    useFocusEffect: jest.fn(),
}));
jest.mock('@managers/websocket_manager', () => ({
    __esModule: true,
    default: {
        isConnected: jest.fn(() => true),
        openAll: jest.fn(),
    },
}));

jest.mock('@react-native-camera-roll/camera-roll', () => ({
    CameraRoll: {
        save: jest.fn().mockResolvedValue('path'),
    },
}));

function getBaseProps(): ComponentProps<typeof ChannelListScreen> {
    return {
        hasChannels: true,
        hasCurrentUser: true,
        hasMoreThanOneTeam: true,
        hasTeams: true,
        isCRTEnabled: true,
        isLicensed: true,
        launchType: 'normal',
        showIncomingCalls: true,
        showToS: false,
        currentUserId: 'someId',
    };
}

describe('performance metrics', () => {
    let database: Database;
    const serverUrl = 'http://www.someserverurl.com';
    beforeAll(async () => {
        const server = await TestHelper.setupServerDatabase(serverUrl);
        database = server.database;
    });

    it('finish load on load', async () => {
        const props = getBaseProps();
        renderWithEverything(<ChannelListScreen {...props}/>, {database, serverUrl});
        await waitFor(() => {
            expect(PerformanceMetricsManager.finishLoad).toHaveBeenCalledWith('HOME', serverUrl);
        });
    });
});

describe('resetToTeams guard', () => {
    let database: Database;
    const serverUrl = 'http://www.someserverurl.com';

    beforeAll(async () => {
        const server = await TestHelper.setupServerDatabase(serverUrl);
        database = server.database;
    });

    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
        jest.mocked(useTeamsLoading).mockReturnValue(false);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('does not reset when hasTeams is true', () => {
        renderWithEverything(
            <ChannelListScreen {...getBaseProps()} hasTeams={true}/>,
            {database, serverUrl},
        );

        jest.advanceTimersByTime(1000);
        expect(resetToTeams).not.toHaveBeenCalled();
    });

    it('does not reset immediately when hasTeams is false', () => {
        renderWithEverything(
            <ChannelListScreen {...getBaseProps()} hasTeams={false}/>,
            {database, serverUrl},
        );

        jest.advanceTimersByTime(100);
        expect(resetToTeams).not.toHaveBeenCalled();
    });

    it('resets after delay when hasTeams stays false and teams are not loading', () => {
        renderWithEverything(
            <ChannelListScreen {...getBaseProps()} hasTeams={false}/>,
            {database, serverUrl},
        );

        jest.advanceTimersByTime(500);
        expect(resetToTeams).toHaveBeenCalledTimes(1);
    });

    it('does not reset while teams are loading', () => {
        jest.mocked(useTeamsLoading).mockReturnValue(true);

        renderWithEverything(
            <ChannelListScreen {...getBaseProps()} hasTeams={false}/>,
            {database, serverUrl},
        );

        jest.advanceTimersByTime(1000);
        expect(resetToTeams).not.toHaveBeenCalled();
    });

    it('does not reset when hasTeams recovers before delay expires', () => {
        const {rerender} = renderWithEverything(
            <ChannelListScreen {...getBaseProps()} hasTeams={false}/>,
            {database, serverUrl},
        );

        jest.advanceTimersByTime(200);
        rerender(
            <ChannelListScreen {...getBaseProps()} hasTeams={true}/>,
        );
        jest.advanceTimersByTime(500);
        expect(resetToTeams).not.toHaveBeenCalled();
    });
});
