import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import {QueryClient} from '@tanstack/react-query';
import * as Keychain from 'react-native-keychain';
import App from '../App';
import {client} from '../src/api';
import {createFetchMock, Handler, page} from './helpers/fetchMock';
import {me, summary, videoPost} from './helpers/fixtures';

const keychainStore = (
  Keychain as unknown as {__store: Map<string, {password: string}>}
).__store;
const SERVICE = 'com.studyhub.auth';

const clients: QueryClient[] = [];
function newQueryClient() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: {retry: false, cacheTime: Infinity},
      // no 5-minute GC timers left behind after the test
      mutations: {retry: false, cacheTime: 0},
    },
  });
  clients.push(qc);
  return qc;
}

afterEach(() => {
  clients.splice(0).forEach(qc => qc.clear());
});

const signedInRoutes: Record<string, Handler> = {
  'GET /auth/me': () => ({body: me}),
  'GET /feed': req =>
    req.query.get('type') === 'video'
      ? {body: page([videoPost()])}
      : {
          body: page([
            videoPost({
              id: 'p2',
              type: 'post',
              media: null,
              text: 'Popular notes',
            }),
          ]),
        },
  'GET /conversations/unread-count': () => ({body: {count: 2}}),
  'GET /notifications/unread-count': () => ({body: {count: 5}}),
  'GET /categories': () => ({
    body: [{id: 'math', label: 'Math', icon: 'calculator-outline'}],
  }),
  'GET /trending/topics': () => ({
    body: [
      {
        id: 'math',
        label: 'Mathematics',
        icon: 'calculator-outline',
        postCount: 12,
      },
    ],
  }),
  'GET /users/suggested': () => ({
    body: [summary({id: 'u3', name: 'Omar Said'})],
  }),
  'POST /posts/p1/like': () => ({body: {liked: true, likeCount: 11}}),
  'POST /posts/p1/view': () => ({status: 204}),
};

async function signIn() {
  keychainStore.set(SERVICE, {
    password: JSON.stringify({accessToken: 'A1', refreshToken: 'R1'}),
  });
}

beforeEach(async () => {
  keychainStore.clear();
  await client.setTokens(null);
  jest.clearAllMocks();
});

describe('auth flow', () => {
  it('shows the welcome screen when no session is stored', async () => {
    const {fetch} = createFetchMock({});
    globalThis.fetch = fetch;
    render(<App queryClient={newQueryClient()} />);
    expect(
      await screen.findByText('Learn together. Share smarter.'),
    ).toBeTruthy();
    expect(screen.getByText('I already have an account')).toBeTruthy();
  });

  it('validates the login form inline, then signs in and stores tokens in the Keychain', async () => {
    const {fetch, calls} = createFetchMock({
      ...signedInRoutes,
      'POST /auth/login': req => {
        const body = req.body as {identifier: string; password: string};
        return body.password === 'secret123'
          ? {body: {user: me, accessToken: 'A1', refreshToken: 'R1'}}
          : {
              status: 401,
              body: {
                error: {code: 'UNAUTHORIZED', message: 'Invalid credentials'},
              },
            };
      },
    });
    globalThis.fetch = fetch;
    render(<App queryClient={newQueryClient()} />);
    fireEvent.press(await screen.findByText('I already have an account'));

    // Empty submit → inline errors, no request.
    fireEvent.press(await screen.findByText('Sign in'));
    expect(
      await screen.findByText('Email or username is required.'),
    ).toBeTruthy();
    expect(screen.getByText('Password is required.')).toBeTruthy();
    expect(calls.some(c => c.path === '/auth/login')).toBe(false);

    fireEvent.changeText(screen.getByLabelText('Email or username'), 'youssef');
    fireEvent.changeText(screen.getByLabelText('Password'), 'wrong');
    fireEvent.press(screen.getByText('Sign in'));
    expect(
      await screen.findByText('Incorrect email/username or password.'),
    ).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText('Password'), 'secret123');
    fireEvent.press(screen.getByText('Sign in'));

    // Home feed with the API video.
    expect(await screen.findByText('Derivatives in 60 seconds')).toBeTruthy();
    expect(JSON.parse(keychainStore.get(SERVICE)!.password)).toEqual({
      accessToken: 'A1',
      refreshToken: 'R1',
    });
    const feedCall = calls.find(c => c.path === '/feed');
    expect(feedCall?.headers.Authorization).toBe('Bearer A1');
  });

  it('restores the session from the Keychain and logs out when the refresh token is rejected', async () => {
    await signIn();
    const {fetch} = createFetchMock({
      'GET /auth/me': () => ({
        status: 401,
        body: {error: {code: 'UNAUTHORIZED', message: 'expired'}},
      }),
      'POST /auth/refresh': () => ({
        status: 401,
        body: {error: {code: 'UNAUTHORIZED', message: 'revoked'}},
      }),
    });
    globalThis.fetch = fetch;
    render(<App queryClient={newQueryClient()} />);
    expect(
      await screen.findByText('Learn together. Share smarter.'),
    ).toBeTruthy();
    expect(keychainStore.has(SERVICE)).toBe(false);
  });
});

describe('signed-in screens', () => {
  it('renders the video feed with badges and likes optimistically', async () => {
    await signIn();
    let resolveLike: (v: unknown) => void = () => undefined;
    const {fetch, calls} = createFetchMock({
      ...signedInRoutes,
      'POST /posts/p1/like': () =>
        new Promise(r => {
          resolveLike = () => r({body: {liked: true, likeCount: 11}});
        }),
    });
    globalThis.fetch = fetch;
    render(<App queryClient={newQueryClient()} />);
    expect(await screen.findByText('Derivatives in 60 seconds')).toBeTruthy();
    expect(screen.getByText('@sarah')).toBeTruthy();
    expect(screen.getByText('#math')).toBeTruthy();
    expect(screen.getAllByTestId('video').length).toBeGreaterThan(0);

    // Inbox tab badge = unread conversations + notifications.
    await waitFor(() => expect(screen.getByText('7')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Like'));
    // Optimistic: count goes 10 → 11 before the server answers.
    expect(await screen.findByLabelText('Unlike')).toBeTruthy();
    expect(screen.getByText('11')).toBeTruthy();
    await act(async () => resolveLike(null));
    expect(
      calls.some(c => c.method === 'POST' && c.path === '/posts/p1/like'),
    ).toBe(true);
  });

  it('rolls back an optimistic like when the request fails', async () => {
    await signIn();
    const {fetch} = createFetchMock({
      ...signedInRoutes,
      'POST /posts/p1/like': () => ({
        status: 500,
        body: {error: {code: 'INTERNAL', message: 'x'}},
      }),
    });
    globalThis.fetch = fetch;
    render(<App queryClient={newQueryClient()} />);
    fireEvent.press(await screen.findByLabelText('Like'));
    await waitFor(() => expect(screen.getByLabelText('Like')).toBeTruthy());
    expect(screen.getByText('10')).toBeTruthy();
  });

  it('shows trending topics and suggested users from the API on Discover', async () => {
    await signIn();
    const {fetch} = createFetchMock(signedInRoutes);
    globalThis.fetch = fetch;
    render(<App queryClient={newQueryClient()} />);
    await screen.findByText('Derivatives in 60 seconds');
    fireEvent.press(screen.getByText('Discover'));
    expect(await screen.findByText('Mathematics')).toBeTruthy();
    expect(screen.getByText('12 posts')).toBeTruthy();
    expect(await screen.findByText('Omar Said')).toBeTruthy();
    expect(await screen.findByText('Popular notes')).toBeTruthy();
  });

  it('shows an error state with retry when the feed fails', async () => {
    await signIn();
    let fail = true;
    const {fetch} = createFetchMock({
      ...signedInRoutes,
      'GET /feed': () =>
        fail
          ? {
              status: 503,
              body: {
                error: {code: 'INTERNAL', message: 'Database unavailable'},
              },
            }
          : {body: page([videoPost()])},
    });
    globalThis.fetch = fetch;
    render(<App queryClient={newQueryClient()} />);
    expect(await screen.findByText('Database unavailable')).toBeTruthy();
    fail = false;
    fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('Derivatives in 60 seconds')).toBeTruthy();
  });
});
