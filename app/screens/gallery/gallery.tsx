// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState} from 'react';
import {Alert, BackHandler} from 'react-native';
import {runOnJS, runOnUI, useAnimatedReaction, type SharedValue} from 'react-native-reanimated';

import {buildFilePreviewUrl} from '@actions/remote/file';
import {ExpoImageAnimated} from '@components/expo_image';
import {useGallery} from '@context/gallery';
import {useServerUrl} from '@context/server';
import {debugLog} from '@store/debug_log';
import {isGif} from '@utils/file';
import {freezeOtherScreens, galleryItemToFileInfo, measureItem} from '@utils/gallery';

import LightboxSwipeout, {type LightboxSwipeoutRef, type RenderItemInfo} from './lightbox_swipeout';
import Backdrop, {type BackdropProps} from './lightbox_swipeout/backdrop';
import DocumentRenderer from './renderers/document';
import VideoRenderer from './renderers/video';
import GalleryViewer from './viewer';

import type {GalleryItemType, GalleryPagerItem} from '@typings/screens/gallery';

interface GalleryProps {
    headerAndFooterHidden: SharedValue<boolean>;
    galleryIdentifier: string;
    initialIndex: number;
    items: GalleryItemType[];
    onIndexChange?: (index: number) => void;
    onHide: () => void;
    targetDimensions: { width: number; height: number };
    hideHeaderAndFooter: (hide: boolean) => void;
    onClose?: () => void;
}

export interface GalleryRef {
    close: () => void;
}

const Gallery = forwardRef<GalleryRef, GalleryProps>(({
    headerAndFooterHidden,
    galleryIdentifier,
    initialIndex,
    items,
    onHide,
    targetDimensions,
    hideHeaderAndFooter,
    onIndexChange,
    onClose,
}: GalleryProps, ref) => {
    Alert.alert('Step 7', `Gallery render idx=${initialIndex} items=${items?.length}`);
    debugLog('GALLERY', `Gallery render: id=${galleryIdentifier} idx=${initialIndex} items=${items.length}`);

    // 防御性检查
    if (!items || items.length === 0) {
        Alert.alert('ERROR', `items is empty!`);
        return null;
    }

    const {refsByIndexSV, sharedValues} = useGallery(galleryIdentifier);
    const [localIndex, setLocalIndex] = useState(initialIndex);
    const lightboxRef = useRef<LightboxSwipeoutRef>(null);
    const item = items[localIndex];

    // 检查 item 是否存在
    if (!item) {
        Alert.alert('ERROR', `item is undefined! idx=${localIndex} len=${items.length}`);
        return null;
    }

    Alert.alert('Step 7.1', `item OK: ${item.type} ${item.width}x${item.height}`);

    const fileInfo = useMemo(() => galleryItemToFileInfo(item), [item]);
    const serverUrl = useServerUrl();

    const close = () => {
        debugLog('GALLERY', 'close() called, calling closeLightbox');
        lightboxRef.current?.closeLightbox();
    };

    const onLocalIndex = useCallback((index: number) => {
        setLocalIndex(index);
        onIndexChange?.(index);
    }, [onIndexChange]);

    useEffect(() => {
        if (!item || !item.width || !item.height) {
            Alert.alert('ERROR', `useEffect: item invalid! w=${item?.width} h=${item?.height}`);
            return;
        }
        // 在 JS 线程捕获值，避免 UI 线程访问 JS 对象
        const itemWidth = item.width;
        const itemHeight = item.height;

        runOnUI(() => {
            'worklet';

            const tw = targetDimensions.width;
            sharedValues.targetWidth.value = tw;
            const scaleFactor = itemWidth / targetDimensions.width;
            const th = itemHeight / scaleFactor;
            sharedValues.targetHeight.value = th;
        })();

        // sharedValues do not trigger re-renders
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [item, targetDimensions.width]);

    useEffect(() => {
        const listener = BackHandler.addEventListener('hardwareBackPress', () => {
            lightboxRef.current?.closeLightbox();
            return true;
        });

        return () => listener.remove();
    }, []);

    useImperativeHandle(ref, () => ({
        close,
    }));

    useAnimatedReaction(
        () => {
            return sharedValues.activeIndex.value;
        },
        (index) => {
            const galleryItems = refsByIndexSV.value;

            if (index > -1 && galleryItems[index] && items[index].type !== 'file') {
                measureItem(galleryItems[index].ref, sharedValues);
            }
        },
    );

    const onIndexChangeWorklet = useCallback((nextIndex: number) => {
        'worklet';

        runOnJS(onLocalIndex)(nextIndex);
        sharedValues.activeIndex.value = nextIndex;

        // sharedValues do not trigger re-renders
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onLocalIndex]);

    const renderBackdropComponent = useCallback(
        ({animatedStyles, translateY}: BackdropProps) => {
            return (
                <Backdrop
                    animatedStyles={animatedStyles}
                    translateY={translateY}
                />
            );
        },
        [],
    );

    function onSwipeActive(translateY: number) {
        'worklet';
    }

    function onSwipeFailure() {
        'worklet';

        runOnJS(freezeOtherScreens)(true);
    }

    const hideLightboxItem = useCallback(() => {
        'worklet';

        runOnJS(debugLog)('GALLERY', 'hideLightboxItem: resetting shared values');
        sharedValues.width.value = 0;
        sharedValues.height.value = 0;
        sharedValues.opacity.value = 1;
        sharedValues.activeIndex.value = -1;
        sharedValues.x.value = 0;
        sharedValues.y.value = 0;

        runOnJS(debugLog)('GALLERY', 'hideLightboxItem: calling onHide (dismiss overlay)');
        runOnJS(onHide)();

        // sharedValues do not trigger re-renders
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onRenderItem = useCallback((info: RenderItemInfo) => {
        const currentItem = items[localIndex];
        if (currentItem.type === 'video' && currentItem.posterUri) {
            return (
                <ExpoImageAnimated
                    id={currentItem.cacheKey}
                    source={{uri: currentItem.posterUri}}
                    style={info.itemStyles}
                    placeholderContentFit='cover'
                />
            );
        }

        return null;
    }, [items, localIndex]);

    const onRenderPage = useCallback((props: GalleryPagerItem, idx: number) => {
        switch (props.item.type) {
            case 'video':
                return (
                    <VideoRenderer
                        {...props}
                        index={idx}
                        initialIndex={initialIndex}
                        hideHeaderAndFooter={hideHeaderAndFooter}
                    />
                );
            case 'file':
                return (
                    <DocumentRenderer
                        item={props.item}
                        hideHeaderAndFooter={hideHeaderAndFooter}
                    />
                );
            default:
                return null;
        }
    }, [hideHeaderAndFooter, initialIndex]);

    const source = useMemo(() => {
        if (isGif(fileInfo) && fileInfo.id && !fileInfo.id.startsWith('uid')) {
            return buildFilePreviewUrl(serverUrl, fileInfo.id);
        }

        return fileInfo.localPath || fileInfo.uri || item.uri;
    }, [fileInfo, item.uri, serverUrl]);

    Alert.alert('Step 7.2', `准备渲染 LightboxSwipeout`);

    return (
        <LightboxSwipeout
            headerAndFooterHidden={headerAndFooterHidden}
            ref={lightboxRef}
            target={item}
            onAnimationFinished={hideLightboxItem}
            sharedValues={sharedValues}
            source={source}
            onSwipeActive={onSwipeActive}
            onSwipeFailure={onSwipeFailure}
            renderBackdropComponent={renderBackdropComponent}
            targetDimensions={targetDimensions}
            renderItem={onRenderItem}
        >
            <GalleryViewer
                items={items}
                onIndexChange={onIndexChangeWorklet}
                onClose={onClose}
                height={targetDimensions.height}
                width={targetDimensions.width}
                initialIndex={initialIndex}
                numToRender={5}
                renderPage={onRenderPage}
            />
        </LightboxSwipeout>
    );
});

Gallery.displayName = 'Gallery';

export default Gallery;
