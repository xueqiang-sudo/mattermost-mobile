// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {type ComponentType, createContext, useEffect, useState} from 'react';
import {Appearance} from 'react-native';

import {Preferences} from '@constants';
import {observeDarkModeSetting} from '@queries/app/global';
import {
    DARK_MODE_SETTING,
    getThemeForDarkModeSetting,
    parseStoredDarkModeSetting,
    type DarkModeSetting,
} from '@utils/theme/dark_mode';
import {updateThemeIfNeeded} from '@utils/theme';

type Props = {
    children: React.ReactNode;
}

type WithThemeProps = {
    theme: Theme;
}

export function getDefaultThemeByAppearance(): Theme {
    if (Appearance.getColorScheme() === 'dark') {
        return Preferences.THEMES.onyx;
    }
    return Preferences.THEMES.quartz;
}

export function resolveThemeFromDarkModeSetting(setting: DarkModeSetting): Theme {
    const presetTheme = getThemeForDarkModeSetting(setting);
    if (presetTheme) {
        return presetTheme;
    }

    return getDefaultThemeByAppearance();
}

export const ThemeContext = createContext(getDefaultThemeByAppearance());
const {Consumer, Provider} = ThemeContext;

const ThemeProvider = ({children}: Props) => {
    const [darkModeSetting, setDarkModeSetting] = useState<DarkModeSetting>(DARK_MODE_SETTING.SYSTEM);
    const [theme, setTheme] = useState(() => resolveThemeFromDarkModeSetting(DARK_MODE_SETTING.SYSTEM));

    useEffect(() => {
        const subscription = observeDarkModeSetting().subscribe((record) => {
            const setting = parseStoredDarkModeSetting(record?.value);
            setDarkModeSetting(setting);
            setTheme(resolveThemeFromDarkModeSetting(setting));
        });

        return () => subscription.unsubscribe();
    }, []);

    useEffect(() => {
        if (darkModeSetting !== DARK_MODE_SETTING.SYSTEM) {
            return undefined;
        }

        const listener = Appearance.addChangeListener(() => {
            setTheme(getDefaultThemeByAppearance());
        });

        return () => listener.remove();
    }, [darkModeSetting]);

    useEffect(() => {
        updateThemeIfNeeded(theme);
    }, [theme]);

    return (<Provider value={theme}>{children}</Provider>);
};

export const CustomThemeProvider = ({theme, children}: {theme: Theme; children: React.ReactNode}) => {
    return (<Provider value={theme}>{children}</Provider>);
};

export function withTheme<T extends WithThemeProps>(Component: ComponentType<T>): ComponentType<T> {
    return function ThemeComponent(props) {
        return (
            <Consumer>
                {(theme: Theme) => (
                    <Component
                        {...props}
                        theme={theme}
                    />
                )}
            </Consumer>
        );
    };
}

export function useTheme(): Theme {
    return React.useContext(ThemeContext);
}

export default ThemeProvider;
