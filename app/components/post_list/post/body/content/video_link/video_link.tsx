// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';

import CompassIcon from '@components/compass_icon';
import {ExpoImageBackground} from '@components/expo_image';
import {Screens} from '@constants';
import {useIsTablet} from '@hooks/device';
import {showOverlay} from '@screens/navigation';
import {calculateDimensions, getViewPortWidth} from '@utils/images';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {tryOpenURL} from '@utils/url';
import {onOpenLinkError} from '@utils/url/links';
import {useIntl} from 'react-intl';

type VideoLinkProps = {
    isReplyPost: boolean;
    layoutWidth?: number;
    metadata: PostMetadata | undefined | null;
    theme: Theme;
};

const MAX_IMAGE_HEIGHT = 280;
const MAX_IMAGE_WIDTH = 500;

const getStyles = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        borderRadius: 6,
        marginBottom: 6,
        marginTop: 10,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
    },
    imageContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: changeOpacity('#000', 0.24),
    },
    playIcon: {
        backgroundColor: 'rgba(0,0,0,0.6)',
        borderRadius: 28,
        width: 56,
        height: 56,
        alignItems: 'center',
        justifyContent: 'center',
    },
    infoContainer: {
        padding: 10,
        backgroundColor: theme.centerChannelBg,
    },
    title: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.centerChannelColor,
        marginBottom: 4,
    },
    siteName: {
        fontSize: 12,
        color: changeOpacity(theme.centerChannelColor, 0.56),
    },
}));

const VideoLink = ({isReplyPost, layoutWidth, metadata, theme}: VideoLinkProps) => {
    const intl = useIntl();
    const isTablet = useIsTablet();
    const styles = getStyles(theme);

    const embed = metadata?.embeds?.[0];
    const link = embed?.url;
    const data = embed?.data as Record<string, any> | undefined;

    const dimensions = calculateDimensions(
        MAX_IMAGE_HEIGHT,
        MAX_IMAGE_WIDTH,
        layoutWidth || (getViewPortWidth(isReplyPost, isTablet) - 6),
    );

    // Get thumbnail from OpenGraph images
    let imgUrl: string | undefined;
    if (data?.images?.[0]?.url) {
        imgUrl = data.images[0].url;
    } else if (metadata?.images) {
        imgUrl = Object.keys(metadata.images)[0];
    }

    // Get video URL from OpenGraph og:video
    const videoUrl = data?.['og:video:secure_url'] || data?.['og:video:url'] || data?.['og:video'] || data?.video;

    // Get metadata
    const title = data?.title || data?.['og:title'] || '';
    const siteName = data?.site_name || data?.['og:site_name'] || '';

    const handlePress = useCallback(() => {
        if (videoUrl) {
            // Play in-app via MediaViewer
            const options = {
                layout: {backgroundColor: '#000'},
                overlay: {interceptTouchOutside: true},
                statusBar: {backgroundColor: '#000', style: 'light' as const},
            };
            showOverlay(Screens.MEDIA_VIEWER, {uri: videoUrl, type: 'video', name: title}, options);
        } else if (link) {
            // Fallback: open in external browser
            const onError = () => onOpenLinkError(intl);
            tryOpenURL(link, onError);
        }
    }, [videoUrl, link, title, intl]);

    if (!link) {
        return null;
    }

    return (
        <View style={styles.container}>
            <TouchableOpacity onPress={handlePress}>
                <ExpoImageBackground
                    id={`video-link-${link}`}
                    contentFit='cover'
                    style={[styles.imageContainer, dimensions]}
                    source={imgUrl ? {uri: imgUrl} : undefined}
                >
                    <View style={styles.playIcon}>
                        <CompassIcon
                            name='play'
                            size={28}
                            color='#fff'
                        />
                    </View>
                </ExpoImageBackground>
            </TouchableOpacity>
            {(title || siteName) && (
                <TouchableOpacity style={styles.infoContainer} onPress={handlePress}>
                    {title ? (
                        <Text style={styles.title} numberOfLines={2}>
                            {title}
                        </Text>
                    ) : null}
                    {siteName ? (
                        <Text style={styles.siteName}>
                            {siteName}
                        </Text>
                    ) : null}
                </TouchableOpacity>
            )}
        </View>
    );
};

export default React.memo(VideoLink);
