// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, ScrollView, Text, TouchableOpacity, View} from 'react-native';
import {type Edge, SafeAreaView} from 'react-native-safe-area-context';

import {
    batchMoveContactEmployeeToDepartment,
    fetchContactDirectoryContent,
    fetchDefaultDepartmentId,
    updateContactDepartment,
} from '@actions/remote/contact_new';
import {fetchTeamById} from '@actions/remote/team';
import CompassIcon from '@components/compass_icon';
import ContactAvatar from '@components/contact_avatar';
import Loading from '@components/loading';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import {usePreventDoubleTap} from '@hooks/utils';
import {dismissModal} from '@screens/navigation';
import {getContactListDisplayName} from '@utils/contact_section';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {MMDepartment} from '@client/rest/team_department';
import type {AvailableScreens} from '@typings/screens/navigation';

const CLOSE_BUTTON_ID = 'close-contacts-batch-move';

const SAFE_AREA_EDGES: Edge[] = ['top', 'bottom', 'left', 'right'];

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
    headerSelectAllWrap: {
        position: 'absolute',
        right: 44,
        top: 0,
        bottom: 0,
        justifyContent: 'center',
    },
    headerSelectAllText: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.linkColor,
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
    listItemSelected: {
        backgroundColor: changeOpacity(theme.linkColor, 0.08),
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
    checkboxSelectedDisabled: {
        backgroundColor: changeOpacity(theme.linkColor, 0.4),
        borderColor: changeOpacity(theme.linkColor, 0.6),
    },
    checkboxDisabled: {
        borderColor: changeOpacity(theme.centerChannelColor, 0.2),
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
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
    deptRowSelected: {
        backgroundColor: changeOpacity(theme.linkColor, 0.08),
    },
    deptRowDisabled: {
        opacity: 0.4,
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
    bottomBarSummary: {
        ...typography('Body', 100),
        color: changeOpacity(theme.centerChannelColor, 0.85),
        marginBottom: 10,
    },
    bottomBarSelectedNames: {
        ...typography('Body', 100),
        color: changeOpacity(theme.centerChannelColor, 0.85),
        marginBottom: 4,
    },
    bottomBarChipsWrap: {
        marginBottom: 8,
        maxHeight: 44,
    },
    bottomBarChipsScroll: {
        flexGrow: 0,
    },
    bottomBarChipsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingRight: 16,
    },
    selectedChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 16,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.1),
        borderWidth: 1,
        borderColor: changeOpacity(theme.linkColor, 0.35),
    },
    selectedChipIcon: {
        width: 24,
        height: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 6,
        borderRadius: 12,
        backgroundColor: changeOpacity(theme.linkColor, 0.15),
    },
    selectedChipText: {
        ...typography('Body', 200),
        color: theme.centerChannelColor,
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
        backgroundColor: theme.centerChannelBg,
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
    const serverUrl = useServerUrl();
    const mounted = useRef(false);
    const styles = getStyleSheet(theme);

    const [phase, setPhase] = useState<'members' | 'target'>(() => (
        singleEmployeeId ? 'target' : 'members'
    ));
    const [employees, setEmployees] = useState<UserProfile[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(
        singleEmployeeId ? new Set([singleEmployeeId]) : new Set(),
    );
    const [selectedDepartmentIds, setSelectedDepartmentIds] = useState<Set<number>>(new Set());
    const [selectedDepartmentNames, setSelectedDepartmentNames] = useState<Record<number, string>>({});
    const [selectedMemberNames, setSelectedMemberNames] = useState<Record<string, string>>(() =>
        (singleEmployeeId && singleEmployeeName ? {[singleEmployeeId]: singleEmployeeName} : {}),
    );
    const [selectedMemberSourceDepts, setSelectedMemberSourceDepts] = useState<Record<string, number>>(() =>
        (singleEmployeeId && sourceDepartmentId != null ? {[singleEmployeeId]: sourceDepartmentId} : {}),
    );
    const [selectedDepartmentPaths, setSelectedDepartmentPaths] = useState<Record<number, number[]>>({});
    const [selectedMemberPaths, setSelectedMemberPaths] = useState<Record<string, number[]>>({});
    const [loading, setLoading] = useState(true);
    const [memberDepartments, setMemberDepartments] = useState<MMDepartment[]>([]);

    /** 成员选择阶段的部门栈：默认从当前部门开始，可回退到根目录再浏览其它部门 */
    const [memberStack, setMemberStack] = useState<TargetLevel[]>(() => {
        if (sourceDepartmentId != null) {
            return [
                {departmentId: null, departmentName: undefined},
                {departmentId: sourceDepartmentId, departmentName: sourceDepartmentName || undefined},
            ];
        }

        return [{departmentId: null, departmentName: undefined}];
    });

    /** 打开目标部门选择时，若用户已在某部门下，则直接进入该部门层级（显示其子部门列表） */
    const [targetStack, setTargetStack] = useState<TargetLevel[]>(() => {
        if (singleEmployeeId && sourceDepartmentId != null) {
            return [
                {departmentId: null, departmentName: undefined},
                {departmentId: sourceDepartmentId, departmentName: sourceDepartmentName || undefined},
            ];
        }

        return [{departmentId: null, departmentName: undefined}];
    });
    const [targetDepartments, setTargetDepartments] = useState<MMDepartment[]>([]);
    const [targetLoading, setTargetLoading] = useState(false);
    const [defaultDepartmentId, setDefaultDepartmentId] = useState<number | null>(null);
    const [moving, setMoving] = useState(false);
    const [enterpriseName, setEnterpriseName] = useState<string | null>(null);

    const currentMember = memberStack[memberStack.length - 1];
    const currentTarget = targetStack[targetStack.length - 1];

    /** 当前是否在已选部门内部：已选部门下不能再勾选其成员或子部门 */
    const isInsideSelectedDepartment = memberStack.some(
        (level) => level.departmentId != null && selectedDepartmentIds.has(level.departmentId),
    );
    const targetDepartmentId = currentTarget?.departmentId ?? null;
    const resolvedTargetDepartmentId = targetDepartmentId ?? defaultDepartmentId ?? null;
    const selectedMemberIds = Array.from(selectedIds);
    const selectedDeptIds = Array.from(selectedDepartmentIds);

    /** 根目录时使用默认部门 ID 作为目标 */
    const effectiveTargetDepartmentId = targetDepartmentId ?? defaultDepartmentId;

    /** 当前部门 ID（源）；根目录用户时用 defaultDepartmentId */
    const effectiveSourceDepartmentId = sourceDepartmentId ?? defaultDepartmentId;

    const movableMemberIds = selectedMemberIds.filter((memberId) => {
        const sourceDeptId = selectedMemberSourceDepts[memberId] ?? defaultDepartmentId ?? sourceDepartmentId ?? null;
        if (resolvedTargetDepartmentId == null) {
            return true;
        }
        return sourceDeptId !== resolvedTargetDepartmentId;
    });
    const movableDepartmentIds = selectedDeptIds.filter((deptId) => {
        const path = selectedDepartmentPaths[deptId];
        if (!path || path.length === 0) {
            return true;
        }
        const parentDepartmentId = path.length > 1 ? path[path.length - 2] : null;
        if (resolvedTargetDepartmentId == null) {
            return parentDepartmentId != null;
        }
        return parentDepartmentId !== resolvedTargetDepartmentId;
    });
    const hasMovableItems = movableMemberIds.length > 0 || movableDepartmentIds.length > 0;

    /** 不能移动到同一部门：同源目标成员/部门会被自动剔除，仅有可变更项时可移动 */
    const canMoveToTarget = hasMovableItems &&
        (resolvedTargetDepartmentId != null || targetDepartmentId === null);
    const isAtRootLevel = targetDepartmentId === null;

    /** 是否有任一选中项可以移动到根目录（默认部门）：
     * - 成员：任一成员的源部门 !== 默认部门
     * - 部门：任一部门路径长度 > 1（即当前不在根目录下，有父部门）
     * 当从根目录打开时 sourceDepartmentId 为 null，需用 selectedMemberSourceDepts 判断实际源部门
     */
    const hasAnyItemCanMoveToRoot = (() => {
        if (selectedIds.size === 0 && selectedDepartmentIds.size === 0) {
            return false;
        }
        for (const memberId of selectedIds) {
            const srcDept = selectedMemberSourceDepts[memberId] ?? defaultDepartmentId ?? sourceDepartmentId;
            if (defaultDepartmentId != null && srcDept !== defaultDepartmentId) {
                return true;
            }
            if (defaultDepartmentId == null && srcDept != null) {
                return true; // 默认部门未加载，有明确源部门则允许
            }
        }
        for (const deptId of selectedDepartmentIds) {
            const path = selectedDepartmentPaths[deptId];
            if (path && path.length > 1) {
                return true; // 部门有父级，可移动到根目录
            }
        }
        return false;
    })();

    /** 根目录时允许按钮可点（点击时再拉取默认部门 ID），只要存在可移动的选中项 */
    const canMoveToRoot = isAtRootLevel &&
        (defaultDepartmentId == null ? hasMovableItems : hasAnyItemCanMoveToRoot);

    const loadEmployees = useCallback(async () => {
        setLoading(true);
        if (!serverUrl) {
            setLoading(false);
            return;
        }

        // 根目录：需要显示「子部门 + 默认部门成员」
        if (!currentMember?.departmentId) {
            const rootRes = await fetchContactDirectoryContent(serverUrl, companyId, undefined);
            if (!mounted.current) {
                return;
            }

            let employeesFromDefault: UserProfile[] = [];
            let departmentsFromRoot: MMDepartment[] = [];

            if (rootRes.data) {
                departmentsFromRoot = rootRes.data.departments;
            }

            // 再拉一次默认部门的成员，用于根目录成员列表展示
            let effectiveDefaultId = defaultDepartmentId;
            if (effectiveDefaultId == null) {
                const defaultResId = await fetchDefaultDepartmentId(serverUrl, companyId);
                if (!mounted.current) {
                    return;
                }
                if (!defaultResId.error && defaultResId.data != null) {
                    effectiveDefaultId = defaultResId.data;
                }
            }

            if (effectiveDefaultId != null) {
                const defaultRes = await fetchContactDirectoryContent(serverUrl, companyId, effectiveDefaultId);
                if (!mounted.current) {
                    return;
                }
                if (defaultRes.data) {
                    employeesFromDefault = defaultRes.data.employees;
                }
            }

            setEmployees(employeesFromDefault);
            setMemberDepartments(departmentsFromRoot);
            setLoading(false);
            return;
        }

        // 非根目录：按当前部门 ID 加载
        const res = await fetchContactDirectoryContent(serverUrl, companyId, currentMember.departmentId);
        if (!mounted.current) {
            return;
        }

        if (res.data) {
            setEmployees(res.data.employees);
            setMemberDepartments(res.data.departments);
        } else {
            setEmployees([]);
            setMemberDepartments([]);
        }
        setLoading(false);
    }, [companyId, currentMember?.departmentId, defaultDepartmentId, serverUrl]);

    const loadTargetLevel = useCallback(async (departmentId: number | null) => {
        setTargetLoading(true);
        if (!serverUrl) {
            setTargetLoading(false);
            return;
        }
        const res = await fetchContactDirectoryContent(serverUrl, companyId, departmentId ?? undefined);
        if (!mounted.current) {
            return;
        }
        if (res.data) {
            setTargetDepartments(res.data.departments);
        } else {
            setTargetDepartments([]);
        }
        setTargetLoading(false);
    }, [companyId, serverUrl]);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    useEffect(() => {
        if (phase === 'members') {
            loadEmployees();
        }
    }, [phase, loadEmployees]);

    useEffect(() => {
        if (phase === 'target') {
            loadTargetLevel(currentTarget?.departmentId ?? null);
        }
    }, [phase, currentTarget?.departmentId, loadTargetLevel]);

    /** 尽早拉取默认部门 ID，便于在「选择目标部门」阶段点击「移动到根目录」时 canMoveToTarget 为 true */
    useEffect(() => {
        if (!companyId || !serverUrl) {
            return;
        }
        let cancelled = false;
        fetchDefaultDepartmentId(serverUrl, companyId).then((res) => {
            if (!cancelled && mounted.current && res.data != null) {
                setDefaultDepartmentId(res.data);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [companyId, serverUrl]);

    /** 目标阶段在根目录时若尚未拿到默认部门 ID 再拉一次，确保「移动到根目录」可点 */
    const atRootInTargetPhase = phase === 'target' && targetDepartmentId === null;
    useEffect(() => {
        if (!atRootInTargetPhase || defaultDepartmentId != null || !companyId || !serverUrl) {
            return;
        }
        let cancelled = false;
        fetchDefaultDepartmentId(serverUrl, companyId).then((res) => {
            if (!cancelled && mounted.current && res.data != null) {
                setDefaultDepartmentId(res.data);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [atRootInTargetPhase, defaultDepartmentId, companyId, serverUrl]);

    useEffect(() => {
        if (phase !== 'target' && phase !== 'members') {
            return;
        }
        if (!serverUrl) {
            return;
        }
        let cancelled = false;
        fetchTeamById(serverUrl, companyId).then((res) => {
            const display = res.team?.display_name || res.team?.name;
            if (!cancelled && mounted.current && display) {
                setEnterpriseName(display);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [companyId, phase, serverUrl]);

    /** 当已选部门包含某成员/子部门时，从选中中移除：取包含最多的目录，其下的不在 chips 显示
     * 在 selectedDepartmentIds 变化后清理被包含的成员和子部门（含 handleToggleSelectAll 全选场景）
     */
    useEffect(() => {
        if (selectedDepartmentIds.size === 0) {
            return;
        }
        const toRemoveMemberIds: string[] = [];
        const toRemoveDepartmentIds: number[] = [];
        for (const memberId of selectedIds) {
            const memberPath = selectedMemberPaths[memberId];
            if (!memberPath) {
                continue;
            }
            const hasAncestorDept = Array.from(selectedDepartmentIds).some((deptId) => {
                const deptPath = selectedDepartmentPaths[deptId];
                if (!deptPath || deptPath.length > memberPath.length) {
                    return false;
                }
                return deptPath.every((v, idx) => v === memberPath[idx]);
            });
            if (hasAncestorDept) {
                toRemoveMemberIds.push(memberId);
            }
        }
        for (const deptId of selectedDepartmentIds) {
            const deptPath = selectedDepartmentPaths[deptId];
            if (!deptPath) {
                continue;
            }
            const hasAncestorDept = Array.from(selectedDepartmentIds).some((otherId) => {
                if (otherId === deptId) {
                    return false;
                }
                const otherPath = selectedDepartmentPaths[otherId];
                if (!otherPath || otherPath.length >= deptPath.length) {
                    return false;
                }
                return otherPath.every((v, idx) => v === deptPath[idx]);
            });
            if (hasAncestorDept) {
                toRemoveDepartmentIds.push(deptId);
            }
        }
        if (toRemoveMemberIds.length > 0 || toRemoveDepartmentIds.length > 0) {
            if (toRemoveMemberIds.length > 0) {
                setSelectedIds((prev) => {
                    const next = new Set(prev);
                    toRemoveMemberIds.forEach((id) => next.delete(id));
                    return next;
                });
                setSelectedMemberNames((prev) => {
                    const next = {...prev};
                    toRemoveMemberIds.forEach((id) => delete next[id]);
                    return next;
                });
                setSelectedMemberSourceDepts((prev) => {
                    const next = {...prev};
                    toRemoveMemberIds.forEach((id) => delete next[id]);
                    return next;
                });
                setSelectedMemberPaths((prev) => {
                    const next = {...prev};
                    toRemoveMemberIds.forEach((id) => delete next[id]);
                    return next;
                });
            }
            if (toRemoveDepartmentIds.length > 0) {
                setSelectedDepartmentIds((prev) => {
                    const next = new Set(prev);
                    toRemoveDepartmentIds.forEach((id) => next.delete(id));
                    return next;
                });
                setSelectedDepartmentNames((prev) => {
                    const next = {...prev};
                    toRemoveDepartmentIds.forEach((id) => delete next[id]);
                    return next;
                });
                setSelectedDepartmentPaths((prev) => {
                    const next = {...prev};
                    toRemoveDepartmentIds.forEach((id) => delete next[id]);
                    return next;
                });
            }
        }
    }, [selectedDepartmentIds, selectedIds, selectedDepartmentPaths, selectedMemberPaths]);

    const handleClose = useCallback(() => {
        dismissModal({componentId});
    }, [componentId]);

    const handleBack = useCallback(() => {
        if (phase === 'members') {
            if (memberStack.length > 1) {
                setMemberStack((prev) => prev.slice(0, -1));
                return;
            }

            handleClose();
            return;
        }

        if (phase === 'target' && targetStack.length > 1) {
            setTargetStack((prev) => prev.slice(0, -1));
            return;
        }

        if (phase === 'target' && !singleEmployeeId) {
            setPhase('members');
            return;
        }

        handleClose();
    }, [handleClose, memberStack.length, phase, singleEmployeeId, targetStack.length]);

    const toggleMember = useCallback((id: string, name: string) => {
        const path = memberStack.map((l) => l.departmentId).filter((v): v is number => v != null);
        const sourceDept = (currentMember?.departmentId ?? defaultDepartmentId) ?? undefined;

        // 若已有选中的部门是当前成员路径的祖先，则忽略本次选择
        const hasAncestorDept = Object.values(selectedDepartmentPaths).some((deptPath) => {
            if (deptPath.length > path.length) {
                return false;
            }
            return deptPath.every((v, idx) => v === path[idx]);
        });
        if (hasAncestorDept) {
            return;
        }

        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
                setSelectedMemberNames((names) => {
                    const nextNames = {...names};
                    delete nextNames[id];
                    return nextNames;
                });
                setSelectedMemberSourceDepts((depts) => {
                    const nextDepts = {...depts};
                    delete nextDepts[id];
                    return nextDepts;
                });
                setSelectedMemberPaths((paths) => {
                    const nextPaths = {...paths};
                    delete nextPaths[id];
                    return nextPaths;
                });
            } else {
                next.add(id);
                setSelectedMemberNames((names) => ({...names, [id]: name}));
                if (sourceDept != null) {
                    setSelectedMemberSourceDepts((depts) => ({...depts, [id]: sourceDept}));
                }
                setSelectedMemberPaths((paths) => ({...paths, [id]: path}));
            }
            return next;
        });
    }, [currentMember?.departmentId, defaultDepartmentId, memberStack, selectedDepartmentPaths]);

    const toggleDepartment = useCallback((id: number, name: string) => {
        const path = [...memberStack.map((l) => l.departmentId).filter((v): v is number => v != null), id];

        setSelectedDepartmentIds((prevSelectedIds) => {
            const nextIds = new Set(prevSelectedIds);

            // 已选中则取消自身及其子孙
            if (nextIds.has(id)) {
                nextIds.delete(id);
                setSelectedDepartmentNames((names) => {
                    const nextNames = {...names};
                    delete nextNames[id];
                    return nextNames;
                });
                setSelectedDepartmentPaths((paths) => {
                    const nextPaths: Record<number, number[]> = {};
                    Object.entries(paths).forEach(([deptIdStr, p]) => {
                        const deptIdNum = Number(deptIdStr);
                        if (deptIdNum === id) {
                            return;
                        }

                        // 移除子孙部门
                        if (p.length >= path.length && path.every((v, idx) => v === p[idx])) {
                            nextIds.delete(deptIdNum);
                            return;
                        }
                        nextPaths[deptIdNum] = p;
                    });
                    return nextPaths;
                });
                setSelectedMemberPaths((paths) => {
                    const nextPaths: Record<string, number[]> = {};
                    Object.entries(paths).forEach(([memberId, p]) => {
                        if (p.length >= path.length && path.every((v, idx) => v === p[idx])) {
                            // 移除该部门下所有成员
                            setSelectedIds((prev) => {
                                const tmp = new Set(prev);
                                tmp.delete(memberId);
                                return tmp;
                            });
                            setSelectedMemberNames((names) => {
                                const nextNames = {...names};
                                delete nextNames[memberId];
                                return nextNames;
                            });
                            setSelectedMemberSourceDepts((depts) => {
                                const nextDepts = {...depts};
                                delete nextDepts[memberId];
                                return nextDepts;
                            });
                            return;
                        }
                        nextPaths[memberId] = p;
                    });
                    return nextPaths;
                });
                return nextIds;
            }

            // 若已有选中部门是当前部门路径的祖先，则忽略
            const hasAncestorDept = Object.values(selectedDepartmentPaths).some((deptPath) => {
                if (deptPath.length > path.length) {
                    return false;
                }
                return deptPath.every((v, idx) => v === path[idx]);
            });
            if (hasAncestorDept) {
                return nextIds;
            }

            // 新选中：移除所有被其包含的子孙部门和成员
            const nextDeptNames = {...selectedDepartmentNames, [id]: name};
            const nextDeptPaths: Record<number, number[]> = {};
            nextIds.add(id);

            Object.entries(selectedDepartmentPaths).forEach(([deptIdStr, p]) => {
                const deptIdNum = Number(deptIdStr);
                if (p.length >= path.length && path.every((v, idx) => v === p[idx])) {
                    nextIds.delete(deptIdNum);
                    delete nextDeptNames[deptIdNum];
                    return;
                }
                nextDeptPaths[deptIdNum] = p;
            });
            nextDeptPaths[id] = path;

            const nextMemberPaths: Record<string, number[]> = {};
            Object.entries(selectedMemberPaths).forEach(([memberId, p]) => {
                if (p.length >= path.length && path.every((v, idx) => v === p[idx])) {
                    setSelectedIds((prev) => {
                        const tmp = new Set(prev);
                        tmp.delete(memberId);
                        return tmp;
                    });
                    setSelectedMemberNames((names) => {
                        const nm = {...names};
                        delete nm[memberId];
                        return nm;
                    });
                    setSelectedMemberSourceDepts((depts) => {
                        const ds = {...depts};
                        delete ds[memberId];
                        return ds;
                    });
                    return;
                }
                nextMemberPaths[memberId] = p;
            });

            setSelectedDepartmentNames(nextDeptNames);
            setSelectedDepartmentPaths(nextDeptPaths);
            setSelectedMemberPaths(nextMemberPaths);

            return nextIds;
        });
    }, [memberStack, selectedDepartmentNames, selectedDepartmentPaths, selectedMemberPaths]);

    const handleConfirmSelection = useCallback(() => {
        if (selectedIds.size === 0 && selectedDepartmentIds.size === 0) {
            return;
        }
        setPhase('target');
    }, [selectedIds.size, selectedDepartmentIds.size]);

    const handleSelectTargetDepartment = useCallback((dept: MMDepartment) => {
        setTargetStack((prev) => [...prev, {departmentId: dept.id, departmentName: dept.name}]);
    }, []);

    const handleEnterMemberDepartment = useCallback((dept: MMDepartment) => {
        setMemberStack((prev) => [...prev, {departmentId: dept.id, departmentName: dept.name}]);
    }, []);

    const currentLevelMemberIds = employees.map((e) => e.id);
    const currentLevelDepartmentIds = memberDepartments.map((d) => d.id);
    const allCurrentMembersSelected = currentLevelMemberIds.length === 0 ||
        currentLevelMemberIds.every((id) => selectedIds.has(id));
    const allCurrentDeptsSelected = currentLevelDepartmentIds.length === 0 ||
        currentLevelDepartmentIds.every((id) => selectedDepartmentIds.has(id));
    const allCurrentSelected = allCurrentMembersSelected && allCurrentDeptsSelected;
    const hasCurrentLevelItems = currentLevelMemberIds.length > 0 || currentLevelDepartmentIds.length > 0;

    const handleToggleSelectAll = useCallback(() => {
        if (isInsideSelectedDepartment || !hasCurrentLevelItems) {
            return;
        }

        if (allCurrentSelected) {
            // 取消当前层级所有成员与部门（以及相关名称/路径）
            setSelectedIds((prev) => {
                const next = new Set(prev);
                currentLevelMemberIds.forEach((id) => next.delete(id));
                return next;
            });
            setSelectedMemberNames((prev) => {
                const next = {...prev};
                currentLevelMemberIds.forEach((id) => delete next[id]);
                return next;
            });
            setSelectedMemberSourceDepts((prev) => {
                const next = {...prev};
                currentLevelMemberIds.forEach((id) => delete next[id]);
                return next;
            });
            setSelectedMemberPaths((prev) => {
                const next: Record<string, number[]> = {};
                Object.entries(prev).forEach(([id, path]) => {
                    if (!currentLevelMemberIds.includes(id)) {
                        next[id] = path;
                    }
                });
                return next;
            });
            setSelectedDepartmentIds((prev) => {
                const next = new Set(prev);
                currentLevelDepartmentIds.forEach((id) => next.delete(id));
                return next;
            });
            setSelectedDepartmentNames((prev) => {
                const next = {...prev};
                currentLevelDepartmentIds.forEach((id) => delete next[id]);
                return next;
            });
            setSelectedDepartmentPaths((prev) => {
                const next: Record<number, number[]> = {};
                Object.entries(prev).forEach(([idStr, path]) => {
                    const idNum = Number(idStr);
                    if (!currentLevelDepartmentIds.includes(idNum)) {
                        next[idNum] = path;
                    }
                });
                return next;
            });
            return;
        }

        // 全选：只把当前层级未选中的项加入，避免对已选项再 toggle 导致被取消
        const currentPath = memberStack.map((l) => l.departmentId).filter((v): v is number => v != null);
        const sourceDept = currentMember?.departmentId ?? defaultDepartmentId;

        const deptsToAdd = memberDepartments.filter((d) => !selectedDepartmentIds.has(d.id));
        const membersToAdd = employees.filter((e) => !selectedIds.has(e.id));

        if (deptsToAdd.length > 0) {
            setSelectedDepartmentIds((prev) => new Set([...prev, ...deptsToAdd.map((d) => d.id)]));
            setSelectedDepartmentNames((prev) => {
                const next = {...prev};
                deptsToAdd.forEach((d) => {
                    next[d.id] = d.name;
                });
                return next;
            });
            setSelectedDepartmentPaths((prev) => {
                const next = {...prev};
                deptsToAdd.forEach((d) => {
                    next[d.id] = [...currentPath, d.id];
                });
                return next;
            });
        }
        if (membersToAdd.length > 0 && sourceDept != null) {
            setSelectedIds((prev) => new Set([...prev, ...membersToAdd.map((e) => e.id)]));
            setSelectedMemberNames((prev) => {
                const next = {...prev};
                membersToAdd.forEach((e) => {
                    next[e.id] = getContactListDisplayName(e);
                });
                return next;
            });
            setSelectedMemberSourceDepts((prev) => {
                const next = {...prev};
                membersToAdd.forEach((e) => {
                    next[e.id] = sourceDept;
                });
                return next;
            });
            setSelectedMemberPaths((prev) => {
                const next = {...prev};
                membersToAdd.forEach((e) => {
                    next[e.id] = currentPath;
                });
                return next;
            });
        }
    }, [
        allCurrentSelected,
        currentLevelDepartmentIds,
        currentLevelMemberIds,
        currentMember?.departmentId,
        defaultDepartmentId,
        employees,
        hasCurrentLevelItems,
        isInsideSelectedDepartment,
        memberDepartments,
        memberStack,
        selectedDepartmentIds,
        selectedIds,
    ]);

    const handleMoveHere = usePreventDoubleTap(useCallback(async () => {
        if (!serverUrl) {
            return;
        }
        const hasMembers = movableMemberIds.length > 0;
        const hasDepartments = movableDepartmentIds.length > 0;
        const allowedByTarget = isAtRootLevel ? canMoveToRoot : canMoveToTarget;
        if (!allowedByTarget || (!hasMembers && !hasDepartments)) {
            return;
        }

        /** 根目录且尚未有默认部门 ID 时，先拉取再执行 */
        let resolvedTargetId = effectiveTargetDepartmentId;
        if (isAtRootLevel && resolvedTargetId == null) {
            const defaultRes = await fetchDefaultDepartmentId(serverUrl, companyId);
            if (defaultRes.error || defaultRes.data == null) {
                Alert.alert(
                    intl.formatMessage({id: 'contacts.move_members', defaultMessage: 'Move members'}),
                    intl.formatMessage({id: 'contacts.move_to_root_fetch_failed', defaultMessage: 'Failed to load default department. Please try again.'}),
                );
                return;
            }
            resolvedTargetId = defaultRes.data;
        }
        if (resolvedTargetId == null) {
            return;
        }
        const memberCount = movableMemberIds.length;
        const deptCount = movableDepartmentIds.length;
        const targetName = isAtRootLevel? intl.formatMessage({id: 'contacts.root_default_department', defaultMessage: 'Root (default department)'}): (currentTarget?.departmentName ?? '');
        const memberNames = movableMemberIds.map((id) => selectedMemberNames[id] ?? id).filter(Boolean);
        const deptNames = movableDepartmentIds.map((id) => selectedDepartmentNames[id] ?? '').filter(Boolean);
        let confirmLine: string;
        if (deptCount > 0 && memberCount > 0) {
            confirmLine = intl.formatMessage(
                {id: 'contacts.move_confirm_both', defaultMessage: 'Move {deptCount} department(s) and {memberCount} member(s) to {name}?'},
                {deptCount, memberCount, name: targetName},
            );
        } else if (deptCount > 0) {
            confirmLine = intl.formatMessage(
                {id: 'contacts.move_departments_confirm', defaultMessage: 'Move {count} department(s) to {name}?'},
                {count: deptCount, name: targetName},
            );
        } else {
            confirmLine = intl.formatMessage(
                {id: 'contacts.move_members_confirm', defaultMessage: 'Move {count} member(s) to {name}?'},
                {count: memberCount, name: targetName},
            );
        }
        const parts: string[] = [confirmLine];
        if (deptNames.length > 0) {
            const deptLabel = intl.formatMessage({id: 'contacts.departments_to_move', defaultMessage: 'Departments to move:'});
            parts.push(`${deptLabel}\n${deptNames.join('\n')}`);
        }
        if (memberNames.length > 0) {
            const membersLabel = intl.formatMessage({id: 'contacts.members_to_move', defaultMessage: 'Members to move:'});
            parts.push(`${membersLabel}\n${memberNames.join('\n')}`);
        }
        const message = parts.join('\n\n');
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
        if (!ok) {
            return;
        }
        setMoving(true);
        let deptFailed = 0;
        const deptTotal = movableDepartmentIds.length;
        for (const deptId of movableDepartmentIds) {
            const name = selectedDepartmentNames[deptId] ?? '';
            if (!name.trim()) {
                deptFailed += 1;
                continue;
            }
            const newParentId = isAtRootLevel ? null : effectiveTargetDepartmentId;
            const res = await updateContactDepartment(serverUrl, companyId, deptId, name, newParentId);
            if (res.error) {
                deptFailed += 1;
            }
        }
        let failed = 0;
        const count = movableMemberIds.length;
        const memberIdsBySourceDept = new Map<number, string[]>();
        for (const employeeId of movableMemberIds) {
            const srcDept = selectedMemberSourceDepts[employeeId] ?? defaultDepartmentId ?? effectiveSourceDepartmentId;
            if (srcDept == null) {
                failed += 1;
                continue;
            }
            const ids = memberIdsBySourceDept.get(srcDept) ?? [];
            ids.push(employeeId);
            memberIdsBySourceDept.set(srcDept, ids);
        }

        for (const [sourceDeptId, memberIds] of memberIdsBySourceDept.entries()) {
            const res = await batchMoveContactEmployeeToDepartment(
                serverUrl,
                companyId,
                memberIds,
                sourceDeptId,
                resolvedTargetId,
            );
            if (res.error) {
                failed += memberIds.length;
            }
        }
        setMoving(false);
        if (!mounted.current) {
            return;
        }
        if (deptFailed > 0 || failed > 0) {
            const parts: string[] = [];
            if (deptFailed > 0) {
                parts.push(intl.formatMessage(
                    {id: 'contacts.move_departments_partial_failed', defaultMessage: '{failed} of {total} department(s) failed to move.'},
                    {failed: deptFailed, total: deptTotal},
                ));
            }
            if (failed > 0) {
                parts.push(intl.formatMessage(
                    {id: 'contacts.move_members_partial_failed', defaultMessage: '{failed} of {total} member(s) failed to move.'},
                    {failed, total: count},
                ));
            }
            Alert.alert(
                intl.formatMessage({id: 'contacts.move_members', defaultMessage: 'Move members'}),
                parts.join('\n\n'),
            );
        }
        onSuccess?.();
        handleClose();
    }, [canMoveToRoot, canMoveToTarget, companyId, currentTarget?.departmentName, defaultDepartmentId, effectiveSourceDepartmentId, intl, isAtRootLevel, movableDepartmentIds, movableMemberIds, onSuccess, selectedDepartmentNames, selectedMemberNames, selectedMemberSourceDepts, serverUrl, handleClose]));

    useNavButtonPressed(effectiveCloseId, componentId, handleClose, [handleClose]);

    useAndroidHardwareBackHandler(componentId, () => {
        handleBack();
    });

    const rootSubtitle = enterpriseName ?? intl.formatMessage({id: 'contacts.enterprise_root', defaultMessage: 'Enterprise'});
    const memberSubtitle = currentMember?.departmentName ?? rootSubtitle;
    const subtitle = phase === 'members'? memberSubtitle: (currentTarget?.departmentName ?? rootSubtitle);

    if (phase === 'members') {
        const showMemberBackArrow = memberStack.length > 1;

        return (
            <SafeAreaView
                edges={SAFE_AREA_EDGES}
                style={[styles.flex, {backgroundColor: theme.sidebarBg}]}
                testID='contacts.batch_move_members.screen'
            >
                <View style={styles.header}>
                    {showMemberBackArrow ? (
                        <TouchableOpacity
                            style={styles.headerBackWrap}
                            onPress={handleBack}
                            testID='contacts.batch_move.back'
                        >
                            <CompassIcon
                                name='arrow-left'
                                size={24}
                                color={theme.sidebarText}
                            />
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.headerBackWrap}/>
                    )}
                    <View style={styles.headerCenter}>
                        <Text style={styles.headerTitle}>
                            {intl.formatMessage({id: 'contacts.move_members', defaultMessage: 'Move members'})}
                        </Text>
                        <Text
                            style={styles.headerSubtitle}
                            numberOfLines={1}
                        >{subtitle}</Text>
                    </View>
                    {!isInsideSelectedDepartment && hasCurrentLevelItems && (
                        <TouchableOpacity
                            style={styles.headerSelectAllWrap}
                            onPress={handleToggleSelectAll}
                            testID='contacts.batch_move.select_all'
                        >
                            <Text style={styles.headerSelectAllText}>
                                {allCurrentSelected? intl.formatMessage({id: 'contacts.deselect_all', defaultMessage: 'Deselect all'}): intl.formatMessage({id: 'contacts.select_all', defaultMessage: 'Select all'})}
                            </Text>
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity
                        style={styles.headerCloseWrap}
                        onPress={handleClose}
                        testID='contacts.batch_move.close'
                    >
                        <CompassIcon
                            name='close'
                            size={24}
                            color={theme.sidebarText}
                        />
                    </TouchableOpacity>
                </View>
                {loading ? (
                    <View style={styles.loadingContainer}>
                        <Loading
                            color={theme.centerChannelColor}
                            size='small'
                        />
                    </View>
                ) : (employees.length === 0 && memberDepartments.length === 0) ? (
                    <View style={[styles.flex, {backgroundColor: theme.centerChannelBg}]}>
                        <Text style={styles.emptyMessage}>
                            {intl.formatMessage({id: 'contacts.no_members', defaultMessage: 'No members'})}
                        </Text>
                    </View>
                ) : (
                    <>
                        <ScrollView
                            style={[styles.flex, {backgroundColor: theme.centerChannelBg}]}
                            contentContainerStyle={{paddingBottom: 24}}
                            showsVerticalScrollIndicator={false}
                        >
                            {memberDepartments.map((dept) => {
                                const deptSelected = selectedDepartmentIds.has(dept.id);
                                const deptDisabled = isInsideSelectedDepartment;
                                const deptVisuallySelected = deptDisabled || deptSelected;
                                return (
                                    <View
                                        key={`dept-${dept.id}`}
                                        style={[styles.deptRow, deptSelected && styles.deptRowSelected]}
                                    >
                                        <TouchableOpacity
                                            onPress={() => !deptDisabled && toggleDepartment(dept.id, dept.name)}
                                            activeOpacity={0.7}
                                            testID={`contacts.batch_move.member_dept_check.${dept.id}`}
                                        >
                                            <View
                                                style={[
                                                    styles.checkbox,
                                                    deptDisabled? styles.checkboxSelectedDisabled: (deptSelected ? styles.checkboxSelected : styles.checkboxUnselected),
                                                ]}
                                            >
                                                {deptVisuallySelected && <CompassIcon
                                                    name='check'
                                                    size={14}
                                                    color='#fff'
                                                />}
                                            </View>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={{flex: 1, flexDirection: 'row', alignItems: 'center'}}
                                            onPress={() => handleEnterMemberDepartment(dept)}
                                            activeOpacity={0.7}
                                            testID={`contacts.batch_move.member_dept.${dept.id}`}
                                        >
                                            <View style={styles.folderIcon}>
                                                <CompassIcon
                                                    name='folder-outline'
                                                    size={24}
                                                    color={theme.linkColor}
                                                />
                                            </View>
                                            <Text
                                                style={styles.listItemName}
                                                numberOfLines={1}
                                            >{dept.name}</Text>
                                            <CompassIcon
                                                name='chevron-right'
                                                size={24}
                                                color={changeOpacity(theme.centerChannelColor, 0.5)}
                                            />
                                        </TouchableOpacity>
                                    </View>
                                );
                            })}
                            {employees.map((emp) => {
                                const empSelected = selectedIds.has(emp.id);
                                const empDisabled = isInsideSelectedDepartment;
                                const empVisuallySelected = empDisabled || empSelected;
                                return (
                                    <TouchableOpacity
                                        key={emp.id}
                                        style={[styles.listItem, empSelected && styles.listItemSelected]}
                                        onPress={() => !empDisabled && toggleMember(emp.id, getContactListDisplayName(emp))}
                                        activeOpacity={0.7}
                                        testID={`contacts.batch_move.member.${emp.id}`}
                                    >
                                        <View
                                            style={[
                                                styles.checkbox,
                                                empDisabled? styles.checkboxSelectedDisabled: (empSelected ? styles.checkboxSelected : styles.checkboxUnselected),
                                            ]}
                                        >
                                            {empVisuallySelected && <CompassIcon
                                                name='check'
                                                size={14}
                                                color='#fff'
                                            />}
                                        </View>
                                        <View style={styles.listItemAvatar}>
                                            <ContactAvatar
                                                employee={emp}
                                                size={40}
                                            />
                                        </View>
                                        <Text
                                            style={styles.listItemName}
                                            numberOfLines={1}
                                        >{getContactListDisplayName(emp)}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                        <View style={styles.bottomBar}>
                            {(selectedDepartmentIds.size > 0 || selectedIds.size > 0) && (
                                <View style={styles.bottomBarChipsWrap}>
                                    <ScrollView
                                        horizontal={true}
                                        showsHorizontalScrollIndicator={true}
                                        contentContainerStyle={styles.bottomBarChipsScroll}
                                    >
                                        <View style={styles.bottomBarChipsRow}>
                                            {Array.from(selectedDepartmentIds).map((id) => (
                                                <View
                                                    key={`d-${id}`}
                                                    style={styles.selectedChip}
                                                >
                                                    <View style={styles.selectedChipIcon}>
                                                        <CompassIcon
                                                            name='folder-outline'
                                                            size={14}
                                                            color={theme.linkColor}
                                                        />
                                                    </View>
                                                    <Text style={styles.selectedChipText}>
                                                        {selectedDepartmentNames[id] ?? ''}
                                                    </Text>
                                                </View>
                                            ))}
                                            {Array.from(selectedIds).map((id) => (
                                                <View
                                                    key={`m-${id}`}
                                                    style={styles.selectedChip}
                                                >
                                                    <View style={styles.selectedChipIcon}>
                                                        <CompassIcon
                                                            name='account-outline'
                                                            size={14}
                                                            color={theme.linkColor}
                                                        />
                                                    </View>
                                                    <Text style={styles.selectedChipText}>
                                                        {selectedMemberNames[id] ?? ''}
                                                    </Text>
                                                </View>
                                            ))}
                                        </View>
                                    </ScrollView>
                                </View>
                            )}
                            <Text style={styles.bottomBarSummary}>
                                {intl.formatMessage(
                                    {id: 'contacts.selected_summary', defaultMessage: '{memberCount} member(s), {departmentCount} department(s) selected'},
                                    {memberCount: selectedIds.size, departmentCount: selectedDepartmentIds.size},
                                )}
                            </Text>
                            <TouchableOpacity
                                style={[
                                    styles.bottomButton,
                                    (selectedIds.size === 0 && selectedDepartmentIds.size === 0) && styles.bottomButtonDisabled,
                                ]}
                                onPress={handleConfirmSelection}
                                activeOpacity={0.8}
                                disabled={selectedIds.size === 0 && selectedDepartmentIds.size === 0}
                                testID='contacts.batch_move.next'
                            >
                                <Text style={styles.bottomButtonText}>
                                    {intl.formatMessage({id: 'contacts.next_step', defaultMessage: 'Next'})}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </>
                )}
            </SafeAreaView>
        );
    }

    /** 根目录下不显示左上角箭头（仅退到上一级部门时显示） */
    const showBackArrow = targetStack.length > 1;

    return (
        <SafeAreaView
            edges={SAFE_AREA_EDGES}
            style={[styles.flex, {backgroundColor: theme.sidebarBg}]}
            testID='contacts.batch_move_members.screen'
        >
            <View style={styles.header}>
                {showBackArrow ? (
                    <TouchableOpacity
                        style={styles.headerBackWrap}
                        onPress={handleBack}
                        testID='contacts.batch_move.back'
                    >
                        <CompassIcon
                            name='arrow-left'
                            size={24}
                            color={theme.sidebarText}
                        />
                    </TouchableOpacity>
                ) : (
                    <View style={styles.headerBackWrap}/>
                )}
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>
                        {intl.formatMessage({id: 'contacts.select_target_department', defaultMessage: 'Select target department'})}
                    </Text>
                    <Text
                        style={styles.headerSubtitle}
                        numberOfLines={1}
                    >{subtitle}</Text>
                </View>
                <TouchableOpacity
                    style={styles.headerCloseWrap}
                    onPress={handleClose}
                    testID='contacts.batch_move.close'
                >
                    <CompassIcon
                        name='close'
                        size={24}
                        color={theme.sidebarText}
                    />
                </TouchableOpacity>
            </View>
            {targetLoading ? (
                <View style={styles.loadingContainer}>
                    <Loading
                        color={theme.centerChannelColor}
                        size='small'
                    />
                </View>
            ) : (
                <>
                    <ScrollView
                        style={[styles.flex, {backgroundColor: theme.centerChannelBg}]}
                        contentContainerStyle={{paddingBottom: 24}}
                        showsVerticalScrollIndicator={false}
                    >
                        {targetDepartments.map((dept) => {
                            const disabled = selectedDepartmentIds.has(dept.id);
                            return (
                                <TouchableOpacity
                                    key={dept.id}
                                    style={[styles.deptRow, disabled && styles.deptRowDisabled]}
                                    onPress={() => {
                                        if (!disabled) {
                                            handleSelectTargetDepartment(dept);
                                        }
                                    }}
                                    activeOpacity={0.7}
                                    disabled={disabled}
                                    testID={`contacts.batch_move.target_dept.${dept.id}`}
                                >
                                    <View style={styles.folderIcon}>
                                        <CompassIcon
                                            name='folder-outline'
                                            size={24}
                                            color={theme.linkColor}
                                        />
                                    </View>
                                    <Text
                                        style={styles.listItemName}
                                        numberOfLines={1}
                                    >{dept.name}</Text>
                                    <CompassIcon
                                        name='chevron-right'
                                        size={24}
                                        color={changeOpacity(theme.centerChannelColor, 0.5)}
                                    />
                                </TouchableOpacity>
                            );
                        })}
                        {targetDepartments.length === 0 && targetDepartmentId == null && (
                            <Text style={styles.emptyMessage}>
                                {intl.formatMessage({id: 'contacts.no_departments', defaultMessage: 'No departments'})}
                            </Text>
                        )}
                    </ScrollView>
                    <View style={styles.bottomBar}>
                        {(movableDepartmentIds.length > 0 || movableMemberIds.length > 0) && (
                            <View style={styles.bottomBarChipsWrap}>
                                <ScrollView
                                    horizontal={true}
                                    showsHorizontalScrollIndicator={true}
                                    contentContainerStyle={styles.bottomBarChipsScroll}
                                >
                                    <View style={styles.bottomBarChipsRow}>
                                        {movableDepartmentIds.map((id) => (
                                            <View
                                                key={`td-d-${id}`}
                                                style={styles.selectedChip}
                                            >
                                                <View style={styles.selectedChipIcon}>
                                                    <CompassIcon
                                                        name='folder-outline'
                                                        size={14}
                                                        color={theme.linkColor}
                                                    />
                                                </View>
                                                <Text style={styles.selectedChipText}>
                                                    {selectedDepartmentNames[id] ?? ''}
                                                </Text>
                                            </View>
                                        ))}
                                        {movableMemberIds.map((id) => (
                                            <View
                                                key={`td-m-${id}`}
                                                style={styles.selectedChip}
                                            >
                                                <View style={styles.selectedChipIcon}>
                                                    <CompassIcon
                                                        name='account-outline'
                                                        size={14}
                                                        color={theme.linkColor}
                                                    />
                                                </View>
                                                <Text style={styles.selectedChipText}>
                                                    {selectedMemberNames[id] ?? ''}
                                                </Text>
                                            </View>
                                        ))}
                                    </View>
                                </ScrollView>
                            </View>
                        )}
                        <Text style={styles.bottomBarSummary}>
                            {intl.formatMessage(
                                {id: 'contacts.selected_summary', defaultMessage: '{memberCount} member(s), {departmentCount} department(s) selected'},
                                {memberCount: movableMemberIds.length, departmentCount: movableDepartmentIds.length},
                            )}
                        </Text>
                        <TouchableOpacity
                            style={[
                                styles.bottomButton,
                                (moving || (isAtRootLevel ? !canMoveToRoot : !canMoveToTarget) || !hasMovableItems) && styles.bottomButtonDisabled,
                            ]}
                            onPress={handleMoveHere}
                            disabled={moving || (isAtRootLevel ? !canMoveToRoot : !canMoveToTarget) || !hasMovableItems}
                            activeOpacity={0.8}
                            testID='contacts.batch_move.move_here'
                        >
                            <Text style={styles.bottomButtonText}>
                                {isAtRootLevel? intl.formatMessage({id: 'contacts.move_to_root', defaultMessage: 'Move to root (default department)'}): intl.formatMessage(
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
