// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {CameraRoll} from '@react-native-camera-roll/camera-roll';
import {LinearGradient, type LinearGradientProps} from 'expo-linear-gradient';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, Modal, Platform, ScrollView, Text, TouchableOpacity, View, StyleSheet} from 'react-native';
import Share from 'react-native-share';
import ViewShot from 'react-native-view-shot';

import CompassIcon from '@components/compass_icon';
import FormattedText from '@components/formatted_text';
import ProfilePicture from '@components/profile_picture';
import QRCodeGenerator from '@components/qr_code_generator';
import {MESSAGE_TYPE, SNACK_BAR_TYPE} from '@constants/snack_bar';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import {usePreventDoubleTap} from '@hooks/utils';
import SecurityManager from '@managers/security_manager';
import {observeCurrentUser} from '@queries/servers/user';
import {dismissModal, setButtons} from '@screens/navigation';
import {showQrScannerModal} from '@screens/qr_scanner/show_modal';
import {formatDate} from '@utils/datetime';
import {formatFullName} from '@utils/display_name';
import {hasWriteStoragePermission} from '@utils/file';
import {logError, logInfo} from '@utils/log';
import {customBase64Encode} from '@utils/security';
import {showSnackBar} from '@utils/snack_bar';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {WithDatabaseArgs} from '@typings/database/database';
import type UserModel from '@typings/database/models/servers/user';
import type {AvailableScreens} from '@typings/screens/navigation';

const CARD_GRADIENT_START = '#E8E8E8';
const CARD_GRADIENT_END = '#C0C0C0';

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: '#F5F5F5',
    },
    content: {
        flexGrow: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 20,
        paddingVertical: 24,
    },
    centerBlock: {
        alignItems: 'center',
        width: '100%',
    },
    cardWrapper: {
        width: '100%',
        maxWidth: '90%',
        marginBottom: 16,
        borderRadius: 16,
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 3,
        overflow: 'hidden',
    },
    card: {
        width: '100%',
        borderRadius: 16,
        alignItems: 'center',
        paddingVertical: 28,
        paddingHorizontal: 24,
    },
    avatarWrapper: {
        marginBottom: 12,
    },
    primaryName: {
        color: '#FFFFFF',
        ...typography('Heading', 400, 'SemiBold'),
        marginBottom: 4,
        textAlign: 'center',
    },
    secondaryName: {
        color: '#FFFFFF',
        ...typography('Body', 100, 'Regular'),
        textAlign: 'center',
        opacity: 0.95,
    },
    qrMargin: {
        marginTop: 0,
        marginBottom: 0,
    },
    qrContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
    },
    actionsRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'flex-start',
        gap: 40,
        flexWrap: 'wrap',
        marginTop: 20,
    },
    actionButton: {
        alignItems: 'center',
        minWidth: 88,
    },
    actionIcon: {
        marginBottom: 8,
    },
    actionLabel: {
        color: theme.centerChannelColor,
        ...typography('Body', 75, 'Regular'),
        textAlign: 'center',
    },
    moreMenuOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    moreMenuCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        paddingVertical: 8,
        minWidth: 240,
    },
    moreMenuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 20,
    },
    moreMenuText: {
        color: theme.centerChannelColor,
        ...typography('Body', 100, 'Regular'),
    },
    moreMenuDivider: {
        height: 1,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.12),
        marginHorizontal: 12,
    },
}));

// const EDIT_BUTTON_ID = 'external-profile-card-edit';
const MORE_BUTTON_ID = 'external-profile-card-more';

type ExternalProfileCardProps = {
    componentId: AvailableScreens;
    closeButtonId: string;
    currentUser?: UserModel;
};

const ExternalProfileCardScreen = ({
    componentId,
    closeButtonId,
    currentUser,
}: ExternalProfileCardProps) => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const styles = getStyleSheet(theme);
    const viewShotRef = useRef<ViewShot>(null);
    const [moreMenuVisible, setMoreMenuVisible] = useState(false);
    const [qrTimestamp, setQrTimestamp] = useState(() => Date.now());

    const locale = currentUser?.locale ?? '';
    const fullName = currentUser ? formatFullName(locale, currentUser.lastName ?? '', currentUser.firstName ?? '') : '';
    const hasName = fullName.length > 0;
    const nickname = (currentUser?.nickname ?? '').trim();
    // eslint-disable-next-line no-nested-ternary
    const displayName = currentUser? (hasName ? (nickname ? `${fullName} (${nickname})` : fullName) : (nickname || currentUser.username)): '';

    const onClosePressed = useCallback(() => {
        dismissModal({componentId});
    }, [componentId]);

    useNavButtonPressed(closeButtonId, componentId, onClosePressed, []);
    useAndroidHardwareBackHandler(componentId, onClosePressed);

    const rightButtons = useMemo(() => {
        // const editIcon = CompassIcon.getImageSourceSync('pencil-outline', 24, theme.sidebarHeaderTextColor);
        const moreIcon = CompassIcon.getImageSourceSync(
            Platform.select({android: 'dots-vertical', default: 'dots-horizontal'}),
            24,
            theme.sidebarHeaderTextColor,
        );
        return [
            {
                id: MORE_BUTTON_ID,
                icon: moreIcon,
                testID: 'external_profile_card.more.button',
            },

            // {
            //     id: EDIT_BUTTON_ID,
            //     icon: editIcon,
            //     testID: 'external_profile_card.edit.button',
            // },
        ];
    }, [theme.sidebarHeaderTextColor]);

    useEffect(() => {
        setButtons(componentId, {rightButtons});
    }, [componentId, rightButtons]);

    // const onEditPressed = usePreventDoubleTap(useCallback(() => {
    //     showModalWithBackButton(
    //         Screens.EXTERNAL_PROFILE_CARD_EDIT,
    //         intl.formatMessage({id: 'external_profile_card.edit_title', defaultMessage: 'Edit'}),
    //         'close-external-profile-card-edit',
    //     );
    // }, [intl]));

    const onMorePressed = usePreventDoubleTap(useCallback(() => {
        setMoreMenuVisible(true);
    }, []));

    const closeMoreMenu = useCallback(() => setMoreMenuVisible(false), []);

    const onScanPress = usePreventDoubleTap(useCallback(() => {
        setMoreMenuVisible(false);
        showQrScannerModal(intl);
    }, [intl]));

    const onResetQRPress = usePreventDoubleTap(useCallback(() => {
        setMoreMenuVisible(false);
        setQrTimestamp(Date.now());
    }, []));

    // useNavButtonPressed(EDIT_BUTTON_ID, componentId, onEditPressed, []);
    useNavButtonPressed(MORE_BUTTON_ID, componentId, onMorePressed, []);

    const handleShare = usePreventDoubleTap(useCallback(async () => {
        try {
            if (viewShotRef.current?.capture) {
                const uri = await viewShotRef.current.capture();
                await Share.open({
                    title: intl.formatMessage({id: 'external_profile_card.title', defaultMessage: 'External Profile Card'}),
                    message: displayName ? `${displayName} - ${intl.formatMessage({id: 'external_profile_card.share_message', defaultMessage: 'Profile card'})}` : '',
                    url: uri,
                    saveToFiles: true,
                    filename: `profile_card_${formatDate(undefined, true)}.png`,
                });
            } else {
                Alert.alert(
                    intl.formatMessage({id: 'external_profile_card.error_title', defaultMessage: 'Error'}),
                    intl.formatMessage({id: 'external_profile_card.share_not_supported', defaultMessage: 'Sharing is not supported'}),
                );
            }
        } catch (e) {
            if ((e as {message?: string})?.message !== 'User did not share') {
                logError('[ExternalProfileCard.handleShare]', e);
            }
        }
    }, [intl, displayName]));

    const handleSaveToAlbum = usePreventDoubleTap(useCallback(async () => {
        try {
            const hasPermission = await hasWriteStoragePermission(intl);
            if (!hasPermission) {
                return;
            }
            if (viewShotRef.current?.capture) {
                const uri = await viewShotRef.current.capture();
                await CameraRoll.saveAsset(uri, {
                    type: 'photo',
                    album: intl.formatMessage({id: 'external_profile_card.title', defaultMessage: 'External Profile Card'}),
                });
                logInfo('[ExternalProfileCard] Card saved to album');
                showSnackBar({
                    barType: SNACK_BAR_TYPE.TEXT_COPIED,
                    customMessage: intl.formatMessage({id: 'external_profile_card.save_success_message', defaultMessage: 'Saved to album'}),
                    type: MESSAGE_TYPE.SUCCESS,
                });
            } else {
                Alert.alert(
                    intl.formatMessage({id: 'external_profile_card.error_title', defaultMessage: 'Error'}),
                    intl.formatMessage({id: 'external_profile_card.save_failed', defaultMessage: 'Unable to save'}),
                );
            }
        } catch (e) {
            logError('[ExternalProfileCard.handleSaveToAlbum]', e);
            Alert.alert(
                intl.formatMessage({id: 'external_profile_card.error_title', defaultMessage: 'Error'}),
                intl.formatMessage({id: 'external_profile_card.save_failed', defaultMessage: 'Unable to save'}),
            );
        }
    }, [intl]));

    if (!currentUser) {
        return null;
    }

    const baseUrl = serverUrl.endsWith('/') ? serverUrl.slice(0, -1) : serverUrl;
    const qrData = (() => {
        const data = {uid: currentUser.id, ts: qrTimestamp};
        const encoded = customBase64Encode(encodeURIComponent(JSON.stringify(data)));
        return `${baseUrl}/profile_card_by_qr?qrdata=${encoded}`;
    })();

    return (
        <View
            nativeID={SecurityManager.getShieldScreenId(componentId)}
            style={styles.container}
        >
            <ScrollView
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.centerBlock}>
                    <ViewShot
                        ref={viewShotRef}
                        options={{fileName: 'external_profile_card', format: 'png'}}
                        style={{alignItems: 'center', width: '100%'}}
                    >
                        <View style={styles.cardWrapper}>
                            <View style={styles.card}>
                                <LinearGradient
                                    {...({
                                        colors: [CARD_GRADIENT_START, CARD_GRADIENT_END],
                                        start: {x: 0, y: 0},
                                        end: {x: 1, y: 1},
                                        style: StyleSheet.absoluteFill,
                                    } as LinearGradientProps)}
                                />
                                <View style={styles.avatarWrapper}>
                                    <ProfilePicture
                                        author={currentUser}
                                        size={80}
                                        iconSize={36}
                                        showStatus={false}
                                    />
                                </View>
                                <Text
                                    style={styles.primaryName}
                                    numberOfLines={1}
                                >
                                    {displayName}
                                </Text>
                            </View>
                        </View>
                        <View style={[styles.qrMargin, styles.qrContainer]}>
                            <QRCodeGenerator
                                data={qrData}
                                size={200}
                                ecl='L'
                                showBorder={false}
                                logo={require('@assets/images/icon.png')}
                                logoSize={0.2}
                                logoBackgroundColor='#FFFFFF'
                                style={styles.qrMargin}
                            />
                        </View>
                    </ViewShot>
                    <View style={styles.actionsRow}>
                        <TouchableOpacity
                            style={styles.actionButton}
                            onPress={handleShare}
                            testID='external_profile_card.share_qrcode.button'
                        >
                            <View style={styles.actionIcon}>
                                <CompassIcon
                                    name='share-variant-outline'
                                    size={28}
                                    color={theme.centerChannelColor}
                                />
                            </View>
                            <FormattedText
                                id='external_profile_card.share_qrcode'
                                defaultMessage='Share QR Code'
                                style={styles.actionLabel}
                            />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.actionButton}
                            onPress={handleSaveToAlbum}
                            testID='external_profile_card.save_to_album.button'
                        >
                            <View style={styles.actionIcon}>
                                <CompassIcon
                                    name='download-outline'
                                    size={28}
                                    color={theme.centerChannelColor}
                                />
                            </View>
                            <FormattedText
                                id='external_profile_card.save_to_album'
                                defaultMessage='Save to album'
                                style={styles.actionLabel}
                            />
                        </TouchableOpacity>
                    </View>
                </View>
            </ScrollView>
            <Modal
                visible={moreMenuVisible}
                transparent={true}
                animationType='fade'
                onRequestClose={closeMoreMenu}
            >
                <TouchableOpacity
                    style={styles.moreMenuOverlay}
                    activeOpacity={1}
                    onPress={closeMoreMenu}
                >
                    <TouchableOpacity
                        style={styles.moreMenuCard}
                        activeOpacity={1}
                        onPress={() => {}}
                    >
                        <TouchableOpacity
                            style={styles.moreMenuItem}
                            onPress={onScanPress}
                            testID='external_profile_card.more.scan'
                        >
                            <FormattedText
                                id='external_profile_card.scan'
                                defaultMessage='Scan'
                                style={styles.moreMenuText}
                            />
                        </TouchableOpacity>
                        <View style={styles.moreMenuDivider}/>
                        <TouchableOpacity
                            style={styles.moreMenuItem}
                            onPress={onResetQRPress}
                            testID='external_profile_card.more.reset_qr'
                        >
                            <FormattedText
                                id='external_profile_card.reset_qr'
                                defaultMessage='Reset QR Code'
                                style={styles.moreMenuText}
                            />
                        </TouchableOpacity>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>
        </View>
    );
};

const enhanced = withObservables([], ({database}: WithDatabaseArgs) => ({
    currentUser: observeCurrentUser(database),
}));

export default withDatabase(enhanced(ExternalProfileCardScreen));
