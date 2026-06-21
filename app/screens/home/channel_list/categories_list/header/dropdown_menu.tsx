// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {useIntl} from 'react-intl';
import {Modal, StyleSheet, Text, TouchableOpacity, View} from 'react-native';

import CompassIcon from '@components/compass_icon';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

export type MenuItem = {
    icon: string;
    labelId: string;
    defaultLabel: string;
    onPress: () => void;
    testID: string;
};

export type MenuSeparator = {
    type: 'separator';
};

export type MenuEntry = MenuItem | MenuSeparator;

type Props = {
    visible: boolean;
    anchorRight: number;
    anchorTop: number;
    items: MenuEntry[];
    onClose: () => void;
}

const ITEM_HEIGHT = 44;
const SEPARATOR_HEIGHT = 1;
const MENU_PADDING = 8;

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    overlay: {
        flex: 1,
    },
    menu: {
        position: 'absolute',
        backgroundColor: theme.centerChannelBg,
        borderRadius: 8,
        paddingVertical: MENU_PADDING,
        minWidth: 160,
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 8,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        height: ITEM_HEIGHT,
    },
    itemIcon: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginRight: 12,
    },
    itemLabel: {
        flex: 1,
        color: theme.centerChannelColor,
        ...typography('Body', 200),
    },
    separator: {
        height: SEPARATOR_HEIGHT,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        marginVertical: 4,
        marginHorizontal: 12,
    },
}));

const DropdownMenu = ({visible, anchorRight, anchorTop, items, onClose}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);

    if (!visible) {
        return null;
    }

    const menuStyle = [
        styles.menu,
        {
            right: anchorRight,
            top: anchorTop,
        },
    ];

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType='fade'
            onRequestClose={onClose}
            statusBarTranslucent={true}
        >
            <TouchableOpacity
                style={styles.overlay}
                activeOpacity={1}
                onPress={onClose}
            >
                <View style={menuStyle}>
                    {items.map((entry, index) => {
                        if ('type' in entry && entry.type === 'separator') {
                            return <View key={`sep-${index}`} style={styles.separator}/>;
                        }
                        const item = entry as MenuItem;
                        return (
                            <TouchableOpacity
                                key={item.testID}
                                style={styles.item}
                                onPress={() => {
                                    onClose();
                                    item.onPress();
                                }}
                                testID={item.testID}
                            >
                                <CompassIcon
                                    name={item.icon}
                                    size={20}
                                    style={styles.itemIcon}
                                />
                                <Text style={styles.itemLabel}>
                                    {intl.formatMessage({id: item.labelId, defaultMessage: item.defaultLabel})}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </TouchableOpacity>
        </Modal>
    );
};

export default DropdownMenu;
