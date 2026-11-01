import type {Me, Post, UserSummary} from '../../src/api/types';

export const summary = (over: Partial<UserSummary> = {}): UserSummary => ({
  id: 'u2',
  username: 'sarah',
  name: 'Sarah Ahmed',
  avatarUrl: null,
  university: 'Cairo University',
  role: 'student',
  verified: false,
  isFollowing: false,
  ...over,
});

export const me: Me = {
  ...summary({id: 'me', username: 'youssef', name: 'Youssef Nabil'}),
  bio: null,
  followerCount: 3,
  followingCount: 1,
  postCount: 0,
  mutualCount: 0,
  isMe: true,
  isBlocked: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  email: 'youssef@example.com',
};

export const videoPost = (over: Partial<Post> = {}): Post => ({
  id: 'p1',
  type: 'video',
  text: 'Derivatives in 60 seconds',
  hashtags: ['math'],
  category: 'math',
  media: {
    kind: 'video',
    url: 'http://localhost:4000/uploads/v.mp4',
    thumbnailUrl: 'http://localhost:4000/uploads/v.jpg',
    durationSec: 42,
    width: 720,
    height: 1280,
  },
  author: summary(),
  community: null,
  likeCount: 10,
  commentCount: 2,
  shareCount: 0,
  bookmarkCount: 1,
  viewCount: 100,
  likedByMe: false,
  bookmarkedByMe: false,
  createdAt: new Date().toISOString(),
  ...over,
});
