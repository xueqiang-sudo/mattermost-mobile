// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, ScrollView, Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {
    fetchCompany,
    fetchContactDirectoryContent,
    fetchDefaultDepartmentId,
    moveContactEmployeeToDepartment,
} from '@actions/remote/contact';
import {type ContactDepartment, type ContactEmployee} from '@client/rest/contact';
import CompassIcon from '@components/compass_icon';
import ContactAvatar from '@components/contact_avatar';
import Loading from '@components/loading';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import {dismissModal} from '@screens/navigation';
import {usePreventDoubleTap} from '@hooks/utils';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {AvailableScreens} from '@typings/screens/navigation';

const CLOSE_BUTTON_ID = 'close-contacts-batch-move';
const CONFIRM_BUTTON_ID = 'contacts-batch-move-confirm';

type TargetLevel = {
    departmentId: number | null;
    departmentName?: string;
};

type Props = {
    componentId: AvailableScreens;
    closeButtonId?: string;
    companyId: string;

    /** 当前所在部门 ID，null 表示根目录/默认部门 */
    sourceDepartmentId: number | null;
    sourceDepartmentName: string;
    onSuccess?: () => void;
    /** 仅移动单人员时传入，跳过成员选择直接进入选择目标部门 */
    singleEmployeeId?: string;
    /** 单人员时传入，用于确认弹窗中展示姓名 */
    singleEmployeeName?: string;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    flex: {flex: 1},
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: theme.sidebarBg,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    headerCenter: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        ...typography('Heading', 600, 'SemiBold'),
        color: theme.sidebarText,
        textAlign: 'center',
    },
    headerSubtitle: {
        ...typography('Body', 100),
        color: changeOpacity(theme.sidebarText, 0.85),
        marginTop: 2,
        textAlign: 'center',
    },
    headerBackWrap: {
        position: 'absolute',
        left: 12,
        top: 0,
        bottom: 0,
        justifyContent: 'center',
        zIndex: 1,
    },
    headerCloseWrap: {
        position: 'absolute',
        right: 12,
        top: 0,
        bottom: 0,
        justifyContent: 'center',
    },
    listItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    checkbox: {
        width: 22,
        height: 22,
        borderRadius: 4,
        borderWidth: 2,
        marginRight: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxSelected: {
        backgroundColor: theme.linkColor,
        borderColor: theme.linkColor,
    },
    checkboxUnselected: {
        borderColor: changeOpacity(theme.centerChannelColor, 0.4),
    },
    listItemAvatar: {marginRight: 12},
    listItemName: {
        ...typography('Body', 200),
        color: theme.centerChannelColor,
        flex: 1,
    },
    deptRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    folderIcon: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
        backgroundColor: changeOpacity(theme.linkColor, 0.12),
        borderRadius: 10,
    },
    bottomBar: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        paddingBottom: 24,
        backgroundColor: theme.centerChannelBg,
        borderTopWidth: 1,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    bottomButton: {
        paddingVertical: 12,
        borderRadius: 8,
        backgroundColor: theme.linkColor,
        alignItems: 'center',
        justifyContent: 'center',
    },
    bottomButtonDisabled: {
        backgroundColor: changeOpacity(theme.linkColor, 0.4),
    },
    bottomButtonText: {
        ...typography('Body', 200, 'SemiBold'),
        color: '#fff',
    },
    emptyMessage: {
        ...typography('Body', 100),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        paddingVertical: 24,
        paddingHorizontal: 20,
        textAlign: 'center',
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 24,
    },
}));

const ContactsBatchMoveMembers = ({
    componentId,
    closeButtonId,
    companyId,
    sourceDepartmentId,
    sourceDepartmentName,
    onSuccess,
    singleEmployeeId,
    singleEmployeeName,
}: Props) => {
    const effectiveCloseId = closeButtonId ?? CLOSE_BUTTON_ID;
    const theme = useTheme();
    const intl = useIntl();
    const mounted = useRef(false);
    const styles = getStyleSheet(theme);

    const [phase, setPhase] = useState<'members' | 'target'>(singleEmployeeId ? 'target' : 'members');
    const [employees, setEmployees] = useState<ContactEmployee[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(
        singleEmployeeId ? new Set([singleEmployeeId]) : new Set(),
    );
    const [loading, setLoading] = useState(true);
    /** 打开时若用户已在某部门下，则直接进入该部门层级（显示其子部门列表） */
    const [targetStack, setTargetStack] = useState<TargetLevel[]>(() => {
        if (singleEmployeeId && sourceDepartmentId != null) {
            return [
                {departmentId: null, departmentName: undefined},
                {departmentId: sourceDepartmentId, departmentName: sourceDepartmentName || undefined},
            ];
        }
        return [{departmentId: null, departmentName: undefined}];
    });
    const [targetDepartments, setTargetDepartments] = useState<ContactDepartment[]>([]);
    const [targetLoading, setTargetLoading] = useState(false);
    const [defaultDepartmentId, setDefaultDepartmentId] = useState<number | null>(null);
    const [moving, setMoving] = useState(false);
    const [enterpriseName, setEnterpriseName] = useState<string | null>(null);

    const currentTarget = targetStack[targetStack.length - 1];
    const targetDepartmentId = currentTarget?.departmentId ?? null;
    /** 根目录时使用默认部门 ID 作为目标 */
    const effectiveTargetDepartmentId = targetDepartmentId ?? defaultDepartmentId;

    /** 当前部门 ID（源）；根目录用户时用 defaultDepartmentId */
    const effectiveSourceDepartmentId = sourceDepartmentId ?? defaultDepartmentId;

    /** 不能移动到同一部门：目标与当前部门相同时按钮不可点击 */
    const canMoveToTarget = effectiveTargetDepartmentId != null &&
        effectiveSourceDepartmentId != null &&
        effectiveTargetDepartmentId !== effectiveSourceDepartmentId;
    const isAtRootLevel = targetDepartmentId === null;

    const loadEmployees = useCallback(async () => {
        setLoading(true);
        const res = await fetchContactDirectoryContent(companyId, sourceDepartmentId ?? undefined);
        if (!mounted.current) return;
        if (res.data) {
            setEmployees(res.data.employees);
        } else {
            setEmployees([]);
        }
        setLoading(false);
    }, [companyId, sourceDepartmentId]);

    const loadTargetLevel = useCallback(async (departmentId: number | null) => {
        setTargetLoading(true);
        const res = await fetchContactDirectoryContent(companyId, departmentId ?? undefined);
        if (!mounted.current) return;
        if (res.data) {
            setTargetDepartments(res.data.departments);
        } else {
            setTargetDepartments([]);
        }
        setTargetLoading(false);
    }, [companyId]);

    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);

    useEffect(() => {
        if (phase === 'members' && !singleEmployeeId) {
            loadEmployees();
        }
    }, [phase, loadEmployees, singleEmployeeId]);

    useEffect(() => {
        if (phase === 'target') {
            loadTargetLevel(currentTarget?.departmentId ?? null);
        }
    }, [phase, currentTarget?.departmentId, loadTargetLevel]);

    useEffect(() => {
        if (phase !== 'target') {
            return;
        }
        let cancelled = false;
        fetchDefaultDepartmentId(companyId).then((res) => {
            if (!cancelled && mounted.current && res.data != null) {
                setDefaultDepartmentId(res.data);
            }
        });
        return () => { cancelled = true; };
    }, [companyId, phase]);

    useEffect(() => {
        if (phase !== 'target') {
            return;
        }
        let cancelled = false;
        fetchCompany(companyId).then((res) => {
            if (!cancelled && mounted.current && res.data?.name) {
                setEnterpriseName(res.data.name);
            }
        });
        return () => { cancelled = true; };
    }, [companyId, phase]);

    const handleClose = useCallback(() => {
        dismissModal({componentId});
    }, [componentId]);

    const handleBack = useCallback(() => {
        if (phase === 'target' && targetStack.length > 1) {
            setTargetStack((prev) => prev.slice(0, -1));
            return;
        }
        if (phase === 'target' && !singleEmployeeId) {
            setPhase('members');
            return;
        }
        handleClose();
    }, [phase, singleEmployeeId, targetStack.length, handleClose]);

    const toggleMember = useCallback((id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const handleConfirmSelection = useCallback(() => {
        if (selectedIds.size === 0) return;
        setPhase('target');
    }, [selectedIds.size]);

    const handleSelectTargetDepartment = useCallback((dept: ContactDepartment) => {
        setTargetStack((prev) => [...prev, {departmentId: dept.id, departmentName: dept.name}]);
    }, []);

    const handleMoveHere = usePreventDoubleTap(useCallback(async () => {
        if (!canMoveToTarget || effectiveTargetDepartmentId == null || effectiveSourceDepartmentId == null || selectedIds.size === 0) return;
        const count = selectedIds.size;
        const targetName = isAtRootLevel
            ? intl.formatMessage({id: 'contacts.root_default_department', defaultMessage: 'Root (default department)'})
            : (currentTarget?.departmentName ?? '');
        const memberNames = singleEmployeeId && singleEmployeeName
            ? [singleEmployeeName]
            : employees.filter((e) => selectedIds.has(e.id)).map((e) => e.name);
        const confirmLine = intl.formatMessage(
            {id: 'contacts.move_members_confirm', defaultMessage: 'Move {count} member(s) to {name}?'},
            {count, name: targetName},
        );
        const membersListLabel = intl.formatMessage({id: 'contacts.members_to_move', defaultMessage: 'Members to move:'});
        const message = memberNames.length > 0
            ? `${confirmLine}\n\n${membersListLabel}\n${memberNames.join('\n')}`
            : confirmLine;
        const ok = await new Promise<boolean>((resolve) => {
            Alert.alert(
                intl.formatMessage({id: 'contacts.move_members', defaultMessage: 'Move members'}),
                message,
                [
                    {text: intl.formatMessage({id: 'common.cancel', defaultMessage: 'Cancel'}), onPress: () => resolve(false)},
                    {text: intl.formatMessage({id: 'common.confirm', defaultMessage: 'Confirm'}), onPress: () => resolve(true)},
                ],
            );
        });
        if (!ok) return;
        setMoving(true);
        let failed = 0;
        for (const employeeId of selectedIds) {
            const res = await moveContactEmployeeToDepartment(
                employeeId,
                companyId,
                effectiveSourceDepartmentId,
                effectiveTargetDepartmentId,
            );
            if (res.error) failed += 1;
        }
        setMoving(false);
        if (!mounted.current) return;
        if (failed > 0) {
            Alert.alert(
                intl.formatMessage({id: 'contacts.move_members', defaultMessage: 'Move members'}),
                intl.formatMessage(
                    {id: 'contacts.move_members_partial_failed', defaultMessage: '{failed} of {total} member(s) failed to move.'},
                    {failed, total: count},
                ),
            );
        }
        onSuccess?.();
        handleClose();
    }, [canMoveToTarget, companyId, currentTarget?.departmentName, effectiveSourceDepartmentId, effectiveTargetDepartmentId, employees, intl, isAtRootLevel, onSuccess, selectedIds, singleEmployeeId, singleEmployeeName, handleClose]));

    useNavButtonPressed(effectiveCloseId, componentId, handleClose, [handleClose]);

    useAndroidHardwareBackHandler(componentId, () => {
        handleBack();
    });

    const rootSubtitle = enterpriseName ?? intl.formatMessage({id: 'contacts.enterprise_root', defaultMessage: 'Enterprise'});
    const subtitle = phase === 'members'
        ? sourceDepartmentName
        : (currentTarget?.departmentName ?? rootSubtitle);

    if (phase === 'members') {
        return (
            <SafeAreaView edges={['bottom']} style={styles.flex} testID='contacts.batch_move_members.screen'>
                <View style={styles.header}>
                    <TouchableOpacity style={styles.headerBackWrap} onPress={handleBack} testID='contacts.batch_move.back'>
                        <CompassIcon name='arrow-left' size={24} color={theme.sidebarText} />
                    </TouchableOpacity>
                    <View style={styles.headerCenter}>
                        <Text style={styles.headerTitle}>
                            {intl.formatMessage({id: 'contacts.move_members', defaultMessage: 'Move members'})}
                        </Text>
                        <Text style={styles.headerSubtitle} numberOfLines={1}>{subtitle}</Text>
                    </View>
                    <TouchableOpacity style={styles.headerCloseWrap} onPress={handleClose} testID='contacts.batch_move.close'>
                        <CompassIcon name='close' size={24} color={theme.sidebarText} />
                    </TouchableOpacity>
                </View>
                {loading ? (
                    <View style={styles.loadingContainer}>
                        <Loading color={theme.centerChannelColor} size='small' />
                    </View>
                ) : employees.length === 0 ? (
                    <Text style={styles.emptyMessage}>
                        {intl.formatMessage({id: 'contacts.no_members', defaultMessage: 'No members'})}
                    </Text>
                ) : (
                    <>
                        <ScrollView style={styles.flex} contentContainerStyle={{paddingBottom: 24}} showsVerticalScrollIndicator={false}>
                            {employees.map((emp) => (
                                <TouchableOpacity
                                    key={emp.id}
                                    style={styles.listItem}
                                    onPress={() => toggleMember(emp.id)}
                                    activeOpacity={0.7}
                                    testID={`contacts.batch_move.member.${emp.id}`}
                                >
                                    <View style={[styles.checkbox, selectedIds.has(emp.id) ? styles.checkboxSelected : styles.checkboxUnselected]}>
                                        {selectedIds.has(emp.id) && <CompassIcon name='check' size={14} color='#fff' />}
                                    </View>
                                    <View style={styles.listItemAvatar}>
                                        <ContactAvatar employee={emp} size={40} />
                                    </View>
                                    <Text style={styles.listItemName} numberOfLines={1}>{emp.name}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                        {selectedIds.size > 0 && (
                            <View style={styles.bottomBar}>
                                <TouchableOpacity
                                    style={styles.bottomButton}
                                    onPress={handleConfirmSelection}
                                    activeOpacity={0.8}
                                    testID='contacts.batch_move.next'
                                >
                                    <Text style={styles.bottomButtonText}>
                                        {intl.formatMessage({id: 'contacts.next_step', defaultMessage: 'Next'})}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </>
                )}
            </SafeAreaView>
        );
    }

    /** 根目录下不显示左上角箭头（仅退到上一级部门时显示） */
    const showBackArrow = targetStack.length > 1;

    return (
        <SafeAreaView edges={['bottom']} style={styles.flex} testID='contacts.batch_move_members.screen'>
            <View style={styles.header}>
                {showBackArrow ? (
                    <TouchableOpacity style={styles.headerBackWrap} onPress={handleBack} testID='contacts.batch_move.back'>
                        <CompassIcon name='arrow-left' size={24} color={theme.sidebarText} />
                    </TouchableOpacity>
                ) : (
                    <View style={styles.headerBackWrap} />
                )}
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>
                        {intl.formatMessage({id: 'contacts.select_target_department', defaultMessage: 'Select target department'})}
                    </Text>
                    <Text style={styles.headerSubtitle} numberOfLines={1}>{subtitle}</Text>
                </View>
                <TouchableOpacity style={styles.headerCloseWrap} onPress={handleClose} testID='contacts.batch_move.close'>
                    <CompassIcon name='close' size={24} color={theme.sidebarText} />
                </TouchableOpacity>
            </View>
            {targetLoading ? (
                <View style={styles.loadingContainer}>
                    <Loading color={theme.centerChannelColor} size='small' />
                </View>
            ) : (
                <>
                    <ScrollView style={styles.flex} contentContainerStyle={{paddingBottom: 24}} showsVerticalScrollIndicator={false}>
                        {targetDepartments.map((dept) => (
                            <TouchableOpacity
                                key={dept.id}
                                style={styles.deptRow}
                                onPress={() => handleSelectTargetDepartment(dept)}
                                activeOpacity={0.7}
                                testID={`contacts.batch_move.target_dept.${dept.id}`}
                            >
                                <View style={styles.folderIcon}>
                                    <CompassIcon name='folder-outline' size={24} color={theme.linkColor} />
                                </View>
                                <Text style={styles.listItemName} numberOfLines={1}>{dept.name}</Text>
                                <CompassIcon name='chevron-right' size={24} color={changeOpacity(theme.centerChannelColor, 0.5)} />
                            </TouchableOpacity>
                        ))}
                        {targetDepartments.length === 0 && targetDepartmentId == null && (
                            <Text style={styles.emptyMessage}>
                                {intl.formatMessage({id: 'contacts.no_departments', defaultMessage: 'No departments'})}
                            </Text>
                        )}
                    </ScrollView>
                    <View style={styles.bottomBar}>
                        <TouchableOpacity
                            style={[
                                styles.bottomButton,
                                (moving || !canMoveToTarget) && styles.bottomButtonDisabled,
                            ]}
                            onPress={handleMoveHere}
                            disabled={moving || !canMoveToTarget}
                            activeOpacity={0.8}
                            testID='contacts.batch_move.move_here'
                        >
                            <Text style={styles.bottomButtonText}>
                                {isAtRootLevel
                                    ? intl.formatMessage({id: 'contacts.move_to_root', defaultMessage: 'Move to root (default department)'})
                                    : intl.formatMessage(
                                        {id: 'contacts.move_here', defaultMessage: 'Move here ({name})'},
                                        {name: currentTarget?.departmentName ?? ''},
                                    )}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </>
            )}
        </SafeAreaView>
    );
};

export default ContactsBatchMoveMembers;
