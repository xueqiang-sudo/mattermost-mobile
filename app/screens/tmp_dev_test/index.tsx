// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {DefaultTheme, NavigationContainer} from '@react-navigation/native';
import {createStackNavigator} from '@react-navigation/stack';
import {useCallback} from 'react';
import {Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {Screens} from '@constants';
import {getDefaultThemeByAppearance} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import SecurityManager from '@managers/security_manager';
import ContactsScreen from '@screens/home/contacts/contacts';
import {dismissModal} from '@screens/navigation';
import {makeStyleSheetFromTheme} from '@utils/theme';

import type {AvailableScreens} from '@typings/screens/navigation';

type Props = {
    componentId: AvailableScreens;
    closeButtonId?: string;
    theme?: Theme;
}

const Stack = createStackNavigator();

// const SearchPlaceholder = () => (
//     <View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}>
//         <Text>{'Search (placeholder for TmpDevTest)'}</Text>
//     </View>
// );

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    content: {
        flexGrow: 1,
        padding: 20,
    },
    title: {
        color: theme.centerChannelColor,
        fontSize: 20,
        fontWeight: '600',
        marginBottom: 16,
    },
    text: {
        color: theme.centerChannelColor,
        fontSize: 16,
        lineHeight: 24,
        marginBottom: 8,
    },
}));

const TmpDevTest = ({componentId, closeButtonId, theme: themeProp}: Props) => {
    const theme = themeProp ?? getDefaultThemeByAppearance();
    const styles = getStyleSheet(theme);

    const onClosePressed = useCallback(() => {
        return dismissModal({componentId});
    }, [componentId]);

    useNavButtonPressed(closeButtonId ?? 'close.tmp_dev_test', componentId, onClosePressed, []);
    useAndroidHardwareBackHandler(componentId, onClosePressed);

    const navTheme = {
        ...DefaultTheme,
        dark: false,
        colors: {
            ...DefaultTheme.colors,
            primary: theme.centerChannelColor,
            background: 'transparent',
            card: theme.centerChannelBg,
            text: theme.centerChannelColor,
            border: 'white',
            notification: theme.mentionHighlightBg,
        },
    };

    return (
        <SafeAreaView
            edges={['top', 'bottom', 'left', 'right']}
            style={styles.container}
            nativeID={SecurityManager.getShieldScreenId(componentId)}
        >
            <NavigationContainer theme={navTheme}>
                <Stack.Navigator screenOptions={{headerShown: false}}>
                    <Stack.Screen
                        name={Screens.CONTACTS}
                    >{() => <ContactsScreen currentTeamId='tmpteam1001'/>}</Stack.Screen>
                    {/* <Stack.Screen
                        name={Screens.SEARCH}
                        component={SearchPlaceholder}
                    /> */}
                </Stack.Navigator>
            </NavigationContainer>
        </SafeAreaView>
    );
};

export default TmpDevTest;
