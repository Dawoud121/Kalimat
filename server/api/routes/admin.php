<?php
/**
 * Admin routes: stats, users, sessions, engagement, content, feedback
 */

// GET /admin/stats — aggregated overview (replaces get_admin_stats RPC)
if ($method === 'GET' && $path === '/admin/stats') {
    require_admin($config);

    $stats = [
        'total_users'           => (int)$pdo->query('SELECT COUNT(*) FROM profiles')->fetchColumn(),
        'total_decks'           => (int)$pdo->query('SELECT COUNT(*) FROM decks')->fetchColumn(),
        'total_words'           => (int)$pdo->query('SELECT COUNT(*) FROM words')->fetchColumn(),
        'total_community_decks' => (int)$pdo->query('SELECT COUNT(DISTINCT title) FROM community_decks')->fetchColumn(),
        'total_cards_reviewed'  => (int)$pdo->query('SELECT COALESCE(SUM(cards_reviewed), 0) FROM study_log')->fetchColumn(),
        'total_sessions'        => (int)$pdo->query('SELECT COUNT(*) FROM study_log')->fetchColumn(),
        'avg_session_size'      => round((float)$pdo->query('SELECT AVG(cards_reviewed) FROM study_log')->fetchColumn(), 1),
        'active_7d'             => (int)$pdo->query("SELECT COUNT(DISTINCT user_id) FROM study_log WHERE date >= date('now', '-7 days')")->fetchColumn(),
        'active_30d'            => (int)$pdo->query("SELECT COUNT(DISTINCT user_id) FROM study_log WHERE date >= date('now', '-30 days')")->fetchColumn(),
        'total_downloads'       => (int)$pdo->query('SELECT COALESCE(SUM(download_count), 0) FROM community_decks')->fetchColumn(),
    ];

    // Retention 7d
    $total = (int)$pdo->query('SELECT COUNT(DISTINCT user_id) FROM study_log')->fetchColumn();
    $active7 = $stats['active_7d'];
    $stats['retention_7d'] = $total > 0 ? round(100.0 * $active7 / $total, 1) : 0;

    // DAU chart (last 30 days)
    $stmt = $pdo->query("
        SELECT date, COUNT(DISTINCT user_id) AS users, SUM(cards_reviewed) AS cards
        FROM study_log WHERE date >= date('now', '-29 days')
        GROUP BY date ORDER BY date
    ");
    $stats['dau_chart'] = $stmt->fetchAll();

    // Top community decks
    $stmt = $pdo->query('SELECT title, download_count, uploader_username FROM community_decks ORDER BY download_count DESC LIMIT 10');
    $stats['top_community_decks'] = $stmt->fetchAll();

    // Contributions breakdown
    $stats['contributions_breakdown'] = [
        'total'    => (int)$pdo->query('SELECT COUNT(*) FROM contributions')->fetchColumn(),
        'pending'  => (int)$pdo->query("SELECT COUNT(*) FROM contributions WHERE status = 'pending'")->fetchColumn(),
        'approved' => (int)$pdo->query("SELECT COUNT(*) FROM contributions WHERE status = 'approved'")->fetchColumn(),
        'rejected' => (int)$pdo->query("SELECT COUNT(*) FROM contributions WHERE status = 'rejected'")->fetchColumn(),
    ];

    // Top contributors
    $stmt = $pdo->query('SELECT username, trust_score FROM profiles ORDER BY trust_score DESC LIMIT 10');
    $stats['top_contributors'] = $stmt->fetchAll();

    json_response($stats);
}

// GET /admin/users — user list with stats (replaces get_admin_users_list RPC)
if ($method === 'GET' && $path === '/admin/users') {
    require_admin($config);

    $stmt = $pdo->query("
        SELECT
            p.id,
            p.username,
            u.email,
            u.created_at AS joined,
            ls.last_date AS last_active,
            COALESCE(ls.total_cards, 0) AS total_cards_reviewed,
            COALESCE(ls.total_sessions, 0) AS total_sessions,
            COALESCE(ls.total_ms, 0) AS total_study_ms,
            COALESCE(wc.cnt, 0) AS word_count,
            COALESCE(dc.cnt, 0) AS deck_count
        FROM users u
        JOIN profiles p ON p.id = u.id
        LEFT JOIN (
            SELECT user_id, MAX(date) AS last_date, SUM(cards_reviewed) AS total_cards,
                   COUNT(*) AS total_sessions, SUM(session_ms) AS total_ms
            FROM study_log GROUP BY user_id
        ) ls ON ls.user_id = u.id
        LEFT JOIN (SELECT user_id, COUNT(*) AS cnt FROM words GROUP BY user_id) wc ON wc.user_id = u.id
        LEFT JOIN (SELECT user_id, COUNT(*) AS cnt FROM decks GROUP BY user_id) dc ON dc.user_id = u.id
        ORDER BY u.created_at DESC
    ");
    json_response($stmt->fetchAll());
}

// GET /admin/sessions — app session log (replaces get_admin_app_sessions RPC)
if ($method === 'GET' && $path === '/admin/sessions') {
    require_admin($config);
    $limit  = min((int)($_GET['limit'] ?? 100), 500);
    $offset = (int)($_GET['offset'] ?? 0);

    $stmt = $pdo->prepare("
        SELECT s.id, s.user_id, s.started_at, s.ended_at, s.duration_ms, p.username
        FROM app_sessions s
        JOIN profiles p ON p.id = s.user_id
        ORDER BY s.started_at DESC
        LIMIT ? OFFSET ?
    ");
    $stmt->execute([$limit, $offset]);
    json_response($stmt->fetchAll());
}

// GET /admin/engagement — engagement stats (replaces get_admin_engagement_stats RPC)
if ($method === 'GET' && $path === '/admin/engagement') {
    require_admin($config);

    $result = [];

    // Daily study time (last 30 days)
    $stmt = $pdo->query("
        SELECT date, SUM(session_ms) AS total_ms, COUNT(DISTINCT user_id) AS users
        FROM study_log WHERE date >= date('now', '-29 days')
        GROUP BY date ORDER BY date
    ");
    $result['daily_study_time'] = $stmt->fetchAll();

    $result['avg_session_ms']   = (int)$pdo->query('SELECT ROUND(AVG(session_ms)) FROM study_log WHERE session_ms > 0')->fetchColumn();
    $result['total_study_ms']   = (int)$pdo->query('SELECT SUM(session_ms) FROM study_log')->fetchColumn();

    $avgSessions = $pdo->query('SELECT AVG(cnt) FROM (SELECT COUNT(*) AS cnt FROM study_log GROUP BY user_id)')->fetchColumn();
    $result['avg_sessions_per_user'] = round((float)$avgSessions, 1);

    // Retention (simplified — SQLite doesn't have auth.users, so use users table)
    $d7users = (int)$pdo->query("
        SELECT COUNT(DISTINCT u.id) FROM users u
        WHERE u.created_at < datetime('now', '-7 days') AND u.created_at >= datetime('now', '-37 days')
    ")->fetchColumn();
    $d7active = (int)$pdo->query("
        SELECT COUNT(DISTINCT sl.user_id) FROM study_log sl
        JOIN users u ON u.id = sl.user_id
        WHERE sl.date >= date('now', '-6 days')
        AND u.created_at < datetime('now', '-7 days') AND u.created_at >= datetime('now', '-37 days')
    ")->fetchColumn();
    $result['retention_d7'] = $d7users > 0 ? round(100.0 * $d7active / $d7users, 1) : null;

    $d30users = (int)$pdo->query("SELECT COUNT(DISTINCT id) FROM users WHERE created_at < datetime('now', '-30 days')")->fetchColumn();
    $d30active = (int)$pdo->query("
        SELECT COUNT(DISTINCT sl.user_id) FROM study_log sl
        JOIN users u ON u.id = sl.user_id
        WHERE sl.date >= date('now', '-29 days') AND u.created_at < datetime('now', '-30 days')
    ")->fetchColumn();
    $result['retention_d30'] = $d30users > 0 ? round(100.0 * $d30active / $d30users, 1) : null;

    json_response($result);
}

// GET /admin/content — SRS health + hardest words (replaces get_admin_content_stats RPC)
if ($method === 'GET' && $path === '/admin/content') {
    require_admin($config);

    $result = [];

    $result['srs_breakdown'] = [
        'new'      => (int)$pdo->query("SELECT COUNT(*) FROM srs_cards WHERE repetitions = 0")->fetchColumn(),
        'learning' => (int)$pdo->query("SELECT COUNT(*) FROM srs_cards WHERE repetitions > 0 AND interval <= 1")->fetchColumn(),
        'review'   => (int)$pdo->query("SELECT COUNT(*) FROM srs_cards WHERE interval > 1 AND interval < 21")->fetchColumn(),
        'mastered' => (int)$pdo->query("SELECT COUNT(*) FROM srs_cards WHERE interval >= 21")->fetchColumn(),
        'total'    => (int)$pdo->query("SELECT COUNT(*) FROM srs_cards")->fetchColumn(),
    ];

    // Hardest words
    $stmt = $pdo->query("
        SELECT w.arabic, w.english, ROUND(AVG(sc.ease_factor), 2) AS avg_ease, COUNT(*) AS user_count
        FROM srs_cards sc
        JOIN words w ON w.id = sc.word_id
        GROUP BY w.id, w.arabic, w.english
        HAVING COUNT(*) >= 2
        ORDER BY AVG(sc.ease_factor) ASC
        LIMIT 15
    ");
    $result['hardest_words'] = $stmt->fetchAll();

    $result['total_srs_cards'] = $result['srs_breakdown']['total'];

    $total = $result['srs_breakdown']['total'];
    $mastered = $result['srs_breakdown']['mastered'];
    $result['mastered_pct'] = $total > 0 ? round(100.0 * $mastered / $total, 1) : 0;

    $result['avg_ease_factor'] = round((float)$pdo->query('SELECT AVG(ease_factor) FROM srs_cards')->fetchColumn(), 2);

    json_response($result);
}

// GET /admin/feedback
if ($method === 'GET' && $path === '/admin/feedback') {
    require_admin($config);
    $stmt = $pdo->query('SELECT * FROM feedback ORDER BY created_at DESC');
    json_response($stmt->fetchAll());
}
