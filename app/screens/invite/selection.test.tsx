// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {type ComponentProps} from 'react';

import FloatingTextInput from '@components/floating_input/floating_text_input_label';
import OptionItem from '@components/option_item';
import {Screens} from '@constants';
import {goToScreen} from '@screens/navigation';
import {fireEvent, renderWithIntl} from '@test/intl-test-helper';

import Selection from './selection';
import SelectionSearchBar from './selection_search_bar';
import SelectionTeamBar from './selection_team_bar';
import TextItem from './text_item';
import {TextItemType} from './types';

jest.mock('./selection_search_bar');
jest.mocked(SelectionSearchBar).mockImplementation(
    (props) => React.createElement('SelectionSearchBar', {testID: 'selection-search-bar', ...props}),
);

jest.mock('./selection_team_bar');
jest.mocked(SelectionTeamBar).mockImplementation(
    (props) => React.createElement('SelectionTeamBar', {testID: 'selection-team-bar', ...props}),
);

jest.mock('./text_item');
jest.mocked(TextItem).mockImplementation(
    (props) => React.createElement('TextItem', {...props}),
);

jest.mock('@components/option_item', () => ({
    __esModule: true,
    default: jest.fn(),
}));
jest.mocked(OptionItem).mockImplementation(
    (props) => React.createElement('OptionItem', {testID: 'option-item', ...props}),
);

jest.mock('@components/floating_input/floating_text_input_label', () => ({
    __esModule: true,
    default: jest.fn(),
}));
jest.mocked(FloatingTextInput).mockImplementation(
    (props) => React.createElement('FloatingTextInput', {testID: 'floating-text-input', ...props}),
);

jest.mock('@screens/navigation', () => ({
    goToScreen: jest.fn(),
}));

describe('Selection', () => {
    const mockOnSearchChange = jest.fn();
    const mockOnSelectItem = jest.fn();
    const mockOnClose = jest.fn().mockResolvedValue(undefined);
    const mockOnSendOptionsChange = jest.fn();

    function getBaseProps(): ComponentProps<typeof Selection> {
        return {
            teamId: 'team-1',
            teamDisplayName: 'Test Team',
            teamLastIconUpdate: 1234567890,
            teamInviteId: 'invite-id-1',
            serverUrl: 'https://test.server.com',
            term: '',
            searchResults: [],
            selectedIds: {},
            loading: false,
            testID: 'invite.selection',
            sendOptions: {
                inviteAsGuest: false,
                includeCustomMessage: false,
                customMessage: '',
                selectedChannels: [],
                guestMagicLink: false,
            },
            onSendOptionsChange: mockOnSendOptionsChange,
            onSearchChange: mockOnSearchChange,
            onSelectItem: mockOnSelectItem,
            onClose: mockOnClose,
            canInviteGuests: true,
            allowGuestMagicLink: true,
        };
    }

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('renders correctly', () => {
        const props = getBaseProps();
        const {getByTestId} = renderWithIntl(<Selection {...props}/>);

        expect(getByTestId('selection-search-bar')).toBeTruthy();
        expect(getByTestId('selection-team-bar')).toBeTruthy();
    });

    it('renders search results correctly', () => {
        const props = getBaseProps();
        const user = {id: 'user-1', username: 'user1'} as UserProfile;
        props.searchResults = [{
            user,
            tags: ['exactMatch', 'customer'],
            isAlreadyJoined: false,
        }];
        props.term = 'test';

        const {getByTestId, getByText} = renderWithIntl(<Selection {...props}/>);

        expect(getByTestId('invite.search_list')).toBeVisible();
        expect(getByText('user1')).toBeTruthy();
        expect(getByText('Exact match')).toBeTruthy();
        expect(getByText('Choose')).toBeTruthy();
        expect(getByText('My customer')).toBeTruthy();
        const row = getByTestId('invite.search_list_item.user-1');
        fireEvent.press(row);
        expect(mockOnSelectItem).toHaveBeenCalledTimes(1);
        expect(mockOnSelectItem).toHaveBeenCalledWith(user);
    });

    it('does not trigger selection for already joined users', () => {
        const props = getBaseProps();
        const user = {id: 'joined-user', username: 'joined'} as UserProfile;
        props.searchResults = [{
            user,
            tags: ['alreadyJoined'],
            isAlreadyJoined: true,
        }];
        props.term = 'joined';

        const {getByTestId, getByText} = renderWithIntl(<Selection {...props}/>);

        expect(getByText('Added')).toBeTruthy();
        const row = getByTestId('invite.search_list_item.joined-user');
        fireEvent.press(row);
        expect(mockOnSelectItem).not.toHaveBeenCalled();
    });

    it('renders no results message when term exists and no results', () => {
        const props = getBaseProps();
        props.term = 'nonexistent';
        props.searchResults = [];
        props.loading = false;

        const {getByTestId} = renderWithIntl(<Selection {...props}/>);

        const textItem = getByTestId('invite.search_list_no_results');
        expect(textItem).toHaveProp('text', 'nonexistent');
        expect(textItem).toHaveProp('type', TextItemType.SEARCH_NO_RESULTS);
    });

    it('renders empty hint when term is empty', () => {
        const props = getBaseProps();
        props.term = '';
        props.searchResults = [];
        props.loading = false;

        const {getByText} = renderWithIntl(<Selection {...props}/>);

        expect(getByText('Search to select people to invite')).toBeTruthy();
        expect(getByText('Enter a name, phone number, or username to see candidates.')).toBeTruthy();
    });

    it('renders invite as guest option when canInviteGuests is true', () => {
        const props = getBaseProps();
        const {getByTestId} = renderWithIntl(<Selection {...props}/>);

        const optionItem = getByTestId('invite.invite_as_guest');
        expect(optionItem).toHaveProp('label', 'Invite as guest');
        expect(optionItem).toHaveProp('type', 'toggle');
        expect(optionItem).toHaveProp('selected', false);
        expect(optionItem).toHaveProp('action', expect.any(Function));
        expect(optionItem).toHaveProp('testID', 'invite.invite_as_guest');
        optionItem.props.action();
        expect(mockOnSendOptionsChange).toHaveBeenCalledTimes(1);
        const setStateFunction = mockOnSendOptionsChange.mock.calls[0][0];
        const result = setStateFunction(props.sendOptions);
        expect(result.inviteAsGuest).toBe(true);
    });

    it('does not render invite as guest option when canInviteGuests is false', () => {
        const props = getBaseProps();
        props.canInviteGuests = false;

        const {queryByTestId} = renderWithIntl(<Selection {...props}/>);

        // The invite as guest option should not be rendered
        const optionItem = queryByTestId('invite.invite_as_guest');
        expect(optionItem).toBeNull();
    });

    it('renders custom message input when includeCustomMessage is true', () => {
        const props = getBaseProps();
        props.sendOptions = {
            inviteAsGuest: true,
            includeCustomMessage: true,
            customMessage: 'Test message',
            selectedChannels: [],
            guestMagicLink: false,
        };

        const {getByTestId} = renderWithIntl(<Selection {...props}/>);

        expect(getByTestId('invite.custom_message')).toBeTruthy();
    });

    it('handles channel selection', () => {
        const props = getBaseProps();
        props.sendOptions = {
            inviteAsGuest: true,
            includeCustomMessage: false,
            customMessage: '',
            selectedChannels: [],
            guestMagicLink: false,
        };

        const {getByTestId} = renderWithIntl(<Selection {...props}/>);

        const channelOption = getByTestId('invite.selected_channels');
        channelOption.props.action();
        expect(goToScreen).toHaveBeenCalledWith(
            Screens.INTEGRATION_SELECTOR,
            expect.any(String),
            expect.objectContaining({
                dataSource: 'channels',
                isMultiselect: true,
            }),
        );
    });

    it('renders guest magic link option when guestMagicLink is true', () => {
        const props = getBaseProps();
        props.allowGuestMagicLink = true;
        props.sendOptions = {
            inviteAsGuest: true,
            includeCustomMessage: false,
            customMessage: '',
            selectedChannels: [],
            guestMagicLink: false,
        };

        const {getByTestId} = renderWithIntl(<Selection {...props}/>);

        const optionItem = getByTestId('invite.guest_magic_link');
        expect(optionItem).toHaveProp('label', 'Allow newly created guests to login without password');
        expect(optionItem).toHaveProp('type', 'toggle');
        expect(optionItem).toHaveProp('selected', false);

        optionItem.props.action();
        expect(mockOnSendOptionsChange).toHaveBeenCalledTimes(1);
        const setStateFunction = mockOnSendOptionsChange.mock.calls[0][0];
        const result = setStateFunction(props.sendOptions);
        expect(result.guestMagicLink).toBe(true);
    });

    it('does not render guest magic link option when allowGuestMagicLink is false', () => {
        const props = getBaseProps();
        props.allowGuestMagicLink = false;
        props.sendOptions = {
            inviteAsGuest: true,
            includeCustomMessage: false,
            customMessage: '',
            selectedChannels: [],
            guestMagicLink: false,
        };
        const {queryByTestId} = renderWithIntl(<Selection {...props}/>);

        const optionItem = queryByTestId('invite.guest_magic_link');
        expect(optionItem).toBeNull();
    });

    it('passes correct props to SelectionSearchBar', () => {
        const props = getBaseProps();
        props.term = 'test search';

        renderWithIntl(<Selection {...props}/>);

        const searchBar = jest.mocked(SelectionSearchBar).mock.calls[0][0];
        expect(searchBar.term).toBe('test search');
        expect(searchBar.onSearchChange).toBe(mockOnSearchChange);
    });

    it('passes correct props to SelectionTeamBar', () => {
        const props = getBaseProps();

        renderWithIntl(<Selection {...props}/>);

        const teamBar = jest.mocked(SelectionTeamBar).mock.calls[0][0];
        expect(teamBar.teamId).toBe('team-1');
        expect(teamBar.teamDisplayName).toBe('Test Team');
        expect(teamBar.onClose).toBe(mockOnClose);
    });

});

