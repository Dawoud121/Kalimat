<?php
/**
 * Feedback routes
 */

// POST /feedback — submit
if ($method === 'POST' && $path === '/feedback') {
    $payload = require_auth($config);
    $body = get_json_body();
    $stmt = $pdo->prepare('INSERT INTO feedback (user_id, email, type, message) VALUES (?, ?, ?, ?)');
    $stmt->execute([
        $payload['sub'],
        $body['email'] ?? null,
        $body['type'] ?? 'bug',
        $body['message'] ?? '',
    ]);
    json_response(['ok' => true], 201);
}

// GET /feedback — admin list (routed via /admin prefix in index.php won't catch this, so also match /feedback for admin)
if ($method === 'GET' && $path === '/feedback') {
    require_admin($config);
    $stmt = $pdo->query('SELECT * FROM feedback ORDER BY created_at DESC');
    json_response($stmt->fetchAll());
}
