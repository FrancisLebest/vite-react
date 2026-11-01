export type UserRole = 'student' | 'professor' | 'creator';

export interface User {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  university: string;
  role: UserRole;
  verified?: boolean;
  followers: number;
  following: number;
  mutual: number;
  bio?: string;
  online?: boolean;
}

export type CategoryId =
  | 'study-tips'
  | 'exams'
  | 'assignments'
  | 'math'
  | 'science'
  | 'programming'
  | 'business'
  | 'notes'
  | 'videos'
  | 'resources';

export interface Category {
  id: CategoryId;
  label: string;
  icon: string; // Ionicons name
}

export interface Video {
  id: string;
  authorId: string;
  cover: string;
  caption: string;
  hashtags: string[];
  tag: string;
  sound: string;
  likes: number;
  comments: number;
  bookmarks: number;
  shares: number;
  following?: boolean;
}

export interface ContentItem {
  id: string;
  title: string;
  thumbnail: string;
  duration: string;
  authorId: string;
  views: number;
  category: CategoryId;
  createdAt: number;
}

export interface Comment {
  id: string;
  authorId: string;
  text: string;
  createdAt: number;
}

export interface Post {
  id: string;
  authorId: string;
  text: string;
  hashtags: string[];
  image?: string;
  audio?: {duration: string; attachment?: string};
  likes: number;
  shares: number;
  createdAt: number;
  category: CategoryId;
}

export interface Community {
  id: string;
  name: string;
  members: number;
  icon: string; // Ionicons name
  color: string;
  image?: string;
  description: string;
  kind: 'university' | 'faculty' | 'topic';
}

export interface Message {
  id: string;
  fromMe: boolean;
  text: string;
  createdAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  avatar?: string;
  icon?: string;
  iconColor?: string;
  userId?: string;
  isGroup?: boolean;
  muted?: boolean;
  unread: number;
  messages: Message[];
  kind: 'message' | 'mention';
}

export interface AppNotification {
  id: string;
  actorId: string;
  text: string;
  createdAt: number;
  read: boolean;
  icon: string;
}
