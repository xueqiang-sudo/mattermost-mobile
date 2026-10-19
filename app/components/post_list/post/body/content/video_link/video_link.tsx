// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';

import CompassIcon from '@components/compass_icon';
import {ExpoImage, ExpoImageBackground} from '@components/expo_image';
import {Screens} from '@constants';
import {useIsTablet} from '@hooks/device';
import {showOverlay} from '@screens/navigation';
import {debugLog} from '@store/debug_log';
import {calculateDimensions, getViewPortWidth} from '@utils/images';
import {fetchKuaishouMetadata, isKuaishouURL, type KuaishouMetadata} from '@utils/kuaishou_metadata';
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
        borderRadius: 8,
        marginBottom: 6,
        marginTop: 10,
        overflow: 'hidden',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        backgroundColor: theme.centerChannelBg,
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
        padding: 12,
        backgroundColor: theme.centerChannelBg,
    },
    title: {
        fontSize: 15,
        fontWeight: '600',
        color: theme.centerChannelColor,
        marginBottom: 4,
        lineHeight: 20,
    },
    description: {
        fontSize: 13,
        color: changeOpacity(theme.centerChannelColor, 0.72),
        marginBottom: 8,
        lineHeight: 18,
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 8,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    siteName: {
        fontSize: 12,
        color: changeOpacity(theme.centerChannelColor, 0.56),
        flex: 1,
    },
    footerImage: {
        width: 40,
        height: 40,
        borderRadius: 4,
        marginLeft: 8,
    },
}));

const VideoLink = ({isReplyPost, layoutWidth, metadata, theme}: VideoLinkProps) => {
    const intl = useIntl();
    const isTablet = useIsTablet();
    const styles = getStyles(theme);

    const embed = metadata?.embeds?.[0];
    const link = embed?.url;
    const data = embed?.data as Record<string, any> | undefined;

    // Client-side fallback metadata for Kuaishou
    const [fallbackMetadata, setFallbackMetadata] = useState<KuaishouMetadata | null>(null);

    // Fetch Kuaishou metadata if server data is incomplete
    useEffect(() => {
        if (link && isKuaishouURL(link)) {
            const hasTitle = Boolean(data?.title || data?.['og:title']);
            const hasDescription = Boolean(data?.description || data?.['og:description']);
            const hasImages = Boolean(data?.images?.length);

            // If server data is incomplete, fetch from client
            if (!hasTitle || !hasDescription || !hasImages) {
                debugLog('VideoLink', 'Server metadata incomplete, fetching from client');
                fetchKuaishouMetadata(link).then((metadata) => {
                    if (metadata) {
                        setFallbackMetadata(metadata);
                    }
                });
            }
        }
    }, [link, data]);

    // Debug logging for Kuaishou video cards
    if (link?.includes('kuaishou.com')) {
        debugLog('VideoLink Debug', JSON.stringify({
            link,
            hasData: Boolean(data),
            hasFallback: Boolean(fallbackMetadata),
            dataKeys: data ? Object.keys(data) : [],
            videoUrl: data?.['og:video:secure_url'] || data?.['og:video:url'] || data?.['og:video'] || data?.video,
            thumbnail: data?.images?.[0]?.url,
            title: data?.title || data?.['og:title'],
        }, null, 2));
    }

    const dimensions = calculateDimensions(
        MAX_IMAGE_HEIGHT,
        MAX_IMAGE_WIDTH,
        layoutWidth || (getViewPortWidth(isReplyPost, isTablet) - 6),
    );

    // Get thumbnail from OpenGraph images, fallback to Kuaishou metadata
    let imgUrl: string | undefined;
    if (data?.images?.[0]?.url) {
        imgUrl = data.images[0].url;
    } else if (fallbackMetadata?.coverUrl) {
        imgUrl = fallbackMetadata.coverUrl;
    } else if (metadata?.images) {
        imgUrl = Object.keys(metadata.images)[0];
    }

    // Get video URL from OpenGraph og:video
    const videoUrl = data?.['og:video:secure_url'] || data?.['og:video:url'] || data?.['og:video'] || data?.video;

    // Get metadata with fallback priority
    const title = data?.title || data?.['og:title'] || fallbackMetadata?.title || '';
    const description = data?.description || data?.['og:description'] || fallbackMetadata?.description || '';
    const siteName = data?.site_name || data?.['og:site_name'] || fallbackMetadata?.siteName || '';

    // Get second image for footer (if available - often the site logo), fallback to avatar
    const footerImgUrl = data?.images?.[1]?.url || data?.images?.[0]?.url || fallbackMetadata?.avatarUrl;

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
            {(title || description || siteName) && (
                <TouchableOpacity style={styles.infoContainer} onPress={handlePress}>
                    {title ? (
                        <Text style={styles.title} numberOfLines={2}>
                            {title}
                        </Text>
                    ) : null}
                    {description ? (
                        <Text style={styles.description} numberOfLines={2}>
                            {description}
                        </Text>
                    ) : null}
                    {siteName ? (
                        <View style={styles.footer}>
                            <Text style={styles.siteName} numberOfLines={1}>
                                {siteName}
                            </Text>
                            {footerImgUrl && (
                                <ExpoImage
                                    source={{uri: footerImgUrl}}
                                    style={styles.footerImage}
                                    contentFit='cover'
                                />
                            )}
                        </View>
                    ) : null}
                </TouchableOpacity>
            )}
        </View>
    );
};

export default React.memo(VideoLink);
