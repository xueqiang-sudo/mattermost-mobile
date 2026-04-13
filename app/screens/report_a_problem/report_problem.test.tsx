// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {type ComponentProps} from 'react';
import {View} from 'react-native';

import {Screens} from '@constants';
import {renderWithIntl} from '@test/intl-test-helper';

import AppLogs from './app_logs';
import ReportProblem from './report_problem';

jest.mock('@utils/share_logs', () => ({
    ...jest.requireActual('@utils/share_logs'),
    shareLogs: jest.fn(),
    emailLogs: jest.fn(),
    getDefaultReportAProblemLink: jest.fn().mockReturnValue('default-link'),
}));

jest.mock('@utils/url', () => ({
    tryOpenURL: jest.fn(),
}));

jest.mock('@screens/navigation', () => ({
    popTopScreen: jest.fn(),
}));

// We mock the app logs to simplify the testing and avoid
// warnings about updating component state outside of an act
jest.mock('@screens/report_a_problem/app_logs', () => ({
    __esModule: true,
    default: jest.fn(),
}));
jest.mocked(AppLogs).mockImplementation(() => <View testID='app-logs'/>);

describe('screens/report_a_problem/report_problem', () => {
    const baseProps: ComponentProps<typeof ReportProblem> = {
        componentId: Screens.REPORT_PROBLEM,
        allowDownloadLogs: true,
        isLicensed: true,
        metadata: {
            currentUserId: 'user1',
            currentTeamId: 'team1',
            serverVersion: '7.8.0',
            appVersion: '2.0.0',
            appPlatform: 'ios',
        },
    };

    it('renders with logs section when allowDownloadLogs is true', () => {
        const {getByText, getByTestId, queryByText} = renderWithIntl(
            <ReportProblem {...baseProps}/>,
        );

        expect(getByText('Troubleshooting details')).toBeTruthy();
        expect(getByText('When reporting a problem, share the metadata and app logs given below to help troubleshoot your problem faster')).toBeTruthy();
        expect(getByTestId('app-logs')).toBeVisible();
        expect(queryByText('Report a problem')).toBeNull();
    });

    it('renders without logs section when allowDownloadLogs is false', () => {
        const props = {...baseProps, allowDownloadLogs: false};
        const {getByText, queryByTestId, queryByText} = renderWithIntl(
            <ReportProblem {...props}/>,
        );

        expect(getByText('When reporting a problem, share the metadata given below to help troubleshoot your problem faster')).toBeTruthy();
        expect(queryByTestId('app-logs')).not.toBeVisible();
        expect(queryByText('Report a problem')).toBeNull();
    });
});
