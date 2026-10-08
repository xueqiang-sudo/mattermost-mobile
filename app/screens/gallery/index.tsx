// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import RNUtils from '@mattermost/rnutils';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Alert, DeviceEventEmitter, Platform, View} from 'react-native';
import {initialWindowMetrics, useSafeAreaInsets} from 'react-native-safe-area-context';

import {Events} from '@constants';
import {ANDROID_GALLERY_FOOTER_PADDING, ANDROID_NAV_BAR_HEIGHT} from '@constants/gallery';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import {useIsTablet, useWindowDimensions} from '@hooks/device';
import {useGalleryControls} from '@hooks/gallery';
import SecurityManager from '@managers/security_manager';
import {debugLog} from '@store/debug_log';
import {dismissOverlay, setScreensOrientation} from '@screens/navigation';
import {freezeOtherScreens} from '@utils/gallery';

import Footer from './footer';
import Gallery, {type GalleryRef} from './gallery';
import Header from './header';

import type {GalleryItemType} from '@typings/screens/gallery';
import type {AvailableScreens} from '@typings/screens/navigation';

type Props = {
    componentId: AvailableScreens;
    galleryIdentifier: string;
    hideActions: boolean;
    initialIndex: number;
    items: GalleryItemType[];
}

const GalleryScreen = ({componentId, galleryIdentifier, hideActions, initialIndex, items}: Props) => {
    Alert.alert('Step 6.0', `GalleryScreen 函数开始`);

    // 验证 props
    if (!items) {
        Alert.alert('ERROR', `items is undefined!`);
        return null;
    }

    Alert.alert('Step 6.1', `props OK: idx=${initialIndex} items=${items.length}`);
    Alert.alert('Step 6', `GalleryScreen render idx=${initialIndex}`);
    debugLog('GALLERY', `Screen render: id=${galleryIdentifier} idx=${initialIndex} items=${items?.length}`);
    const dim = useWindowDimensions();
    const isTablet = useIsTablet();
    const {bottom: bottomInset} = useSafeAreaInsets();
    const [localIndex, setLocalIndex] = useState(initialIndex);

    // Fallback for Android when SafeAreaContext returns 0 in overlays
    const androidBottom = (initialWindowMetrics?.insets.bottom || ANDROID_NAV_BAR_HEIGHT) + ANDROID_GALLERY_FOOTER_PADDING;
    const bottom = bottomInset || Platform.select({android: androidBottom, default: 0});
    const {headerAndFooterHidden, hideHeaderAndFooter, headerStyles, footerStyles} = useGalleryControls(bottom);
    const galleryRef = useRef<GalleryRef>(null);

    const containerStyle = dim;

    const onClose = useCallback(() => {
        debugLog('GALLERY', 'onClose: unfreezing, starting close animation');
        // We keep the un freeze here as we want
        // the screen to be visible when the gallery
        // starts to dismiss as the hanlder for shouldHandleEvent
        // of the lightbox is not called
        freezeOtherScreens(false);
        requestAnimationFrame(() => {
            debugLog('GALLERY', 'onClose: calling galleryRef.close()');
            galleryRef.current?.close();
        });
    }, []);

    const close = useCallback(() => {
        debugLog('GALLERY', 'close: dismissing overlay');
        setScreensOrientation(isTablet);
        if (Platform.OS === 'ios' && !isTablet) {
            // We need both the navigation & the module
            RNUtils.lockPortrait();
        }
        freezeOtherScreens(false);
        requestAnimationFrame(async () => {
            debugLog('GALLERY', 'close: calling dismissOverlay');
            dismissOverlay(componentId);
        });
    }, [componentId, isTablet]);

    const onIndexChange = useCallback((index: number) => {
        setLocalIndex(index);
    }, []);

    useEffect(() => {
        const listener = DeviceEventEmitter.addListener(Events.CLOSE_GALLERY, () => {
            onClose();
        });

        if (Platform.OS === 'android' && Platform.Version >= 34) {
            RNUtils.setNavigationBarColor('black', true);
        }

        return () => {
            listener.remove();
        };
    }, [onClose]);

    useAndroidHardwareBackHandler(componentId, close);

    return (
        <View
            style={containerStyle}
            nativeID={SecurityManager.getShieldScreenId(componentId)}
        >
            <Header
                fileType={items[localIndex]?.type}
                onClose={onClose}
                style={headerStyles}
            />
            <Gallery
                headerAndFooterHidden={headerAndFooterHidden}
                galleryIdentifier={galleryIdentifier}
                initialIndex={initialIndex}
                items={items}
                onHide={close}
                onIndexChange={onIndexChange}
                hideHeaderAndFooter={hideHeaderAndFooter}
                onClose={onClose}
                ref={galleryRef}
                targetDimensions={dim}
            />
            <Footer
                componentId={componentId}
                hideActions={hideActions}
                item={items[localIndex]}
                style={footerStyles}
            />
        </View>
    );
};

export default GalleryScreen;
