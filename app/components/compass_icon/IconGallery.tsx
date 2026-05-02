// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import fontelloConfig from '@mattermost/compass-icons/config.json';
import React, {useState} from 'react';
import {View, Text, StyleSheet, FlatList, Dimensions, TouchableOpacity, Clipboard, ToastAndroid, Platform} from 'react-native';

import CompassIcon from './index';

const {width} = Dimensions.get('window');
const numColumns = 4;
const itemSize = (width - 48) / numColumns;

// 从配置文件中提取所有图标名称
const iconNames = fontelloConfig.glyphs.map((glyph: any) => glyph.css);

interface IconItemProps {
    name: string;
}

const IconItem: React.FC<IconItemProps> = ({name}) => {
    const [isCopied, setIsCopied] = useState(false);

    const handleDoublePress = () => {
        Clipboard.setString(name);
        setIsCopied(true);

        // 显示复制成功的提示
        if (Platform.OS === 'android') {
            ToastAndroid.show('Copied to clipboard!', ToastAndroid.SHORT);
        }

        // 2秒后重置复制状态
        setTimeout(() => {
            setIsCopied(false);
        }, 2000);
    };

    return (
        <TouchableOpacity
            style={[styles.iconItem, isCopied && styles.copiedItem]}
            activeOpacity={0.7}
            onLongPress={handleDoublePress}
            delayLongPress={1000}
        >
            <CompassIcon
                name={name}
                size={32}
                color={isCopied ? '#4CAF50' : '#333'}
            />
            <Text
                style={[styles.iconName, isCopied && styles.copiedText]}
                numberOfLines={1}
            >
                {isCopied ? 'Copied!' : name}
            </Text>
        </TouchableOpacity>
    );
};

/**
 * IconGallery 组件 - 展示所有可用的 Compass 图标
 *
 * 功能：
 * - 以网格形式展示所有图标
 * - 支持垂直滚动
 * - 每个图标下方显示其名称
 *
 * 使用示例：
 * ```jsx
 * import { IconGallery } from '../components/compass_icon';
 *
 * <IconGallery />
 * ```
 */
const IconGallery: React.FC = () => {
    return (
        <View style={styles.container}>
            <Text style={styles.title}>{'Compass Icons Gallery'}</Text>
            <FlatList
                data={iconNames}
                renderItem={({item}) => <IconItem name={item}/>}
                keyExtractor={(item) => item}
                numColumns={numColumns}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={true}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        padding: 16,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    listContent: {
        padding: 8,
        paddingBottom: 24,
    },
    iconItem: {
        width: itemSize,
        height: itemSize + 30,
        margin: 4,
        backgroundColor: '#fff',
        borderRadius: 8,
        padding: 8,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 1,
        },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    copiedItem: {
        backgroundColor: '#E8F5E9',
        borderWidth: 1,
        borderColor: '#4CAF50',
    },
    iconName: {
        fontSize: 12,
        marginTop: 8,
        textAlign: 'center',
        color: '#666',
        width: '100%',
    },
    copiedText: {
        color: '#4CAF50',
        fontWeight: 'bold',
    },
});

export default IconGallery;
