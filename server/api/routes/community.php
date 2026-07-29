<?php
/**
 * Community decks + collections routes
 */

// GET /community/decks
if ($method === 'GET' && $path === '/community/decks') {
    $stmt = $pdo->query('SELECT * FROM community_decks ORDER BY order_index ASC, created_at DESC');
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) {
        $r['words_json'] = json_decode($r['words_json'] ?: '[]', true);
    }
    json_response($rows);
}

// GET /community/decks/downloads?ids=1,2,3
if ($method === 'GET' && $path === '/community/decks/downloads') {
    $ids = array_filter(explode(',', $_GET['ids'] ?? ''), fn($v) => is_numeric($v));
    if (empty($ids)) json_response([]);
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $pdo->prepare("SELECT id, download_count FROM community_decks WHERE id IN ($placeholders)");
    $stmt->execute($ids);
    $map = [];
    foreach ($stmt->fetchAll() as $r) $map[$r['id']] = (int)$r['download_count'];
    json_response($map);
}

// POST /community/decks — upload deck to community
if ($method === 'POST' && $path === '/community/decks') {
    $payload = require_auth($config);
    $body = get_json_body();

    $stmt = $pdo->prepare('
        INSERT INTO community_decks (uploaded_by_user_id, uploader_username, title, description, word_count, words_json, download_count)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ');
    $wordsJson = json_encode($body['words_json'] ?? $body['words'] ?? []);
    $stmt->execute([
        $payload['sub'],
        $body['uploader_username'] ?? 'Unknown',
        $body['title'] ?? 'Untitled',
        $body['description'] ?? '',
        (int)($body['word_count'] ?? 0),
        $wordsJson,
        (int)($body['download_count'] ?? 0),
    ]);

    $id = $pdo->lastInsertId();
    $stmt = $pdo->prepare('SELECT * FROM community_decks WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    $row['words_json'] = json_decode($row['words_json'] ?: '[]', true);
    json_response($row, 201);
}

// POST /community/decks/admin-import — admin direct import
if ($method === 'POST' && $path === '/community/decks/admin-import') {
    require_admin($config);
    $body = get_json_body();
    $words = $body['words'] ?? [];

    $stmt = $pdo->prepare('
        INSERT INTO community_decks (uploaded_by_user_id, uploader_username, title, description, word_count, words_json)
        VALUES (?, ?, ?, ?, ?, ?)
    ');
    $stmt->execute([
        $body['uploaded_by_user_id'] ?? null,
        $body['uploader_username'] ?? 'Kalimat Team',
        $body['title'] ?? 'Untitled',
        $body['description'] ?? '',
        count($words),
        json_encode($words),
    ]);

    $id = $pdo->lastInsertId();
    $stmt = $pdo->prepare('SELECT * FROM community_decks WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    $row['words_json'] = json_decode($row['words_json'] ?: '[]', true);
    json_response($row, 201);
}

// PUT /community/decks/:id — update meta
if ($method === 'PUT' && preg_match('#^/community/decks/(\d+)$#', $path, $m)) {
    $payload = require_auth($config);
    $deckId = (int)$m[1];
    $body = get_json_body();
    $isAdmin = (($payload['email'] ?? '') === $config['admin_email']);

    // Verify ownership or admin
    $stmt = $pdo->prepare('SELECT uploaded_by_user_id FROM community_decks WHERE id = ?');
    $stmt->execute([$deckId]);
    $deck = $stmt->fetch();
    if (!$deck) json_response(['error' => 'Not found'], 404);
    if ($deck['uploaded_by_user_id'] !== $payload['sub'] && !$isAdmin) {
        json_response(['error' => 'Forbidden'], 403);
    }

    $sets = [];
    $params = [];
    if (isset($body['title']))       { $sets[] = 'title = ?';       $params[] = $body['title']; }
    if (isset($body['description'])) { $sets[] = 'description = ?'; $params[] = $body['description']; }
    if (isset($body['collection_id'])) { $sets[] = 'collection_id = ?'; $params[] = $body['collection_id']; }
    if (isset($body['order_index']))   { $sets[] = 'order_index = ?';   $params[] = (int)$body['order_index']; }

    if (empty($sets)) json_response(['error' => 'Nothing to update'], 400);
    $params[] = $deckId;
    $pdo->prepare('UPDATE community_decks SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);

    $stmt = $pdo->prepare('SELECT * FROM community_decks WHERE id = ?');
    $stmt->execute([$deckId]);
    $row = $stmt->fetch();
    $row['words_json'] = json_decode($row['words_json'] ?: '[]', true);
    json_response($row);
}

// PUT /community/decks/:id/words — admin patch words
if ($method === 'PUT' && preg_match('#^/community/decks/(\d+)/words$#', $path, $m)) {
    require_admin($config);
    $deckId = (int)$m[1];
    $body = get_json_body();
    $words = $body['words'] ?? [];
    $stmt = $pdo->prepare('UPDATE community_decks SET words_json = ?, word_count = ? WHERE id = ?');
    $stmt->execute([json_encode($words), count($words), $deckId]);
    json_response(['ok' => true]);
}

// DELETE /community/decks/:id
if ($method === 'DELETE' && preg_match('#^/community/decks/(\d+)$#', $path, $m)) {
    $payload = require_auth($config);
    $deckId = (int)$m[1];
    $isAdmin = (($payload['email'] ?? '') === $config['admin_email']);

    $stmt = $pdo->prepare('SELECT uploaded_by_user_id FROM community_decks WHERE id = ?');
    $stmt->execute([$deckId]);
    $deck = $stmt->fetch();
    if (!$deck) json_response(['error' => 'Not found'], 404);
    if ($deck['uploaded_by_user_id'] !== $payload['sub'] && !$isAdmin) {
        json_response(['error' => 'Forbidden'], 403);
    }

    $pdo->prepare('DELETE FROM community_decks WHERE id = ?')->execute([$deckId]);
    json_response(['ok' => true]);
}

// POST /community/decks/:id/download — increment download count
if ($method === 'POST' && preg_match('#^/community/decks/(\d+)/download$#', $path, $m)) {
    $deckId = (int)$m[1];
    $pdo->prepare('UPDATE community_decks SET download_count = download_count + 1 WHERE id = ?')->execute([$deckId]);
    json_response(['ok' => true]);
}

// ── Community Collections ──

// GET /community/collections
if ($method === 'GET' && $path === '/community/collections') {
    $stmt = $pdo->query('SELECT * FROM community_collections ORDER BY order_index ASC');
    json_response($stmt->fetchAll());
}

// POST /community/collections
if ($method === 'POST' && $path === '/community/collections') {
    require_admin($config);
    $body = get_json_body();
    $maxOrder = (int)$pdo->query('SELECT COALESCE(MAX(order_index), -1) FROM community_collections')->fetchColumn();
    $stmt = $pdo->prepare('INSERT INTO community_collections (title, order_index) VALUES (?, ?)');
    $stmt->execute([$body['title'] ?? 'Untitled', $maxOrder + 1]);
    $id = $pdo->lastInsertId();
    $stmt = $pdo->prepare('SELECT * FROM community_collections WHERE id = ?');
    $stmt->execute([$id]);
    json_response($stmt->fetch(), 201);
}

// PUT /community/collections/:id
if ($method === 'PUT' && preg_match('#^/community/collections/(\d+)$#', $path, $m)) {
    require_admin($config);
    $body = get_json_body();
    $stmt = $pdo->prepare('UPDATE community_collections SET title = ? WHERE id = ?');
    $stmt->execute([$body['title'] ?? '', (int)$m[1]]);
    json_response(['ok' => true]);
}

// DELETE /community/collections/:id
if ($method === 'DELETE' && preg_match('#^/community/collections/(\d+)$#', $path, $m)) {
    require_admin($config);
    $collId = (int)$m[1];
    // Unlink decks first
    $pdo->prepare('UPDATE community_decks SET collection_id = NULL WHERE collection_id = ?')->execute([$collId]);
    $pdo->prepare('DELETE FROM community_collections WHERE id = ?')->execute([$collId]);
    json_response(['ok' => true]);
}

// POST /community/collections/reorder
if ($method === 'POST' && $path === '/community/collections/reorder') {
    require_admin($config);
    $body = get_json_body();
    $items = $body['items'] ?? [];
    $stmt = $pdo->prepare('UPDATE community_collections SET order_index = ? WHERE id = ?');
    foreach ($items as $item) {
        $stmt->execute([(int)$item['order_index'], (int)$item['id']]);
    }
    json_response(['ok' => true]);
}

// POST /community/decks/reorder
if ($method === 'POST' && $path === '/community/decks/reorder') {
    require_admin($config);
    $body = get_json_body();
    $items = $body['items'] ?? [];
    $stmt = $pdo->prepare('UPDATE community_decks SET order_index = ?, collection_id = ? WHERE id = ?');
    foreach ($items as $item) {
        $stmt->execute([(int)$item['order_index'], $item['collection_id'] ?? null, (int)$item['id']]);
    }
    json_response(['ok' => true]);
}
