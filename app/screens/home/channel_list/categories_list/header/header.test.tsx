// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import {renderWithIntlAndTheme} from '@test/intl-test-helper';

import Header from './header';

jest.mock('@actions/remote/session', () => ({
    logout: jest.fn(),
}));
jest.mock('@screens/navigation', () => ({
    findChannels: jest.fn(),
    showModal: jest.fn(),
}));
jest.mock('@screens/qr_scanner/show_modal', () => ({
    showQrScannerModal: jest.fn(),
}));
jest.mock('@utils/server', () => ({
    alertServerLogout: jest.fn(),
}));
jest.mock('@assets/images/svgs/open_drawer.svg', () => {
    const React = require('react');
    const {View} = require('react-native');
    return {
        __esModule: true,
        default: () => React.createElement(View, {testID: 'open-drawer-icon'}),
    };
});
jest.mock('@context/left_drawer', () => ({
    useLeftDrawer: () => ({
        openDrawer: jest.fn(),
    }),
}));

jest.mock('@context/plus_menu', () => ({
    usePlusMenu: () => ({
        openPlusMenu: jest.fn(),
    }),
}));

jest.mock('@context/server', () => ({
    useServerDisplayName: () => 'Test Server',
    useServerUrl: () => 'http://localhost',
}));

jest.mock('@react-native-community/netinfo', () => ({
    useNetInfo: () => ({isConnected: true}),
}));

jest.mock('@managers/websocket_manager', () => ({
    __esModule: true,
    default: {
        observeWebsocketState: () => ({
            subscribe: (cb: (state: string) => void) => {
                cb('connected');
                return {unsubscribe: jest.fn()};
            },
        }),
    },
}));

const baseProps = {
    canCreateChannels: true,
    canInvitePeople: true,
    hasCurrentTeam: false,
    hasTeams: false,
};

describe('components/channel_list/header', () => {
    it('shows drawer, search, and plus when current team exists', () => {
        const {getByTestId, queryByTestId} = renderWithIntlAndTheme(
            <Header
                {...baseProps}
                hasCurrentTeam={true}
            />,
        );

        expect(getByTestId('channel_list_header.menu.button')).toBeTruthy();
        expect(getByTestId('channel_list_header.search.button')).toBeTruthy();
        expect(getByTestId('channel_list_header.plus.button')).toBeTruthy();
        expect(queryByTestId('channel_list_header.logout.button')).toBeNull();
    });

    it('shows drawer, search, and plus when user has teams but current team is not resolved yet', () => {
        const {getByTestId, queryByTestId} = renderWithIntlAndTheme(
            <Header
                {...baseProps}
                hasTeams={true}
            />,
        );

        expect(getByTestId('channel_list_header.menu.button')).toBeTruthy();
        expect(getByTestId('channel_list_header.search.button')).toBeTruthy();
        expect(getByTestId('channel_list_header.plus.button')).toBeTruthy();
        expect(queryByTestId('channel_list_header.logout.button')).toBeNull();
    });

    it('shows server name and logout when there is no team context', () => {
        const {getByTestId, queryByTestId} = renderWithIntlAndTheme(
            <Header {...baseProps}/>,
        );

        expect(getByTestId('channel_list_header.logout.button')).toBeTruthy();
        expect(queryByTestId('channel_list_header.menu.button')).toBeNull();
        expect(queryByTestId('channel_list_header.search.button')).toBeNull();
        expect(queryByTestId('channel_list_header.plus.button')).toBeNull();
    });
});
