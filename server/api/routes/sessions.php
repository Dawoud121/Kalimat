<?php
/**
 * App session tracking routes
 */

// POST /sessions/start
if ($method === 'POST' && $path === '/sessions/start') {
    $payload = require_auth($config);
    $stmt = $pdo->prepare("INSERT INTO app_sessions (user_id, started_at) VALUES (?, datetime('now'))");
    $stmt->execute([$payload['sub']]);
    json_response(['id' => (int)$pdo->lastInsertId()]);
}

// POST /sessions/end
if ($method === 'POST' && $path === '/sessions/end') {
    $payload = require_auth($config);
    $body = get_json_body();
    $sessionId = (int)($body['sessionId'] ?? $body['session_id'] ?? 0);
    $durationMs = $body['durationMs'] ?? $body['duration_ms'] ?? null;

    if (!$sessionId) json_response(['ok' => true]);

    $stmt = $pdo->prepare("UPDATE app_sessions SET ended_at = datetime('now'), duration_ms = ? WHERE id = ? AND user_id = ?");
    $stmt->execute([$durationMs, $sessionId, $payload['sub']]);
    json_response(['ok' => true]);
}
