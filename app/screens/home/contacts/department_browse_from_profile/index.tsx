// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useState} from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import {type Edge, SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import {Screens} from '@constants';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import {dismissModal} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import ContactsDepartmentDetail from '../department_detail';

import type {AvailableScreens} from '@typings/screens/navigation';

type StackLevel = {
    departmentId: number | null;
    departmentName: string;
    breadcrumb: string[];
};

/** 顶/左/右由本屏处理；底边由内嵌 department_detail（fromEmployeeProfile）单独处理，避免双层 SafeArea 叠加 */
const SAFE_AREA_EDGES: Edge[] = ['top', 'left', 'right'];

type Props = {
    componentId: AvailableScreens;
    departmentId: number;
    departmentName: string;
    breadcrumb: string[];
    companyId: string;
    companyName?: string;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    flex: {flex: 1},
    headerBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: theme.sidebarBg,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    headerBack: {
        padding: 4,
        marginRight: 8,
        zIndex: 1,
    },
    headerTitleWrap: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 48,
    },
    headerTitle: {
        ...typography('Heading', 600, 'SemiBold'),
        color: theme.sidebarHeaderTextColor,
        textAlign: 'center',
    },
    headerClose: {
        padding: 4,
        zIndex: 1,
    },
}));

const ContactsDepartmentBrowseFromProfile = ({
    componentId,
    departmentId,
    departmentName,
    breadcrumb,
    companyId,
    companyName,
}: Props) => {
    const theme = useTheme();
    const styles = getStyleSheet(theme);

    const [stack, setStack] = useState<StackLevel[]>([{
        departmentId,
        departmentName,
        breadcrumb: breadcrumb.length > 0 ? breadcrumb : [departmentName],
    }]);

    const handleBack = useCallback(() => {
        if (stack.length > 1) {
            setStack((prev) => prev.slice(0, -1));
        } else {
            dismissModal({componentId});
        }
    }, [componentId, stack.length]);

    const handleClose = useCallback(() => {
        dismissModal({componentId});
    }, [componentId]);

    const handleNavigateToDepartment = useCallback((params: {
        departmentId: number;
        departmentName: string;
        breadcrumb: string[];
        companyId: string;
        companyName?: string;
    }) => {
        setStack((prev) => [...prev, {
            departmentId: params.departmentId,
            departmentName: params.departmentName,
            breadcrumb: params.breadcrumb,
        }]);
    }, []);

    const handleBreadcrumbPress = useCallback((toDismiss: number) => {
        if (toDismiss <= 0) {
            return;
        }
        const nextLength = stack.length - toDismiss;
        if (nextLength <= 0) {
            const rootLabel = stack[0]?.breadcrumb?.[0] ?? companyName ?? '';
            setStack([{
                departmentId: null,
                departmentName: rootLabel,
                breadcrumb: [rootLabel],
            }]);
            return;
        }
        setStack((prev) => prev.slice(0, nextLength));
    }, [companyName, stack]);

    useAndroidHardwareBackHandler(componentId, handleBack);

    const current = stack[stack.length - 1];
    if (!current) {
        return null;
    }

    return (
        <SafeAreaView
            edges={SAFE_AREA_EDGES}
            style={[styles.flex, {backgroundColor: theme.sidebarBg}]}
            testID='contacts.department_browse_from_profile.screen'
        >
            <View style={styles.headerBar}>
                <TouchableOpacity
                    onPress={handleBack}
                    style={styles.headerBack}
                    hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
                    testID='contacts.department_browse.back'
                >
                    <CompassIcon
                        name='arrow-left'
                        size={24}
                        color={theme.sidebarHeaderTextColor}
                    />
                </TouchableOpacity>
                <View
                    style={styles.headerTitleWrap}
                    pointerEvents='box-none'
                >
                    <Text
                        style={styles.headerTitle}
                        numberOfLines={1}
                    >
                        {current.departmentName}
                    </Text>
                </View>
                <TouchableOpacity
                    onPress={handleClose}
                    style={styles.headerClose}
                    hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
                    testID='contacts.department_browse.close'
                >
                    <CompassIcon
                        name='close'
                        size={24}
                        color={theme.sidebarHeaderTextColor}
                    />
                </TouchableOpacity>
            </View>
            <ContactsDepartmentDetail
                componentId={Screens.CONTACTS_DEPARTMENT_DETAIL}
                departmentId={current.departmentId}
                departmentName={current.departmentName}
                breadcrumb={current.breadcrumb}
                companyId={companyId}
                companyName={companyName}
                fromEmployeeProfile={true}
                onBack={handleBack}
                onNavigateToDepartment={handleNavigateToDepartment}
                onBreadcrumbPress={handleBreadcrumbPress}
            />
        </SafeAreaView>
    );
};

export default ContactsDepartmentBrowseFromProfile;
