<?php
/**
 * Database: PDO SQLite, WAL mode, foreign keys, full schema.
 */
function get_db(array $config): PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    $dataDir = $config['data_dir'];
    if (!is_dir($dataDir)) {
        mkdir($dataDir, 0755, true);
    }
    $dbPath = $dataDir . '/kalimat.sqlite';
    $pdo = new PDO('sqlite:' . $dbPath, null, null, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec('PRAGMA journal_mode = WAL');
    $pdo->exec('PRAGMA foreign_keys = ON');

    // Schema — all tables
    $pdo->exec("
        -- Auth (replaces Supabase auth.users)
        CREATE TABLE IF NOT EXISTS users (
            id            TEXT PRIMARY KEY,
            email         TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at    TEXT DEFAULT (datetime('now'))
        );

        -- Profiles (extends users)
        CREATE TABLE IF NOT EXISTS profiles (
            id                TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            username          TEXT UNIQUE NOT NULL,
            role              TEXT NOT NULL DEFAULT 'user',
            trust_score       INTEGER NOT NULL DEFAULT 0,
            trust_score_vocab INTEGER DEFAULT 50,
            trust_score_forms INTEGER DEFAULT 50,
            created_at        TEXT DEFAULT (datetime('now'))
        );

        -- Decks
        CREATE TABLE IF NOT EXISTS decks (
            id                      INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id                 TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title                   TEXT NOT NULL,
            description             TEXT DEFAULT '',
            is_public               INTEGER DEFAULT 0,
            community_deck_id       INTEGER,
            saved_download_count    INTEGER DEFAULT 0,
            source_community_deck_id INTEGER,
            review_frequency        TEXT,
            review_interval_days    INTEGER,
            next_deck_review        TEXT,
            created_at              TEXT DEFAULT (datetime('now'))
        );

        -- Words
        CREATE TABLE IF NOT EXISTS words (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            deck_id          INTEGER REFERENCES decks(id) ON DELETE SET NULL,
            arabic           TEXT NOT NULL,
            english          TEXT NOT NULL,
            root             TEXT DEFAULT '',
            part_of_speech   TEXT DEFAULT '',
            example_sentence TEXT DEFAULT '',
            past             TEXT DEFAULT '',
            present          TEXT DEFAULT '',
            command          TEXT DEFAULT '',
            masdar           TEXT DEFAULT '',
            singular         TEXT DEFAULT '',
            dual             TEXT DEFAULT '',
            plural           TEXT DEFAULT '',
            notes            TEXT DEFAULT '',
            color            TEXT,
            created_at       TEXT DEFAULT (datetime('now'))
        );

        -- SRS Cards
        CREATE TABLE IF NOT EXISTS srs_cards (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            word_id          INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
            deck_id          INTEGER REFERENCES decks(id) ON DELETE SET NULL,
            repetitions      INTEGER DEFAULT 0,
            ease_factor      REAL DEFAULT 2.5,
            interval         INTEGER DEFAULT 1,
            next_review_date TEXT DEFAULT (datetime('now')),
            last_reviewed    TEXT,
            created_at       TEXT DEFAULT (datetime('now'))
        );

        -- Community Collections (folders for team tab)
        CREATE TABLE IF NOT EXISTS community_collections (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            title      TEXT NOT NULL,
            order_index INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );

        -- Community Decks
        CREATE TABLE IF NOT EXISTS community_decks (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            uploaded_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            uploader_username   TEXT DEFAULT 'Unknown',
            title               TEXT NOT NULL,
            description         TEXT DEFAULT '',
            word_count          INTEGER DEFAULT 0,
            words_json          TEXT DEFAULT '[]',
            download_count      INTEGER DEFAULT 0,
            collection_id       INTEGER REFERENCES community_collections(id) ON DELETE SET NULL,
            order_index         INTEGER NOT NULL DEFAULT 0,
            created_at          TEXT DEFAULT (datetime('now'))
        );

        -- Dictionary
        CREATE TABLE IF NOT EXISTS dictionary (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            arabic           TEXT NOT NULL,
            root             TEXT,
            definition       TEXT NOT NULL,
            pos              TEXT,
            plural           TEXT,
            verb_form        TEXT,
            forms            TEXT DEFAULT '[]',
            sources          TEXT DEFAULT '[]',
            example_sentence TEXT,
            created_at       TEXT DEFAULT (datetime('now'))
        );

        -- Quran Words
        CREATE TABLE IF NOT EXISTS quran_words (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            surah       INTEGER NOT NULL,
            verse       INTEGER NOT NULL,
            position    INTEGER NOT NULL,
            arabic      TEXT NOT NULL,
            english     TEXT DEFAULT '',
            root        TEXT DEFAULT '',
            grammar_tag TEXT DEFAULT '',
            arabic_bare TEXT,
            root_bare   TEXT,
            UNIQUE(surah, verse, position)
        );

        -- Sentences
        CREATE TABLE IF NOT EXISTS sentences (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            arabic      TEXT NOT NULL,
            translation TEXT DEFAULT '',
            word_id     INTEGER REFERENCES words(id) ON DELETE SET NULL,
            status      TEXT NOT NULL DEFAULT 'pending',
            source      TEXT NOT NULL DEFAULT 'user',
            created_at  TEXT DEFAULT (datetime('now')),
            updated_at  TEXT DEFAULT (datetime('now'))
        );

        -- Contributions
        CREATE TABLE IF NOT EXISTS contributions (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            submitted_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
            submitter_username  TEXT,
            type                TEXT NOT NULL,
            status              TEXT NOT NULL DEFAULT 'pending',
            arabic              TEXT,
            definition          TEXT,
            root                TEXT,
            pos                 TEXT,
            dictionary_entry_id INTEGER REFERENCES dictionary(id) ON DELETE CASCADE,
            form_type           TEXT,
            form_label          TEXT,
            form_arabic         TEXT,
            correction_note     TEXT,
            vote_score          INTEGER NOT NULL DEFAULT 0,
            quran_reference     TEXT,
            source              TEXT DEFAULT 'user',
            moderator_note      TEXT,
            created_at          TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Contribution Votes
        CREATE TABLE IF NOT EXISTS contribution_votes (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            contribution_id INTEGER NOT NULL REFERENCES contributions(id) ON DELETE CASCADE,
            user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            vote            INTEGER NOT NULL,
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(contribution_id, user_id)
        );

        -- Contribution Audit
        CREATE TABLE IF NOT EXISTS contribution_audit (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            contribution_id   INTEGER NOT NULL REFERENCES contributions(id) ON DELETE CASCADE,
            moderator_id      TEXT,
            moderator_username TEXT,
            action            TEXT NOT NULL,
            note              TEXT,
            created_at        TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Stories Collections
        CREATE TABLE IF NOT EXISTS collections (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            slug         TEXT UNIQUE NOT NULL,
            title        TEXT NOT NULL,
            title_arabic TEXT NOT NULL DEFAULT '',
            description  TEXT NOT NULL DEFAULT '',
            category     TEXT NOT NULL DEFAULT 'hadith',
            order_index  INTEGER NOT NULL DEFAULT 0,
            created_at   TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Stories
        CREATE TABLE IF NOT EXISTS stories (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            slug            TEXT UNIQUE NOT NULL,
            title_english   TEXT NOT NULL,
            title_arabic    TEXT NOT NULL DEFAULT '',
            description     TEXT NOT NULL DEFAULT '',
            category        TEXT NOT NULL DEFAULT 'hadith',
            difficulty      TEXT NOT NULL DEFAULT 'beginner',
            narrator        TEXT NOT NULL DEFAULT '',
            hadith_number   INTEGER,
            order_index     INTEGER NOT NULL DEFAULT 0,
            segments        TEXT NOT NULL DEFAULT '[]',
            collection_slug TEXT NOT NULL DEFAULT 'nawawi-40',
            created_at      TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Story Progress
        CREATE TABLE IF NOT EXISTS story_progress (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            story_id      INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
            segments_read INTEGER NOT NULL DEFAULT 0,
            completed     INTEGER NOT NULL DEFAULT 0,
            updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(user_id, story_id)
        );

        -- Study Log
        CREATE TABLE IF NOT EXISTS study_log (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            date           TEXT NOT NULL,
            cards_reviewed INTEGER NOT NULL DEFAULT 0,
            session_ms     INTEGER DEFAULT 0,
            UNIQUE(user_id, date)
        );

        -- App Sessions
        CREATE TABLE IF NOT EXISTS app_sessions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            started_at  TEXT NOT NULL DEFAULT (datetime('now')),
            ended_at    TEXT,
            duration_ms INTEGER
        );

        -- Feedback
        CREATE TABLE IF NOT EXISTS feedback (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
            email      TEXT,
            type       TEXT NOT NULL DEFAULT 'bug',
            message    TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- TTS Rate Limits
        CREATE TABLE IF NOT EXISTS tts_rate_limits (
            user_id    TEXT NOT NULL,
            usage_date TEXT NOT NULL,
            call_count INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (user_id, usage_date)
        );

        -- Rate Limits (general API)
        CREATE TABLE IF NOT EXISTS rate_limits (
            key          TEXT PRIMARY KEY,
            count        INTEGER DEFAULT 0,
            window_start INTEGER DEFAULT 0
        );

        -- Indexes
        CREATE INDEX IF NOT EXISTS idx_decks_user ON decks(user_id);
        CREATE INDEX IF NOT EXISTS idx_words_user ON words(user_id);
        CREATE INDEX IF NOT EXISTS idx_words_deck ON words(deck_id);
        CREATE INDEX IF NOT EXISTS idx_srs_user ON srs_cards(user_id);
        CREATE INDEX IF NOT EXISTS idx_srs_deck ON srs_cards(deck_id);
        CREATE INDEX IF NOT EXISTS idx_srs_word ON srs_cards(word_id);
        CREATE INDEX IF NOT EXISTS idx_dictionary_arabic ON dictionary(arabic);
        CREATE INDEX IF NOT EXISTS idx_dictionary_root ON dictionary(root);
        CREATE INDEX IF NOT EXISTS idx_quran_surah ON quran_words(surah);
        CREATE INDEX IF NOT EXISTS idx_quran_arabic_bare ON quran_words(arabic_bare);
        CREATE INDEX IF NOT EXISTS idx_quran_root_bare ON quran_words(root_bare);
        CREATE INDEX IF NOT EXISTS idx_stories_collection ON stories(collection_slug);
        CREATE INDEX IF NOT EXISTS idx_story_progress_user ON story_progress(user_id);
        CREATE INDEX IF NOT EXISTS idx_study_log_user_date ON study_log(user_id, date);
        CREATE INDEX IF NOT EXISTS idx_sentences_user ON sentences(user_id);
        CREATE INDEX IF NOT EXISTS idx_sentences_word ON sentences(word_id);
        CREATE INDEX IF NOT EXISTS idx_contributions_status ON contributions(status);
        CREATE INDEX IF NOT EXISTS idx_app_sessions_user ON app_sessions(user_id);
    ");

    return $pdo;
}
