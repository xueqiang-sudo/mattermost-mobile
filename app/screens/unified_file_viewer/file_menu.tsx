// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import CompassIcon from '@components/compass_icon';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

type MenuAction = 'forward' | 'save' | 'openWith' | 'favorite' | 'delete';

type FileMenuProps = {
    fileInfo: FileInfo;
    onAction: (action: MenuAction) => void;
    onClose: () => void;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        backgroundColor: theme.centerChannelBg,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        paddingTop: 8,
    },
    handle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.24),
        alignSelf: 'center',
        marginBottom: 8,
    },
    menuGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-around',
        paddingVertical: 24,
        paddingHorizontal: 16,
    },
    menuItem: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 80,
        marginVertical: 12,
    },
    iconContainer: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    label: {
        ...typography('Body', 75, 'Regular'),
        color: theme.centerChannelColor,
        textAlign: 'center',
    },
}));

const FileMenu = ({fileInfo, onAction, onClose}: FileMenuProps) => {
    const theme = useTheme();
    const intl = useIntl();
    const styles = getStyleSheet(theme);

    const menuItems = [
        {
            icon: 'share-variant',
            label: intl.formatMessage({
                id: 'file_viewer.menu.forward',
                defaultMessage: 'Forward',
            }),
            action: 'forward' as MenuAction,
        },
        {
            icon: 'download',
            label: intl.formatMessage({
                id: 'file_viewer.menu.save',
                defaultMessage: 'Save',
            }),
            action: 'save' as MenuAction,
        },
        {
            icon: 'open-in-new',
            label: intl.formatMessage({
                id: 'file_viewer.menu.open_with',
                defaultMessage: 'Open with',
            }),
            action: 'openWith' as MenuAction,
        },
        {
            icon: 'star-outline',
            label: intl.formatMessage({
                id: 'file_viewer.menu.favorite',
                defaultMessage: 'Favorite',
            }),
            action: 'favorite' as MenuAction,
        },
        {
            icon: 'trash-can-outline',
            label: intl.formatMessage({
                id: 'file_viewer.menu.delete',
                defaultMessage: 'Delete',
            }),
            action: 'delete' as MenuAction,
        },
    ];

    const handleAction = useCallback((action: MenuAction) => {
        onAction(action);
        onClose();
    }, [onAction, onClose]);

    return (
        <View style={styles.container}>
            <View style={styles.handle}/>
            <View style={styles.menuGrid}>
                {menuItems.map((item) => (
                    <Pressable
                        key={item.action}
                        style={styles.menuItem}
                        onPress={() => handleAction(item.action)}
                    >
                        <View style={styles.iconContainer}>
                            <CompassIcon
                                name={item.icon}
                                size={28}
                                color={theme.centerChannelColor}
                            />
                        </View>
                        <Text style={styles.label}>{item.label}</Text>
                    </Pressable>
                ))}
            </View>
        </View>
    );
};

export default FileMenu;
