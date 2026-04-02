// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * 我的主页主界面
 * 显示供应商、客户两个按钮，点击后打开对应列表
 */

import {useIsFocused, useNavigation} from '@react-navigation/native';
import React from 'react';
import {Freeze} from 'react-freeze';
import {useIntl} from 'react-intl';
import {Platform, ScrollView, StatusBar, Text, TouchableOpacity, View} from 'react-native';
import Animated, {useAnimatedStyle, withTiming} from 'react-native-reanimated';
import {type Edge, SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';

import {EmployeeContactTypes} from '@client/rest/employee_contact';
import CompassIcon from '@components/compass_icon';
import {Screens} from '@constants';
import {useTheme} from '@context/theme';
import {usePreventDoubleTap} from '@hooks/utils';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {StackNavigationProp} from '@react-navigation/stack';
import type {MyHomepageStackParamList} from '@screens/home/my_homepage/stack_param_list';
import type UserModel from '@typings/database/models/servers/user';

type Props = {
    currentUser?: UserModel;
};

const edges: Edge[] = ['left', 'right'];

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    flex: {
        flex: 1,
    },
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
        paddingVertical: 4,
        backgroundColor: theme.sidebarBg,
    },
    headerTitle: {
        ...typography('Heading', 600, 'SemiBold'),
        color: theme.sidebarText,
        textAlign: 'center',
    },
    scrollContent: {
        flexGrow: 1,
    },
    body: {
        marginTop: 12,
        marginHorizontal: 16,
    },
    buttonContainer: {
        marginBottom: 16,
    },
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 16,
        backgroundColor: theme.centerChannelBg,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    buttonLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    buttonIcon: {
        width: 48,
        height: 48,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    buttonIconSupplier: {
        backgroundColor: changeOpacity(theme.linkColor, 0.12),
    },
    buttonIconCustomer: {
        backgroundColor: changeOpacity(theme.onlineIndicator, 0.15),
    },
    buttonText: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    buttonSubtext: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        marginTop: 2,
    },
    buttonRight: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    addButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 8,
    },
    addButtonSupplier: {
        backgroundColor: changeOpacity(theme.linkColor, 0.12),
    },
    addButtonCustomer: {
        backgroundColor: changeOpacity(theme.onlineIndicator, 0.15),
    },
    arrowIcon: {
        opacity: 0.4,
    },
}));

const MyHomepageMain = ({currentUser}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const isFocused = useIsFocused();
    const navigation = useNavigation<StackNavigationProp<MyHomepageStackParamList>>();
    const insets = useSafeAreaInsets();
    const topInset = insets.top || (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0);
    const styles = getStyleSheet(theme);

    const animated = useAnimatedStyle(() => ({
        opacity: withTiming(1, {duration: 150}),
        transform: [{translateX: withTiming(0, {duration: 150})}],
    }), []);

    /**
     * 处理打开供应商列表
     */
    const handleOpenSuppliers = usePreventDoubleTap(() => {
        navigation.navigate(Screens.MY_SUPPLIERS);
    });

    /**
     * 处理打开客户列表
     */
    const handleOpenCustomers = usePreventDoubleTap(() => {
        navigation.navigate(Screens.MY_CUSTOMERS);
    });

    /**
     * 处理添加供应商
     */
    const handleAddSupplier = usePreventDoubleTap(() => {
        if (currentUser?.id) {
            navigation.navigate(Screens.SUPPLIER_CUSTOMER_FORM, {
                kind: EmployeeContactTypes.Supplier,
                ownerId: currentUser.id,
            });
        }
    });

    /**
     * 处理添加客户
     */
    const handleAddCustomer = usePreventDoubleTap(() => {
        if (currentUser?.id) {
            navigation.navigate(Screens.SUPPLIER_CUSTOMER_FORM, {
                kind: EmployeeContactTypes.Customer,
                ownerId: currentUser.id,
            });
        }
    });

    const content = (
        <ScrollView
            style={[styles.flex, {backgroundColor: theme.centerChannelBg}]}
            contentContainerStyle={[styles.scrollContent, {paddingBottom: insets.bottom + 24}]}
            showsVerticalScrollIndicator={false}
        >
            <View style={styles.header}>
                <Text style={styles.headerTitle}>
                    {intl.formatMessage({id: 'tab_bar.my_homepage.label', defaultMessage: 'My Homepage'})}
                </Text>
            </View>

            <View style={styles.body}>
                {/* 供应商按钮 */}
                <View style={styles.buttonContainer}>
                    <TouchableOpacity
                        style={styles.button}
                        onPress={handleOpenSuppliers}
                        activeOpacity={0.7}
                    >
                        <View style={styles.buttonLeft}>
                            <View style={[styles.buttonIcon, styles.buttonIconSupplier]}>
                                <CompassIcon
                                    name='car-outline'
                                    size={24}
                                    color={theme.linkColor}
                                />
                            </View>
                            <View>
                                <Text style={styles.buttonText}>
                                    {intl.formatMessage({id: 'my_homepage.my_suppliers', defaultMessage: 'My Suppliers'})}
                                </Text>
                                <Text style={styles.buttonSubtext}>
                                    {intl.formatMessage({id: 'my_homepage.suppliers_subtext', defaultMessage: 'Manage your supplier contacts'})}
                                </Text>
                            </View>
                        </View>
                        <View style={styles.buttonRight}>
                            <TouchableOpacity
                                style={[styles.addButton, styles.addButtonSupplier]}
                                onPress={handleAddSupplier}
                                hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                            >
                                <CompassIcon
                                    name='plus'
                                    size={20}
                                    color={theme.linkColor}
                                />
                            </TouchableOpacity>
                            <CompassIcon
                                name='chevron-right'
                                size={20}
                                color={theme.centerChannelColor}
                                style={styles.arrowIcon}
                            />
                        </View>
                    </TouchableOpacity>
                </View>

                {/* 客户按钮 */}
                <View style={styles.buttonContainer}>
                    <TouchableOpacity
                        style={styles.button}
                        onPress={handleOpenCustomers}
                        activeOpacity={0.7}
                    >
                        <View style={styles.buttonLeft}>
                            <View style={[styles.buttonIcon, styles.buttonIconCustomer]}>
                                <CompassIcon
                                    name='account-multiple-outline'
                                    size={24}
                                    color={theme.onlineIndicator}
                                />
                            </View>
                            <View>
                                <Text style={styles.buttonText}>
                                    {intl.formatMessage({id: 'my_homepage.my_customers', defaultMessage: 'My Customers'})}
                                </Text>
                                <Text style={styles.buttonSubtext}>
                                    {intl.formatMessage({id: 'my_homepage.customers_subtext', defaultMessage: 'Manage your customer contacts'})}
                                </Text>
                            </View>
                        </View>
                        <View style={styles.buttonRight}>
                            <TouchableOpacity
                                style={[styles.addButton, styles.addButtonCustomer]}
                                onPress={handleAddCustomer}
                                hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                            >
                                <CompassIcon
                                    name='plus'
                                    size={20}
                                    color={theme.onlineIndicator}
                                />
                            </TouchableOpacity>
                            <CompassIcon
                                name='chevron-right'
                                size={20}
                                color={theme.centerChannelColor}
                                style={styles.arrowIcon}
                            />
                        </View>
                    </TouchableOpacity>
                </View>
            </View>
        </ScrollView>
    );

    return (
        <Freeze freeze={!isFocused}>
            <>
                <View style={[{height: topInset, backgroundColor: theme.sidebarBg}]}/>
                <SafeAreaView
                    edges={edges}
                    style={styles.flex}
                >
                    <Animated.View style={[styles.flex, animated]}>
                        {content}
                    </Animated.View>
                </SafeAreaView>
            </>
        </Freeze>
    );
};

export default MyHomepageMain;
