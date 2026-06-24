// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {useIntl} from 'react-intl';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import CompassIcon from '@components/compass_icon';
import {type PlusMenuEntry, type PlusMenuItem, usePlusMenu} from '@context/plus_menu';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

const ITEM_HEIGHT = 44;
const SEPARATOR_HEIGHT = 1;
const MENU_PADDING = 8;
const OVERLAY_Z_INDEX = 2000;

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        zIndex: OVERLAY_Z_INDEX,
    },
    anchor: {
        position: 'absolute',
        alignItems: 'flex-end',
        zIndex: OVERLAY_Z_INDEX + 1,
    },
    menu: {
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

export default function PlusMenuOverlay() {
    const intl = useIntl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const {visible, anchorLeft, anchorWidth, anchorTop, items, closePlusMenu} = usePlusMenu();

    if (!visible) {
        return null;
    }

    return (
        <>
            <Pressable
                style={styles.backdrop}
                onPress={closePlusMenu}
            />
            <View
                pointerEvents='box-none'
                style={[
                    styles.anchor,
                    {
                        left: anchorLeft,
                        width: anchorWidth,
                        top: anchorTop,
                    },
                ]}
            >
                <View style={styles.menu}>
                    {items.map((entry, index) => {
                        if ('type' in entry && entry.type === 'separator') {
                            return <View key={`sep-${index}`} style={styles.separator}/>;
                        }
                        const item = entry as PlusMenuItem;
                        return (
                            <Pressable
                                key={item.testID}
                                style={styles.item}
                                onPress={() => {
                                    closePlusMenu();
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
                            </Pressable>
                        );
                    })}
                </View>
            </View>
        </>
    );
}
