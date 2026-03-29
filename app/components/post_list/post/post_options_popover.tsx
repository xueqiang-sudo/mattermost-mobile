// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useMemo, useState} from 'react';
import {Dimensions, type LayoutChangeEvent, Platform, Pressable, StyleSheet, Text, View} from 'react-native';

import CompassIcon from '@components/compass_icon';
import {typography} from '@utils/typography';

type PopoverItem = {
    key: string;
    label: string;
    iconName: string;
    destructive?: boolean;
    onPress: () => void;
};

type Props = {
    x: number;
    y: number;
    onClose: () => void;
    items: PopoverItem[];
};

const SCREEN_PADDING = 8;
const GAP_FROM_ANCHOR = 6;
const ARROW_W = 14;
const ARROW_H = 7;
const ICON_COL_W = 36;
const ROW_PADDING_V = 12;
const ROW_PADDING_H = 14;
const MIN_MENU_WIDTH = 120;
const ESTIMATED_ROW = 48;

/** WeChat-style dark action sheet; readable on both light and dark chat backgrounds */
const popoverColors = {
    surface: 'rgba(55, 55, 55, 0.96)',
    label: '#F2F2F2',
    icon: 'rgba(255, 255, 255, 0.92)',
    rowPressed: 'rgba(255, 255, 255, 0.1)',
    destructive: '#FF8A8A',
    shadow: '#000',
};

const styles = StyleSheet.create({
    backdrop: {
        ...Dimensions.get('window'),
    },
    wrapper: {
        position: 'absolute',
        alignItems: 'flex-start',
    },
    arrowRow: {
        justifyContent: 'flex-start',
    },
    menu: {
        borderRadius: 8,
        overflow: 'hidden',
        minWidth: MIN_MENU_WIDTH,
        maxWidth: Dimensions.get('window').width - SCREEN_PADDING * 2,
        ...Platform.select({
            ios: {
                shadowColor: popoverColors.shadow,
                shadowOffset: {width: 0, height: 4},
                shadowOpacity: 0.25,
                shadowRadius: 8,
            },
            default: {
                elevation: 8,
            },
        }),
    },
    menuInner: {
        backgroundColor: popoverColors.surface,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: ROW_PADDING_V,
        paddingHorizontal: ROW_PADDING_H,
    },
    rowPressed: {
        backgroundColor: popoverColors.rowPressed,
    },
    rowDivider: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(255,255,255,0.12)',
    },
    iconWrap: {
        width: ICON_COL_W,
        alignItems: 'center',
        justifyContent: 'center',
    },
    label: {
        flex: 1,
        color: popoverColors.label,
        ...typography('Body', 100),
    },
    destructiveLabel: {
        color: popoverColors.destructive,
    },
    arrowDown: {
        width: 0,
        height: 0,
        borderLeftWidth: ARROW_W / 2,
        borderRightWidth: ARROW_W / 2,
        borderTopWidth: ARROW_H,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderTopColor: popoverColors.surface,
        marginTop: -1,
    },
    arrowUp: {
        width: 0,
        height: 0,
        borderLeftWidth: ARROW_W / 2,
        borderRightWidth: ARROW_W / 2,
        borderBottomWidth: ARROW_H,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderBottomColor: popoverColors.surface,
        marginBottom: -1,
    },
});

export default function PostOptionsPopover({x, y, onClose, items}: Props) {
    const [menuW, setMenuW] = useState(0);
    const [menuH, setMenuH] = useState(0);

    const onMenuLayout = useCallback((e: LayoutChangeEvent) => {
        const {width, height} = e.nativeEvent.layout;
        if (width !== menuW) {
            setMenuW(width);
        }
        if (height !== menuH) {
            setMenuH(height);
        }
    }, [menuW, menuH]);

    const {width: screenW, height: screenH} = Dimensions.get('window');

    const layout = useMemo(() => {
        const w = menuW > 0 ? menuW : MIN_MENU_WIDTH;
        const h = menuH > 0 ? menuH : items.length * ESTIMATED_ROW;
        const left = Math.min(
            Math.max(x - w / 2, SCREEN_PADDING),
            screenW - w - SCREEN_PADDING,
        );

        const spaceAbove = y - SCREEN_PADDING;
        const spaceBelow = screenH - y - SCREEN_PADDING;
        const totalH = h + ARROW_H + GAP_FROM_ANCHOR;
        const preferAbove = spaceAbove >= totalH || spaceAbove >= spaceBelow;

        let top: number;
        let arrowBelowMenu: boolean;
        if (preferAbove && spaceAbove >= totalH) {
            top = y - GAP_FROM_ANCHOR - ARROW_H - h;
            arrowBelowMenu = true;
        } else {
            top = y + GAP_FROM_ANCHOR + ARROW_H;
            arrowBelowMenu = false;
        }

        top = Math.min(Math.max(top, SCREEN_PADDING), screenH - h - ARROW_H - SCREEN_PADDING);

        const arrowOffset = Math.min(
            Math.max(x - left - ARROW_W / 2, 8),
            w - ARROW_W - 8,
        );

        return {left, top, arrowOffset, arrowBelowMenu, w, h};
    }, [x, y, menuW, menuH, items.length, screenW, screenH]);

    return (
        <Pressable
            style={styles.backdrop}
            onPress={onClose}
            testID='post.options.popover.backdrop'
        >
            <View
                style={[
                    styles.wrapper,
                    {
                        left: layout.left,
                        top: layout.top,
                    },
                ]}
                pointerEvents='box-none'
            >
                {!layout.arrowBelowMenu && (
                    <View style={[styles.arrowRow, {width: layout.w, paddingLeft: layout.arrowOffset}]}>
                        <View style={styles.arrowUp}/>
                    </View>
                )}
                <Pressable
                    onPress={() => null}
                    testID='post.options.popover.menu'
                >
                    <View
                        style={styles.menu}
                        onLayout={onMenuLayout}
                    >
                        <View style={styles.menuInner}>
                            {items.map((item, index) => (
                                <Pressable
                                    key={item.key}
                                    style={({pressed}) => [
                                        styles.row,
                                        index < items.length - 1 && styles.rowDivider,
                                        pressed && styles.rowPressed,
                                    ]}
                                    onPress={item.onPress}
                                    testID={`post.options.popover.item.${item.key}`}
                                >
                                    <View style={styles.iconWrap}>
                                        <CompassIcon
                                            name={item.iconName}
                                            size={20}
                                            style={{color: item.destructive ? popoverColors.destructive : popoverColors.icon}}
                                        />
                                    </View>
                                    <Text
                                        style={[styles.label, item.destructive && styles.destructiveLabel]}
                                        numberOfLines={2}
                                    >
                                        {item.label}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>
                    </View>
                </Pressable>
                {layout.arrowBelowMenu && (
                    <View style={[styles.arrowRow, {width: layout.w, paddingLeft: layout.arrowOffset}]}>
                        <View style={styles.arrowDown}/>
                    </View>
                )}
            </View>
        </Pressable>
    );
}
