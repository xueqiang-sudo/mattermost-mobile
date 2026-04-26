// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState, useRef} from 'react';
import {type IntlShape, useIntl} from 'react-intl';
import {Keyboard} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {searchEmployeeCandidates} from '@actions/remote/candidate_search';
import {addUserToDefaultDepartment, addUserToDepartment} from '@actions/remote/contact_new';
import {getTeamMembersByIds} from '@actions/remote/team';
import CompassIcon from '@components/compass_icon';
import Loading from '@components/loading';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import SecurityManager from '@managers/security_manager';
import {dismissModal, setButtons} from '@screens/navigation';
import {mergeNavigationOptions} from '@utils/navigation';
import {makeStyleSheetFromTheme, changeOpacity} from '@utils/theme';
import {secureGetFromRecord} from '@utils/types';

import {sendGuestInvites, sendMembersInvites} from './actions';
import Selection from './selection';
import Summary from './summary';

import type {InviteCandidate, InviteCandidateTag, InviteResult, Result, SearchResult, SendOptions} from './types';
import type {AvailableScreens, NavButtons} from '@typings/screens/navigation';
import type {OptionsTopBarButton} from 'react-native-navigation';

const CLOSE_BUTTON_ID = 'close-invite';
const SELECT_ALL_BUTTON_ID = 'select-all-invite';
const SEND_BUTTON_ID = 'send-invite';
const TIMEOUT_MILLISECONDS = 200;
const DEFAULT_RESULT = {sent: [], notSent: []};

const makeLeftButton = (theme: Theme): OptionsTopBarButton => ({
    id: CLOSE_BUTTON_ID,
    icon: CompassIcon.getImageSourceSync('close', 24, theme.sidebarHeaderTextColor),
    testID: 'invite.close.button',
});

const makeRightButton = (
    theme: Theme,
    formatMessage: IntlShape['formatMessage'],
    enabled: boolean,
): OptionsTopBarButton => ({
    id: SEND_BUTTON_ID,
    text: formatMessage({id: 'invite.add_selected', defaultMessage: 'Add to enterprise'}),
    showAsAction: 'always',
    testID: 'invite.send.button',
    color: theme.sidebarHeaderTextColor,
    disabledColor: changeOpacity(theme.sidebarHeaderTextColor, 0.4),
    enabled,
});

const makeSelectAllButton = (
    theme: Theme,
    formatMessage: IntlShape['formatMessage'],
    enabled: boolean,
    allSelected: boolean,
): OptionsTopBarButton => ({
    id: SELECT_ALL_BUTTON_ID,
    text: allSelected ? (
        formatMessage({id: 'contacts.deselect_all', defaultMessage: 'Deselect all'})
    ) : (
        formatMessage({id: 'contacts.select_all', defaultMessage: 'Select all'})
    ),
    showAsAction: 'always',
    testID: 'invite.select_all.button',
    color: theme.sidebarHeaderTextColor,
    disabledColor: changeOpacity(theme.sidebarHeaderTextColor, 0.4),
    enabled,
});

const closeModal = async () => {
    Keyboard.dismiss();
    await dismissModal();
};

const getStyleSheet = makeStyleSheetFromTheme(() => {
    return {
        container: {
            flex: 1,
            flexDirection: 'column',
        },
        loadingContainer: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
        },
    };
});

enum Stage {
    SELECTION = 'selection',
    RESULT = 'result',
    LOADING = 'loading',
}

type InviteProps = {
    componentId: AvailableScreens;
    teamId: string;
    teamDisplayName: string;
    teamLastIconUpdate: number;
    teamInviteId: string;
    isAdmin: boolean;
    canInviteGuests: boolean;
    allowGuestMagicLink: boolean;
    currentUserId?: string;

    /** 从企业通讯录入口打开邀请时，传入目标部门 ID（null 表示默认部门） */
    contactTargetDepartmentId?: number | null;
}

export default function Invite(props: InviteProps) {
    const {
        componentId,
        teamId,
        teamDisplayName,
        teamLastIconUpdate,
        teamInviteId,
        isAdmin,
        canInviteGuests,
        allowGuestMagicLink,
        currentUserId,
        contactTargetDepartmentId,
    } = props;
    const intl = useIntl();
    const {formatMessage} = intl;
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const serverUrl = useServerUrl();

    const searchTimeoutId = useRef<NodeJS.Timeout | null>(null);
    const retryTimeoutId = useRef<NodeJS.Timeout | null>(null);

    const [term, setTerm] = useState('');
    const [searchResults, setSearchResults] = useState<InviteCandidate[]>([]);
    const [selectedIds, setSelectedIds] = useState<{[id: string]: SearchResult}>({});
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<Result>(DEFAULT_RESULT);
    const [stage, setStage] = useState(Stage.SELECTION);
    const [sendError, setSendError] = useState('');

    const [sendOptions, setSendOptions] = useState<SendOptions>({
        inviteAsGuest: false,
        includeCustomMessage: false,
        customMessage: '',
        selectedChannels: [],
        guestMagicLink: false,
    });

    const isResult = stage === Stage.RESULT;
    const isSelecting = stage === Stage.SELECTION;

    const selectedCount = Object.keys(selectedIds).length;
    const hasSelection = selectedCount > 0;
    const selectableCandidates = searchResults.filter((candidate) => !candidate.isAlreadyJoined);
    const selectableIds = selectableCandidates.map((candidate) => candidate.user.id);
    const hasSelectable = selectableIds.length > 0;
    const isAllSelectableSelected = hasSelectable && selectableIds.every((id) => Boolean(selectedIds[id]));

    const handleClearSearch = useCallback(() => {
        setTerm('');
        setSearchResults([]);
    }, []);

    const searchUsers = useCallback(async (searchTerm: string) => {
        if (searchTerm === '') {
            handleClearSearch();
            return;
        }

        const candidates = await searchEmployeeCandidates(serverUrl, teamId, currentUserId ?? '', searchTerm.toLowerCase());
        const users = candidates.map((candidate) => candidate.user).filter(Boolean) as UserProfile[];
        const userIds = users.map((u) => u.id);
        const alreadyJoinedIds = new Set<string>();

        if (userIds.length) {
            const {members = []} = await getTeamMembersByIds(serverUrl, teamId, userIds);
            for (const member of members) {
                alreadyJoinedIds.add(member.user_id);
            }
        }

        const candidateByUserId = new Map(candidates.map((candidate) => [candidate.userId, candidate]));
        const results: InviteCandidate[] = users.map((user) => {
            const matched = candidateByUserId.get(user.id);
            const tags: InviteCandidateTag[] = [];
            if (matched?.sourceFlags.globalSearch) {
                tags.push('exactMatch');
            }
            if (matched?.sourceFlags.self) {
                tags.push('self');
            }
            if (matched?.sourceFlags.customer) {
                tags.push('customer');
            }
            if (matched?.sourceFlags.supplier) {
                tags.push('supplier');
            }
            if (matched?.sourceFlags.enterpriseSearch) {
                tags.push('enterprise');
            }
            return {
                user,
                tags,
                isAlreadyJoined: alreadyJoinedIds.has(user.id),
            };
        });

        results.sort((a, b) => {
            if (a.isAlreadyJoined === b.isAlreadyJoined) {
                return 0;
            }
            return a.isAlreadyJoined ? 1 : -1;
        });

        setSearchResults(results);
    }, [currentUserId, handleClearSearch, serverUrl, teamId]);

    const handleReset = useCallback(() => {
        setSendError('');
        setTerm('');
        setSearchResults([]);
        setResult(DEFAULT_RESULT);
        setStage(Stage.SELECTION);
    }, []);

    const handleSearchChange = useCallback((text: string) => {
        setLoading(true);
        if (text !== term) {
            setSelectedIds({});
        }
        setTerm(text);

        if (searchTimeoutId.current) {
            clearTimeout(searchTimeoutId.current);
        }

        searchTimeoutId.current = setTimeout(async () => {
            await searchUsers(text);
            setLoading(false);
        }, TIMEOUT_MILLISECONDS);
    }, [searchUsers, term]);

    const handleSelectItem = useCallback((item: SearchResult) => {
        const email = typeof item === 'string';
        const id = email ? item : item.id;
        const newSelectedIds = Object.assign({}, selectedIds);

        if (secureGetFromRecord(selectedIds, id)) {
            Reflect.deleteProperty(newSelectedIds, id);
        } else {
            newSelectedIds[id] = item;
        }

        setSelectedIds(newSelectedIds);
    }, [selectedIds]);

    const handleSendError = useCallback(() => {
        setSendError(formatMessage({id: 'invite.send_error', defaultMessage: 'Something went wrong while trying to send invitations. Please check your network connection and try again.'}));
        setResult(DEFAULT_RESULT);
        setStage(Stage.RESULT);
    }, [formatMessage]);

    const handleSelectAll = useCallback(() => {
        if (!hasSelectable) {
            return;
        }

        const updated = {...selectedIds};

        if (isAllSelectableSelected) {
            for (const id of selectableIds) {
                Reflect.deleteProperty(updated, id);
            }
            setSelectedIds(updated);
            return;
        }

        for (const candidate of selectableCandidates) {
            updated[candidate.user.id] = candidate.user;
        }
        setSelectedIds(updated);
    }, [hasSelectable, isAllSelectableSelected, selectableCandidates, selectableIds, selectedIds]);

    const addSentUsersToDepartment = useCallback(async (sent: InviteResult[]) => {
        const targetDepartmentId = (typeof contactTargetDepartmentId === 'number') ? contactTargetDepartmentId : null;

        await Promise.all(sent.map(async (item) => {
            if (!item.userId) {
                return;
            }

            const selected = selectedIds[item.userId];
            if (!selected || typeof selected === 'string') {
                return;
            }

            const uid = selected.id;
            if (typeof targetDepartmentId === 'number') {
                await addUserToDepartment(serverUrl, teamId, targetDepartmentId, uid);
                return;
            }

            await addUserToDefaultDepartment(serverUrl, teamId, uid);
        }));
    }, [contactTargetDepartmentId, selectedIds, serverUrl, teamId]);

    const handleSend = useCallback(async () => {
        if (!hasSelection) {
            return;
        }

        setStage(Stage.LOADING);

        if (sendOptions.inviteAsGuest) {
            const {sent, notSent} = await sendGuestInvites(serverUrl, teamId, selectedIds, sendOptions, formatMessage);
            setResult({sent, notSent});
            setStage(Stage.RESULT);
            await addSentUsersToDepartment(sent);
            return;
        }

        const {sent, notSent, error} = await sendMembersInvites(serverUrl, teamId, selectedIds, isAdmin, teamDisplayName, formatMessage);
        if (error) {
            handleSendError();
        } else {
            setResult({sent, notSent});
            setStage(Stage.RESULT);
            await addSentUsersToDepartment(sent);
        }
    }, [addSentUsersToDepartment, formatMessage, handleSendError, isAdmin, hasSelection, selectedIds, sendOptions, serverUrl, teamDisplayName, teamId]);

    const handleRetry = useCallback(() => {
        setSendError('');
        setStage(Stage.LOADING);

        retryTimeoutId.current = setTimeout(() => {
            handleSend();
        }, TIMEOUT_MILLISECONDS);
    }, [handleSend]);

    useNavButtonPressed(CLOSE_BUTTON_ID, componentId, closeModal, [closeModal]);
    useNavButtonPressed(SELECT_ALL_BUTTON_ID, componentId, handleSelectAll, [handleSelectAll]);
    useNavButtonPressed(SEND_BUTTON_ID, componentId, handleSend, [handleSend]);

    useEffect(() => {
        const buttons: NavButtons = {
            leftButtons: [makeLeftButton(theme)],
            rightButtons: isSelecting ? [
                makeRightButton(theme, formatMessage, hasSelection),
                makeSelectAllButton(theme, formatMessage, hasSelectable, isAllSelectableSelected),
            ] : [],
        };

        setButtons(componentId, buttons);
    }, [theme, componentId, hasSelectable, hasSelection, isSelecting, formatMessage, isAllSelectableSelected]);

    useEffect(() => {
        mergeNavigationOptions(componentId, {
            topBar: {
                title: {
                    color: theme.sidebarHeaderTextColor,
                    text: isResult ? (
                        formatMessage({id: 'invite.title.summary', defaultMessage: 'Invitation results'})
                    ) : (
                        formatMessage({id: 'invite.title', defaultMessage: 'Invite people to enterprise'})
                    ),
                },
            },
        });
    }, [componentId, formatMessage, isResult, theme]);

    useEffect(() => {
        return () => {
            if (searchTimeoutId.current) {
                clearTimeout(searchTimeoutId.current);
            }

            if (retryTimeoutId.current) {
                clearTimeout(retryTimeoutId.current);
            }
        };
    }, []);

    useAndroidHardwareBackHandler(componentId, closeModal);

    const renderContent = () => {
        switch (stage) {
            case Stage.LOADING:
                return (
                    <Loading
                        containerStyle={styles.loadingContainer}
                        size='large'
                        color={theme.centerChannelColor}
                    />
                );
            case Stage.RESULT:
                return (
                    <Summary
                        result={result}
                        selectedIds={selectedIds}
                        error={sendError}
                        onClose={closeModal}
                        onRetry={handleRetry}
                        onBack={handleReset}
                        testID='invite.screen.summary'
                    />
                );
            default:
                return (
                    <Selection
                        teamId={teamId}
                        teamDisplayName={teamDisplayName}
                        teamLastIconUpdate={teamLastIconUpdate}
                        teamInviteId={teamInviteId}
                        serverUrl={serverUrl}
                        term={term}
                        searchResults={searchResults}
                        selectedIds={selectedIds}
                        loading={loading}
                        onSearchChange={handleSearchChange}
                        onSelectItem={handleSelectItem}
                        onClose={closeModal}
                        testID='invite.screen.selection'
                        sendOptions={sendOptions}
                        onSendOptionsChange={setSendOptions}
                        canInviteGuests={canInviteGuests}
                        allowGuestMagicLink={allowGuestMagicLink}
                    />
                );
        }
    };

    return (
        <SafeAreaView
            style={styles.container}
            testID='invite.screen'
            nativeID={SecurityManager.getShieldScreenId(componentId)}
        >
            {renderContent()}
        </SafeAreaView>
    );
}
