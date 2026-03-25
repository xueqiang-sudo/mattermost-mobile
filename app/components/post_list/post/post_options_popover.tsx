// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useMemo} from 'react';
import {Dimensions, Pressable, Text, View} from 'react-native';

import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

type PopoverItem = {
    key: string;
    label: string;
    destructive?: boolean;
    onPress: () => void;
};

type Props = {
    x: number;
    y: number;
    theme: Theme;
    onClose: () => void;
    items: PopoverItem[];
};

const MENU_WIDTH = 220;
const SCREEN_PADDING = 8;
const ITEM_HEIGHT = 44;

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    backdrop: {
        ...Dimensions.get('window'),
    },
    menu: {
        position: 'absolute',
        width: MENU_WIDTH,
        backgroundColor: theme.centerChannelBg,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        overflow: 'hidden',
        elevation: 6,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 10,
        shadowOffset: {width: 0, height: 4},
    },
    item: {
        height: ITEM_HEIGHT,
        paddingHorizontal: 14,
        justifyContent: 'center',
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    itemLast: {
        borderBottomWidth: 0,
    },
    label: {
        color: theme.centerChannelColor,
        ...typography('Body', 200),
    },
    destructiveLabel: {
        color: theme.dndIndicator,
    },
}));

export default function PostOptionsPopover({x, y, theme, onClose, items}: Props) {
    const style = getStyleSheet(theme);

    const position = useMemo(() => {
        const {width, height} = Dimensions.get('window');
        const menuHeight = Math.max(1, items.length) * ITEM_HEIGHT;
        const left = Math.min(Math.max(x - (MENU_WIDTH / 2), SCREEN_PADDING), width - MENU_WIDTH - SCREEN_PADDING);
        const preferTop = y - menuHeight - 12;
        const top = preferTop >= SCREEN_PADDING ? preferTop : Math.min(y + 12, height - menuHeight - SCREEN_PADDING);
        return {left, top};
    }, [x, y, items.length]);

    return (
        <Pressable
            style={style.backdrop}
            onPress={onClose}
            testID='post.options.popover.backdrop'
        >
            <Pressable
                style={[style.menu, position]}
                onPress={() => null}
                testID='post.options.popover.menu'
            >
                {items.map((item, index) => (
                    <Pressable
                        key={item.key}
                        style={[style.item, index === items.length - 1 && style.itemLast]}
                        onPress={item.onPress}
                        testID={`post.options.popover.item.${item.key}`}
                    >
                        <Text style={[style.label, item.destructive && style.destructiveLabel]}>
                            {item.label}
                        </Text>
                    </Pressable>
                ))}
            </Pressable>
        </Pressable>
    );
}
