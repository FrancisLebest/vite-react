-- StudyHub initial schema
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------- users
CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username        citext NOT NULL UNIQUE,
  email           citext NOT NULL UNIQUE,
  password_hash   text NOT NULL,
  name            text NOT NULL,
  bio             text,
  university      text,
  role            text NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'professor', 'creator')),
  verified        boolean NOT NULL DEFAULT false,
  avatar_key      text,
  follower_count  integer NOT NULL DEFAULT 0,
  following_count integer NOT NULL DEFAULT 0,
  post_count      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at      timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX users_name_trgm ON users USING gin (name gin_trgm_ops);
CREATE INDEX users_username_trgm ON users USING gin ((username::text) gin_trgm_ops);
CREATE INDEX users_university_idx ON users (lower(university));
CREATE INDEX users_popular_idx ON users (follower_count DESC, created_at DESC);
CREATE INDEX users_created_idx ON users (created_at DESC, id DESC);

CREATE TABLE refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  replaced_by uuid,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);

CREATE TABLE password_resets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash   text NOT NULL,
  attempts    integer NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX password_resets_user_idx ON password_resets (user_id, created_at DESC);

CREATE TABLE follows (
  follower_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);
CREATE INDEX follows_following_idx ON follows (following_id, created_at DESC);
CREATE INDEX follows_follower_created_idx ON follows (follower_id, created_at DESC);

CREATE TABLE blocks (
  blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX blocks_blocked_idx ON blocks (blocked_id);

CREATE TABLE push_tokens (
  token      text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform   text NOT NULL CHECK (platform IN ('ios', 'android')),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX push_tokens_user_idx ON push_tokens (user_id);

-- ---------------------------------------------------------------- communities
CREATE TABLE communities (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         citext NOT NULL UNIQUE,
  description  text NOT NULL DEFAULT '',
  kind         text NOT NULL CHECK (kind IN ('university', 'faculty', 'topic')),
  icon         text NOT NULL,
  color        text NOT NULL,
  avatar_key   text,
  owner_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_count integer NOT NULL DEFAULT 0,
  post_count   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at   timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX communities_name_trgm ON communities USING gin ((name::text) gin_trgm_ops);
CREATE INDEX communities_desc_trgm ON communities USING gin (description gin_trgm_ops);
CREATE INDEX communities_popular_idx ON communities (member_count DESC, created_at DESC);
CREATE INDEX communities_created_idx ON communities (created_at DESC, id DESC);
CREATE INDEX communities_owner_idx ON communities (owner_id);

CREATE TABLE community_members (
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (community_id, user_id)
);
CREATE INDEX community_members_user_idx ON community_members (user_id);
CREATE INDEX community_members_created_idx ON community_members (community_id, created_at DESC);

-- ---------------------------------------------------------------- posts
CREATE TABLE posts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  community_id   uuid REFERENCES communities(id) ON DELETE SET NULL,
  type           text NOT NULL CHECK (type IN ('video', 'post')),
  text           text NOT NULL DEFAULT '',
  category       text NOT NULL,
  hashtags       text[] NOT NULL DEFAULT '{}',
  media_kind     text CHECK (media_kind IN ('video', 'image', 'audio')),
  media_key      text,
  thumbnail_key  text,
  duration_sec   real,
  width          integer,
  height         integer,
  like_count     integer NOT NULL DEFAULT 0,
  comment_count  integer NOT NULL DEFAULT 0,
  share_count    integer NOT NULL DEFAULT 0,
  bookmark_count integer NOT NULL DEFAULT 0,
  view_count     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX posts_created_idx ON posts (created_at DESC, id DESC);
CREATE INDEX posts_author_idx ON posts (author_id, created_at DESC);
CREATE INDEX posts_community_idx ON posts (community_id, created_at DESC);
CREATE INDEX posts_category_idx ON posts (category, created_at DESC);
CREATE INDEX posts_type_idx ON posts (type, created_at DESC);
CREATE INDEX posts_hashtags_idx ON posts USING gin (hashtags);
CREATE INDEX posts_text_trgm ON posts USING gin (text gin_trgm_ops);

CREATE TABLE post_likes (
  post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX post_likes_user_idx ON post_likes (user_id);

CREATE TABLE bookmarks (
  post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX bookmarks_user_idx ON bookmarks (user_id, created_at DESC);

CREATE TABLE post_views (
  post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX post_views_user_idx ON post_views (user_id);

CREATE TABLE comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX comments_post_idx ON comments (post_id, created_at, id);
CREATE INDEX comments_author_idx ON comments (author_id);

-- ---------------------------------------------------------------- messaging
CREATE TABLE conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_group        boolean NOT NULL DEFAULT false,
  title           text,
  dm_key          text UNIQUE, -- "<minUserId>:<maxUserId>" for direct messages
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  last_message_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at      timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX conversations_updated_idx ON conversations (updated_at DESC, id DESC);

CREATE TABLE conversation_participants (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  muted           boolean NOT NULL DEFAULT false,
  last_read_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  joined_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX conversation_participants_user_idx ON conversation_participants (user_id);

CREATE TABLE messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text            text NOT NULL DEFAULT '',
  media_kind      text CHECK (media_kind IN ('video', 'image', 'audio')),
  media_key       text,
  thumbnail_key   text,
  duration_sec    real,
  width           integer,
  height          integer,
  created_at      timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX messages_conversation_idx ON messages (conversation_id, created_at DESC, id DESC);
CREATE INDEX messages_sender_idx ON messages (sender_id);

-- ---------------------------------------------------------------- notifications & moderation
CREATE TABLE notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         text NOT NULL CHECK (type IN ('like', 'comment', 'follow', 'mention', 'community_join', 'message')),
  post_id      uuid REFERENCES posts(id) ON DELETE CASCADE,
  comment_id   uuid REFERENCES comments(id) ON DELETE CASCADE,
  community_id uuid REFERENCES communities(id) ON DELETE CASCADE,
  text         text NOT NULL,
  read         boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC, id DESC);
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE NOT read;
CREATE INDEX notifications_actor_idx ON notifications (actor_id);

CREATE TABLE reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('post', 'comment', 'user', 'community', 'message')),
  target_id   uuid NOT NULL,
  reason      text NOT NULL CHECK (reason IN ('spam', 'harassment', 'inappropriate', 'other')),
  details     text,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed')),
  created_at  timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX reports_target_idx ON reports (target_type, target_id);
CREATE INDEX reports_status_idx ON reports (status, created_at DESC);

-- ---------------------------------------------------------------- denormalised counters (triggers)
CREATE FUNCTION trg_follows_counts() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE users SET following_count = following_count + 1 WHERE id = NEW.follower_id;
    UPDATE users SET follower_count = follower_count + 1 WHERE id = NEW.following_id;
  ELSE
    UPDATE users SET following_count = GREATEST(following_count - 1, 0) WHERE id = OLD.follower_id;
    UPDATE users SET follower_count = GREATEST(follower_count - 1, 0) WHERE id = OLD.following_id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER follows_counts AFTER INSERT OR DELETE ON follows FOR EACH ROW EXECUTE FUNCTION trg_follows_counts();

CREATE FUNCTION trg_posts_counts() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE users SET post_count = post_count + 1 WHERE id = NEW.author_id;
    IF NEW.community_id IS NOT NULL THEN
      UPDATE communities SET post_count = post_count + 1 WHERE id = NEW.community_id;
    END IF;
  ELSE
    UPDATE users SET post_count = GREATEST(post_count - 1, 0) WHERE id = OLD.author_id;
    IF OLD.community_id IS NOT NULL THEN
      UPDATE communities SET post_count = GREATEST(post_count - 1, 0) WHERE id = OLD.community_id;
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER posts_counts AFTER INSERT OR DELETE ON posts FOR EACH ROW EXECUTE FUNCTION trg_posts_counts();

CREATE FUNCTION trg_members_counts() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE communities SET member_count = member_count + 1 WHERE id = NEW.community_id;
  ELSE
    UPDATE communities SET member_count = GREATEST(member_count - 1, 0) WHERE id = OLD.community_id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER members_counts AFTER INSERT OR DELETE ON community_members FOR EACH ROW EXECUTE FUNCTION trg_members_counts();

-- One generic function for the post_* counters; TG_ARGV[0] = counter column.
CREATE FUNCTION trg_post_counter() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    EXECUTE format('UPDATE posts SET %1$I = %1$I + 1 WHERE id = $1', TG_ARGV[0]) USING NEW.post_id;
  ELSE
    EXECUTE format('UPDATE posts SET %1$I = GREATEST(%1$I - 1, 0) WHERE id = $1', TG_ARGV[0]) USING OLD.post_id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER post_likes_counts AFTER INSERT OR DELETE ON post_likes FOR EACH ROW EXECUTE FUNCTION trg_post_counter('like_count');
CREATE TRIGGER bookmarks_counts AFTER INSERT OR DELETE ON bookmarks FOR EACH ROW EXECUTE FUNCTION trg_post_counter('bookmark_count');
CREATE TRIGGER post_views_counts AFTER INSERT OR DELETE ON post_views FOR EACH ROW EXECUTE FUNCTION trg_post_counter('view_count');
CREATE TRIGGER comments_counts AFTER INSERT OR DELETE ON comments FOR EACH ROW EXECUTE FUNCTION trg_post_counter('comment_count');
