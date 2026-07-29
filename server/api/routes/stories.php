<?php
/**
 * Stories + Collections + Progress routes
 */

// GET /collections
if ($method === 'GET' && str_starts_with($path, '/collections')) {
    $category = $_GET['category'] ?? null;
    $sql = 'SELECT * FROM collections';
    $params = [];
    if ($category) { $sql .= ' WHERE category = ?'; $params[] = $category; }
    $sql .= ' ORDER BY order_index ASC';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    json_response($stmt->fetchAll());
}

// GET /stories/progress — user's progress map
if ($method === 'GET' && $path === '/stories/progress') {
    $payload = require_auth($config);
    $stmt = $pdo->prepare('SELECT * FROM story_progress WHERE user_id = ?');
    $stmt->execute([$payload['sub']]);
    json_response($stmt->fetchAll());
}

// PUT /stories/progress — upsert progress
if ($method === 'PUT' && $path === '/stories/progress') {
    $payload = require_auth($config);
    $body = get_json_body();
    $storyId = (int)($body['storyId'] ?? $body['story_id'] ?? 0);
    $segmentsRead = (int)($body['segmentsRead'] ?? $body['segments_read'] ?? 0);
    $completed = !empty($body['completed']) ? 1 : 0;

    $stmt = $pdo->prepare("
        INSERT INTO story_progress (user_id, story_id, segments_read, completed, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(user_id, story_id)
        DO UPDATE SET segments_read = excluded.segments_read, completed = excluded.completed, updated_at = datetime('now')
    ");
    $stmt->execute([$payload['sub'], $storyId, $segmentsRead, $completed]);
    json_response(['ok' => true]);
}

// GET /stories?collectionSlug=X — list stories
if ($method === 'GET' && $path === '/stories') {
    $slug = $_GET['collectionSlug'] ?? $_GET['collection_slug'] ?? null;
    $sql = 'SELECT * FROM stories';
    $params = [];
    if ($slug) { $sql .= ' WHERE collection_slug = ?'; $params[] = $slug; }
    $sql .= ' ORDER BY order_index ASC';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) {
        $r['segments'] = json_decode($r['segments'] ?: '[]', true);
    }
    json_response($rows);
}

// GET /stories/:id — single story
if ($method === 'GET' && preg_match('#^/stories/(\d+)$#', $path, $m)) {
    $stmt = $pdo->prepare('SELECT * FROM stories WHERE id = ?');
    $stmt->execute([(int)$m[1]]);
    $row = $stmt->fetch();
    if (!$row) json_response(['error' => 'Not found'], 404);
    $row['segments'] = json_decode($row['segments'] ?: '[]', true);
    json_response($row);
}
