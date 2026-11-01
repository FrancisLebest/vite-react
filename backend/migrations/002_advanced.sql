-- StudyHub v1.1 — advanced features

-- ---------------------------------------------------------------- users: privacy, settings, admin
ALTER TABLE users
  ADD COLUMN is_private         boolean NOT NULL DEFAULT false,
  ADD COLUMN dm_policy          text NOT NULL DEFAULT 'everyone' CHECK (dm_policy IN ('everyone', 'followers', 'nobody')),
  ADD COLUMN notification_prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN interests          text[] NOT NULL DEFAULT '{}',
  ADD COLUMN email_verified_at  timestamptz,
  ADD COLUMN is_admin           boolean NOT NULL DEFAULT false,
  ADD COLUMN suspended_at       timestamptz,
  ADD COLUMN suspended_reason   text,
  ADD COLUMN pinned_post_ids    uuid[] NOT NULL DEFAULT '{}';

CREATE TABLE follow_requests (
  requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (requester_id, target_id),
  CHECK (requester_id <> target_id)
);
CREATE INDEX follow_requests_target_idx ON follow_requests (target_id, created_at DESC);

CREATE TABLE email_verifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash  text NOT NULL,
  attempts   integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX email_verifications_user_idx ON email_verifications (user_id, created_at DESC);

-- ---------------------------------------------------------------- posts
ALTER TABLE posts
  ADD COLUMN status            text NOT NULL DEFAULT 'ready' CHECK (status IN ('processing', 'ready', 'failed')),
  ADD COLUMN processing_error  text,
  ADD COLUMN source_key        text,
  ADD COLUMN edited_at         timestamptz,
  ADD COLUMN repost_count      integer NOT NULL DEFAULT 0;
CREATE INDEX posts_not_ready_idx ON posts (status) WHERE status <> 'ready';

CREATE TABLE reposts (
  post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX reposts_user_idx ON reposts (user_id, created_at DESC);
CREATE TRIGGER reposts_counts AFTER INSERT OR DELETE ON reposts FOR EACH ROW EXECUTE FUNCTION trg_post_counter('repost_count');

-- Watch history + daily stats
ALTER TABLE post_views
  ADD COLUMN last_viewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ADD COLUMN in_history     boolean NOT NULL DEFAULT true;
CREATE INDEX post_views_history_idx ON post_views (user_id, last_viewed_at DESC) WHERE in_history;

CREATE TABLE post_stats_daily (
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  day     date NOT NULL,
  views   integer NOT NULL DEFAULT 0,
  shares  integer NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, day)
);
CREATE INDEX post_stats_daily_day_idx ON post_stats_daily (day);

-- ---------------------------------------------------------------- comments v2
ALTER TABLE comments
  ADD COLUMN parent_id   uuid REFERENCES comments(id) ON DELETE CASCADE,
  ADD COLUMN reply_count integer NOT NULL DEFAULT 0,
  ADD COLUMN like_count  integer NOT NULL DEFAULT 0;
CREATE INDEX comments_parent_idx ON comments (parent_id, created_at, id) WHERE parent_id IS NOT NULL;
CREATE INDEX comments_top_idx ON comments (post_id, created_at, id) WHERE parent_id IS NULL;

ALTER TABLE posts ADD COLUMN pinned_comment_id uuid REFERENCES comments(id) ON DELETE SET NULL;

CREATE TABLE comment_likes (
  comment_id uuid NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (comment_id, user_id)
);
CREATE INDEX comment_likes_user_idx ON comment_likes (user_id);

CREATE FUNCTION trg_comment_likes_counts() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE comments SET like_count = like_count + 1 WHERE id = NEW.comment_id;
  ELSE
    UPDATE comments SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.comment_id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER comment_likes_counts AFTER INSERT OR DELETE ON comment_likes FOR EACH ROW EXECUTE FUNCTION trg_comment_likes_counts();

CREATE FUNCTION trg_comment_replies_counts() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_id IS NOT NULL THEN
    UPDATE comments SET reply_count = reply_count + 1 WHERE id = NEW.parent_id;
  ELSIF TG_OP = 'DELETE' AND OLD.parent_id IS NOT NULL THEN
    UPDATE comments SET reply_count = GREATEST(reply_count - 1, 0) WHERE id = OLD.parent_id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER comment_replies_counts AFTER INSERT OR DELETE ON comments FOR EACH ROW EXECUTE FUNCTION trg_comment_replies_counts();

-- ---------------------------------------------------------------- polls / quizzes
CREATE TABLE polls (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id           uuid NOT NULL UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
  kind              text NOT NULL CHECK (kind IN ('poll', 'quiz')),
  question          text,
  correct_option_id uuid,
  created_at        timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE poll_options (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id    uuid NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  position   integer NOT NULL,
  text       text NOT NULL,
  vote_count integer NOT NULL DEFAULT 0,
  UNIQUE (poll_id, position)
);
CREATE TABLE poll_votes (
  poll_id    uuid NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_id  uuid NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (poll_id, user_id)
);
CREATE INDEX poll_votes_option_idx ON poll_votes (option_id);
CREATE FUNCTION trg_poll_votes_counts() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE poll_options SET vote_count = vote_count + 1 WHERE id = NEW.option_id;
  ELSE
    UPDATE poll_options SET vote_count = GREATEST(vote_count - 1, 0) WHERE id = OLD.option_id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER poll_votes_counts AFTER INSERT OR DELETE ON poll_votes FOR EACH ROW EXECUTE FUNCTION trg_poll_votes_counts();

-- ---------------------------------------------------------------- series
CREATE TABLE series (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          text NOT NULL,
  description    text NOT NULL DEFAULT '',
  cover_key      text,
  category       text NOT NULL,
  item_count     integer NOT NULL DEFAULT 0,
  follower_count integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at     timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX series_author_idx ON series (author_id, created_at DESC, id DESC);

CREATE TABLE series_items (
  series_id uuid NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  post_id   uuid NOT NULL UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
  position  integer NOT NULL,
  added_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (series_id, post_id)
);
CREATE INDEX series_items_order_idx ON series_items (series_id, position);

CREATE TABLE series_follows (
  series_id  uuid NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (series_id, user_id)
);
CREATE INDEX series_follows_user_idx ON series_follows (user_id, created_at DESC);

CREATE FUNCTION trg_series_counter() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    EXECUTE format('UPDATE series SET %1$I = %1$I + 1 WHERE id = $1', TG_ARGV[0]) USING NEW.series_id;
  ELSE
    EXECUTE format('UPDATE series SET %1$I = GREATEST(%1$I - 1, 0) WHERE id = $1', TG_ARGV[0]) USING OLD.series_id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER series_items_counts AFTER INSERT OR DELETE ON series_items FOR EACH ROW EXECUTE FUNCTION trg_series_counter('item_count');
CREATE TRIGGER series_follows_counts AFTER INSERT OR DELETE ON series_follows FOR EACH ROW EXECUTE FUNCTION trg_series_counter('follower_count');

-- ---------------------------------------------------------------- messages: shared posts
ALTER TABLE messages ADD COLUMN shared_post_id uuid REFERENCES posts(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------- community events
CREATE TABLE events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  creator_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        text NOT NULL,
  description  text NOT NULL DEFAULT '',
  starts_at    timestamptz NOT NULL,
  ends_at      timestamptz,
  location     text,
  online_url   text,
  going_count  integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX events_community_idx ON events (community_id, starts_at);
CREATE INDEX events_upcoming_idx ON events (starts_at);

CREATE TABLE event_rsvps (
  event_id   uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status     text NOT NULL CHECK (status IN ('going', 'not_going')),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX event_rsvps_user_idx ON event_rsvps (user_id);

CREATE FUNCTION trg_event_rsvps_counts() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  delta integer := 0;
  ev uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    ev := NEW.event_id;
    IF NEW.status = 'going' THEN delta := 1; END IF;
  ELSIF TG_OP = 'DELETE' THEN
    ev := OLD.event_id;
    IF OLD.status = 'going' THEN delta := -1; END IF;
  ELSE
    ev := NEW.event_id;
    delta := (CASE WHEN NEW.status = 'going' THEN 1 ELSE 0 END) - (CASE WHEN OLD.status = 'going' THEN 1 ELSE 0 END);
  END IF;
  IF delta <> 0 THEN
    UPDATE events SET going_count = GREATEST(going_count + delta, 0) WHERE id = ev;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER event_rsvps_counts AFTER INSERT OR UPDATE OR DELETE ON event_rsvps FOR EACH ROW EXECUTE FUNCTION trg_event_rsvps_counts();

-- ---------------------------------------------------------------- notifications
ALTER TABLE notifications ADD COLUMN event_id uuid REFERENCES events(id) ON DELETE CASCADE;
ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'like', 'comment', 'follow', 'mention', 'community_join', 'message',
  'reply', 'comment_like', 'follow_request', 'follow_accepted', 'repost', 'event', 'verification'
));

-- ---------------------------------------------------------------- moderation
ALTER TABLE reports
  ADD COLUMN resolution  text CHECK (resolution IN ('none', 'content_removed', 'user_suspended')),
  ADD COLUMN note        text,
  ADD COLUMN resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN resolved_at timestamptz;

CREATE TABLE verification_requests (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message    text,
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX verification_requests_pending_idx ON verification_requests (user_id) WHERE status = 'pending';
CREATE INDEX verification_requests_status_idx ON verification_requests (status, created_at);

-- ---------------------------------------------------------------- keep profile pins in sync with post deletion
CREATE OR REPLACE FUNCTION trg_posts_counts() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE users SET post_count = post_count + 1 WHERE id = NEW.author_id;
    IF NEW.community_id IS NOT NULL THEN
      UPDATE communities SET post_count = post_count + 1 WHERE id = NEW.community_id;
    END IF;
  ELSE
    UPDATE users SET post_count = GREATEST(post_count - 1, 0), pinned_post_ids = array_remove(pinned_post_ids, OLD.id)
     WHERE id = OLD.author_id;
    IF OLD.community_id IS NOT NULL THEN
      UPDATE communities SET post_count = GREATEST(post_count - 1, 0) WHERE id = OLD.community_id;
    END IF;
  END IF;
  RETURN NULL;
END $$;
