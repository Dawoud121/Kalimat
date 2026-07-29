<?php
/**
 * Study log routes
 */

// POST /study/log — upsert study session (replaces log_study_session RPC)
if ($method === 'POST' && $path === '/study/log') {
    $payload = require_auth($config);
    $body = get_json_body();
    $count = (int)($body['count'] ?? 0);
    $sessionMs = (int)($body['sessionMs'] ?? $body['session_ms'] ?? 0);
    $date = $body['date'] ?? date('Y-m-d');

    if ($count <= 0) json_response(['ok' => true]);

    $stmt = $pdo->prepare('
        INSERT INTO study_log (user_id, date, cards_reviewed, session_ms)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, date) DO UPDATE SET
            cards_reviewed = study_log.cards_reviewed + excluded.cards_reviewed,
            session_ms = study_log.session_ms + excluded.session_ms
    ');
    $stmt->execute([$payload['sub'], $date, $count, $sessionMs]);
    json_response(['ok' => true]);
}

// GET /study/log — user's study history
if ($method === 'GET' && $path === '/study/log') {
    $payload = require_auth($config);
    $stmt = $pdo->prepare('SELECT date, cards_reviewed, session_ms FROM study_log WHERE user_id = ? ORDER BY date DESC');
    $stmt->execute([$payload['sub']]);
    json_response($stmt->fetchAll());
}
