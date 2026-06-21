// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {fireEvent, render, screen, waitFor} from '@testing-library/react-native';
import React from 'react';
import {BackHandler} from 'react-native';
import {storeDarkModeSetting} from '@actions/app/global';
import {DARK_MODE_SETTING} from '@utils/theme/dark_mode';
import {popTopScreen} from '@screens/navigation';
import NavigationStore from '@store/navigation_store';
import {renderWithIntl} from '@test/intl-test-helper';

import DisplayTheme from './display_theme';

import type {AvailableScreens} from '@typings/screens/navigation';

jest.mock('@screens/navigation');
jest.mock('@store/navigation_store');
jest.mock('@queries/app/global', () => ({
    observeDarkModeSetting: jest.fn(() => require('rxjs').of(undefined)),
}));
jest.mock('@actions/app/global', () => ({
    storeDarkModeSetting: jest.fn(),
}));

jest.mock('@components/settings/container', () => {
    const React = require('react');
    const {View} = require('react-native');

    return ({children, testID}: {children: React.ReactNode; testID?: string}) => (
        <View testID={testID}>{children}</View>
    );
});

jest.mock('@components/settings/block', () => {
    const React = require('react');
    const {View} = require('react-native');

    return ({children}: {children: React.ReactNode}) => <View>{children}</View>;
});

jest.mock('@components/settings/option', () => {
    const React = require('react');
    const {Switch, Text, TouchableOpacity, View} = require('react-native');

    return ({
        action,
        description,
        label,
        selected,
        testID,
        type,
        value,
    }: {
        action?: (value: string | boolean) => void;
        description?: string;
        label: string;
        selected?: boolean;
        testID?: string;
        type: string;
        value?: string;
    }) => {
        if (type === 'toggle') {
            return (
                <View testID={testID}>
                    <Text>{label}</Text>
                    {description ? <Text>{description}</Text> : null}
                    <Switch
                        testID={`${testID}.toggled.${selected}.button`}
                        value={selected}
                        onValueChange={action}
                    />
                </View>
            );
        }

        return (
            <TouchableOpacity
                testID={testID}
                onPress={() => action?.(value || '')}
            >
                <Text>{label}</Text>
                {selected ? <View testID={`${testID}.selected`}/> : null}
            </TouchableOpacity>
        );
    };
});

const displayThemeOtherProps = {
    componentId: 'DisplayTheme' as AvailableScreens,
};

describe('DisplayTheme', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should render follow system toggle by default', () => {
        renderWithIntl(
            <DisplayTheme
                {...displayThemeOtherProps}
            />,
        );

        expect(screen.getByTestId('theme_display_settings.follow_system.option')).toBeTruthy();
        expect(screen.getByTestId('theme_display_settings.follow_system.option.toggled.true.button')).toBeTruthy();
        expect(screen.queryByTestId('theme_display_settings.light_mode.option')).toBeFalsy();
    });

    it('should save dark mode locally when dark mode is selected', async () => {
        const {observeDarkModeSetting} = require('@queries/app/global');
        observeDarkModeSetting.mockReturnValue(require('rxjs').of({value: DARK_MODE_SETTING.LIGHT}));

        renderWithIntl(
            <DisplayTheme
                {...displayThemeOtherProps}
            />,
        );

        fireEvent.press(screen.getByTestId('theme_display_settings.dark_mode.option'));

        await waitFor(() => {
            expect(storeDarkModeSetting).toHaveBeenCalledWith(DARK_MODE_SETTING.DARK);
        });
    });

    it('should save follow system locally when follow system is enabled', async () => {
        const {observeDarkModeSetting} = require('@queries/app/global');
        observeDarkModeSetting.mockReturnValue(require('rxjs').of({value: DARK_MODE_SETTING.DARK}));

        renderWithIntl(
            <DisplayTheme
                {...displayThemeOtherProps}
            />,
        );

        fireEvent(screen.getByTestId('theme_display_settings.follow_system.option.toggled.false.button'), 'valueChange', true);

        await waitFor(() => {
            expect(storeDarkModeSetting).toHaveBeenCalledWith(DARK_MODE_SETTING.SYSTEM);
        });
    });

    it('should call popTopScreen when Android back button is pressed', () => {
        (NavigationStore.getVisibleScreen as jest.Mock).mockReturnValue('DisplayTheme');
        const androidBackButtonHandler = jest.spyOn(BackHandler, 'addEventListener');

        renderWithIntl(
            <DisplayTheme
                {...displayThemeOtherProps}
            />,
        );

        androidBackButtonHandler.mock.calls[0][1]();

        expect(popTopScreen).toHaveBeenCalledTimes(1);
    });
});
