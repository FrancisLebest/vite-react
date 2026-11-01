import React, {createContext, useContext, useMemo, useReducer} from 'react';
import * as mock from '../data/mock';
import type {
  AppNotification,
  Comment,
  Community,
  Conversation,
  Post,
  User,
} from '../data/types';

interface State {
  users: User[];
  posts: Post[];
  comments: Record<string, Comment[]>;
  communities: Community[];
  conversations: Conversation[];
  notifications: AppNotification[];
  following: Record<string, boolean>;
  liked: Record<string, boolean>;
  bookmarked: Record<string, boolean>;
  joined: Record<string, boolean>;
}

type Action =
  | {type: 'toggleFollow'; userId: string}
  | {type: 'toggleLike'; id: string}
  | {type: 'toggleBookmark'; id: string}
  | {type: 'toggleJoin'; communityId: string}
  | {type: 'addPost'; post: Post}
  | {type: 'addComment'; targetId: string; text: string}
  | {type: 'createCommunity'; community: Community}
  | {type: 'sendMessage'; conversationId: string; text: string}
  | {type: 'markConversationRead'; conversationId: string}
  | {type: 'ensureConversation'; user: User}
  | {type: 'markNotificationsRead'};

export const initialState: State = {
  users: mock.users,
  posts: mock.posts,
  comments: mock.initialComments,
  communities: mock.communities,
  conversations: mock.conversations,
  notifications: mock.notifications,
  following: {u8: true, u3: true},
  liked: {},
  bookmarked: {},
  joined: {k1: true, k4: true, k5: true},
};

const toggle = (map: Record<string, boolean>, key: string) => ({
  ...map,
  [key]: !map[key],
});

/** Stable id of the 1:1 conversation with a user. */
export const dmId = (userId: string) => `dm_${userId}`;

let idCounter = 0;
export const newId = (prefix: string) =>
  `${prefix}_${Date.now()}_${idCounter++}`;

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'toggleFollow':
      return {...state, following: toggle(state.following, action.userId)};
    case 'toggleLike':
      return {...state, liked: toggle(state.liked, action.id)};
    case 'toggleBookmark':
      return {...state, bookmarked: toggle(state.bookmarked, action.id)};
    case 'toggleJoin':
      return {...state, joined: toggle(state.joined, action.communityId)};
    case 'addPost':
      return {...state, posts: [action.post, ...state.posts]};
    case 'addComment':
      return {
        ...state,
        comments: {
          ...state.comments,
          [action.targetId]: [
            ...(state.comments[action.targetId] ?? []),
            {
              id: newId('cm'),
              authorId: mock.ME_ID,
              text: action.text,
              createdAt: Date.now(),
            },
          ],
        },
      };
    case 'createCommunity':
      return {
        ...state,
        communities: [action.community, ...state.communities],
        joined: {...state.joined, [action.community.id]: true},
      };
    case 'sendMessage': {
      const conv = state.conversations.find(
        c => c.id === action.conversationId,
      );
      if (!conv) {
        return state;
      }
      const updated: Conversation = {
        ...conv,
        messages: [
          ...conv.messages,
          {
            id: newId('m'),
            fromMe: true,
            text: action.text,
            createdAt: Date.now(),
          },
        ],
      };
      // Move the conversation to the top, like a real inbox.
      return {
        ...state,
        conversations: [
          updated,
          ...state.conversations.filter(c => c.id !== conv.id),
        ],
      };
    }
    case 'markConversationRead':
      return {
        ...state,
        conversations: state.conversations.map(c =>
          c.id === action.conversationId ? {...c, unread: 0} : c,
        ),
      };
    case 'ensureConversation': {
      if (state.conversations.some(c => c.id === dmId(action.user.id))) {
        return state;
      }
      const conv: Conversation = {
        id: dmId(action.user.id),
        title: action.user.name,
        userId: action.user.id,
        unread: 0,
        kind: 'message',
        messages: [],
      };
      return {...state, conversations: [conv, ...state.conversations]};
    }
    case 'markNotificationsRead':
      return {
        ...state,
        notifications: state.notifications.map(n => ({...n, read: true})),
      };
    default:
      return state;
  }
}

interface AppContextValue {
  state: State;
  dispatch: React.Dispatch<Action>;
  me: User;
  getUser: (id: string) => User;
  unreadMessages: number;
  unreadNotifications: number;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({children}: {children: React.ReactNode}) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const value = useMemo<AppContextValue>(() => {
    const byId: Record<string, User> = {};
    state.users.forEach(u => (byId[u.id] = u));
    const getUser = (id: string) => byId[id] ?? byId[mock.ME_ID];
    return {
      state,
      dispatch,
      me: byId[mock.ME_ID],
      getUser,
      unreadMessages: state.conversations.filter(c => c.unread > 0).length,
      unreadNotifications: state.notifications.filter(n => !n.read).length,
    };
  }, [state]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used inside <AppProvider>');
  }
  return ctx;
}
