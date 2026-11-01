import 'react-native';
import React from 'react';
import {act, create, ReactTestRenderer} from 'react-test-renderer';
import App from '../App';

jest.useFakeTimers();

const textOf = (tree: ReactTestRenderer) =>
  tree.root
    .findAll(n => (n.type as unknown) === 'Text')
    .map(n =>
      (n.children as unknown[]).filter(c => typeof c === 'string').join(''),
    )
    .join('|');

const press = (tree: ReactTestRenderer, label: string) => {
  const node = tree.root.find(
    n =>
      n.props.accessibilityLabel === label &&
      typeof n.props.onPress === 'function',
  );
  act(() => node.props.onPress());
};

const pressText = (tree: ReactTestRenderer, text: string) => {
  const textNode = tree.root.find(
    n =>
      (n.type as unknown) === 'Text' &&
      (n.children as unknown[]).join('') === text,
  );
  let cur: typeof textNode | null = textNode;
  while (cur && typeof cur.props.onPress !== 'function') {
    cur = cur.parent;
  }
  if (!cur) {
    throw new Error(`No pressable for "${text}"`);
  }
  const target = cur;
  act(() => target.props.onPress());
};

describe('StudyHub app', () => {
  let tree: ReactTestRenderer;

  beforeEach(() => {
    act(() => {
      tree = create(<App />);
    });
    act(() => {
      jest.runOnlyPendingTimers();
    });
  });

  afterEach(() => act(() => tree.unmount()));

  it('renders the home tab bar and header', () => {
    const txt = textOf(tree);
    expect(txt).toContain('For You');
    expect(txt).toContain('Following');
    expect(txt).toContain('Discover');
    expect(txt).toContain('Inbox');
    expect(txt).toContain('Profile');
  });

  it('navigates to Discover then Communities', () => {
    pressText(tree, 'Discover');
    expect(textOf(tree)).toContain('Trending Topics');
    expect(textOf(tree)).toContain('Popular Content');
    pressText(tree, 'Join Our Study Community');
    expect(textOf(tree)).toContain('Popular Communities');
    expect(textOf(tree)).toContain('My Communities');
  });

  it('opens inbox, then a chat and sends a message', () => {
    pressText(tree, 'Inbox');
    expect(textOf(tree)).toContain('Study Group – CS Dept.');
    pressText(tree, 'Ahmed Khaled');
    const input = tree.root.find(
      n => n.props.placeholder === 'Write a message...',
    );
    act(() => input.props.onChangeText('Hello from the test'));
    press(tree, 'Send message');
    expect(textOf(tree)).toContain('Hello from the test');
  });

  it('searches and filters results', () => {
    press(tree, 'Search');
    const input = tree.root.find(
      n =>
        n.props.placeholder === 'Search posts, users, communities' &&
        n.props.onChangeText,
    );
    act(() => input.props.onChangeText('math'));
    const txt = textOf(tree);
    expect(txt).toContain('Math Pro');
    expect(txt).toContain('Math Lovers');
    expect(txt).toContain('Search Results');
  });
});
