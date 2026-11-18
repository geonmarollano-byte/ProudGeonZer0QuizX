CREATE TABLE users (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  seed_key text UNIQUE,
  username varchar(32) NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_]{3,32}$'),
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('HOST','PLAYER')),
  must_change_credentials boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  credential_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX users_role_active ON users(role,is_active);
CREATE TABLE sessions (sid varchar PRIMARY KEY, sess json NOT NULL, expire timestamp NOT NULL);
CREATE INDEX sessions_expire ON sessions(expire);

CREATE TABLE games (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  host_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title varchar(120) NOT NULL CHECK (length(trim(title)) > 0),
  description varchar(2000) NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED')),
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,host_id)
);
CREATE INDEX games_host_updated ON games(host_id, updated_at DESC);
CREATE TABLE questions (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id integer NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  question_text varchar(1000) NOT NULL CHECK (length(trim(question_text)) > 0),
  question_type text NOT NULL DEFAULT 'MULTIPLE_CHOICE' CHECK (question_type='MULTIPLE_CHOICE'),
  points integer NOT NULL DEFAULT 10 CHECK (points BETWEEN 1 AND 100),
  sort_order integer NOT NULL CHECK (sort_order BETWEEN 0 AND 49), UNIQUE(game_id,sort_order)
);
CREATE TABLE question_options (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  question_id integer NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  option_text varchar(300) NOT NULL CHECK (length(trim(option_text)) > 0),
  is_correct boolean NOT NULL,
  sort_order integer NOT NULL CHECK (sort_order BETWEEN 0 AND 3),
  UNIQUE(question_id,sort_order), UNIQUE(id,question_id)
);
CREATE UNIQUE INDEX one_correct_option ON question_options(question_id) WHERE is_correct;
CREATE TABLE game_assignments (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id integer NOT NULL, player_id integer NOT NULL REFERENCES users(id), assigned_by_host_id integer NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(), UNIQUE(game_id,player_id),
  FOREIGN KEY(game_id,assigned_by_host_id) REFERENCES games(id,host_id) ON DELETE RESTRICT
);
CREATE INDEX assignments_player ON game_assignments(player_id,assigned_at DESC);
CREATE TABLE game_attempts (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, game_id integer NOT NULL, player_id integer NOT NULL,
  status text NOT NULL DEFAULT 'STARTED' CHECK (status IN ('STARTED','SUBMITTED')),
  score integer, max_score integer,
  started_at timestamptz NOT NULL DEFAULT now(), submitted_at timestamptz,
  UNIQUE(game_id,player_id), FOREIGN KEY(game_id,player_id) REFERENCES game_assignments(game_id,player_id),
  CHECK ((status='STARTED' AND score IS NULL AND max_score IS NULL AND submitted_at IS NULL) OR
    (status='SUBMITTED' AND submitted_at IS NOT NULL AND score IS NOT NULL AND max_score IS NOT NULL AND max_score>0 AND score BETWEEN 0 AND max_score))
);
CREATE INDEX attempts_player_result ON game_attempts(player_id,submitted_at DESC) WHERE status='SUBMITTED';
CREATE TABLE attempt_answers (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, attempt_id integer NOT NULL REFERENCES game_attempts(id),
  question_id integer NOT NULL REFERENCES questions(id), selected_option_id integer NOT NULL,
  is_correct boolean NOT NULL, points_awarded integer NOT NULL CHECK(points_awarded BETWEEN 0 AND 100),
  UNIQUE(attempt_id,question_id), FOREIGN KEY(selected_option_id,question_id) REFERENCES question_options(id,question_id)
);
