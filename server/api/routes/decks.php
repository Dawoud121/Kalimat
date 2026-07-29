<?php
/**
 * Deck routes: CRUD + public decks
 */

// GET /decks — all user decks
if ($method === 'GET' && $path === '/decks') {
    $payload = require_auth($config);
    $stmt = $pdo->prepare('SELECT * FROM decks WHERE user_id = ? ORDER BY created_at ASC');
    $stmt->execute([$payload['sub']]);
    json_response($stmt->fetchAll());
}

// GET /decks/public
if ($method === 'GET' && $path === '/decks/public') {
    $stmt = $pdo->query('
        SELECT d.*, p.username AS uploader_name
        FROM decks d
        JOIN profiles p ON p.id = d.user_id
        WHERE d.is_public = 1
        ORDER BY d.created_at DESC
    ');
    json_response($stmt->fetchAll());
}

// POST /decks — create
if ($method === 'POST' && $path === '/decks') {
    $payload = require_auth($config);
    $body = get_json_body();
    $stmt = $pdo->prepare('
        INSERT INTO decks (user_id, title, description, is_public, source_community_deck_id)
        VALUES (?, ?, ?, ?, ?)
    ');
    $stmt->execute([
        $payload['sub'],
        $body['title'] ?? 'Untitled',
        $body['description'] ?? '',
        !empty($body['is_public']) ? 1 : 0,
        $body['source_community_deck_id'] ?? null,
    ]);
    $id = $pdo->lastInsertId();
    $stmt = $pdo->prepare('SELECT * FROM decks WHERE id = ?');
    $stmt->execute([$id]);
    json_response($stmt->fetch(), 201);
}

// PUT /decks/:id
if ($method === 'PUT' && preg_match('#^/decks/(\d+)$#', $path, $m)) {
    $payload = require_auth($config);
    $deckId = (int)$m[1];
    $body = get_json_body();

    // Verify ownership
    $stmt = $pdo->prepare('SELECT user_id FROM decks WHERE id = ?');
    $stmt->execute([$deckId]);
    $deck = $stmt->fetch();
    if (!$deck || $deck['user_id'] !== $payload['sub']) {
        json_response(['error' => 'Not found or not owned'], 404);
    }

    $allowed = ['title', 'description', 'is_public', 'community_deck_id', 'saved_download_count',
                'review_frequency', 'review_interval_days', 'next_deck_review'];
    $sets = [];
    $params = [];
    foreach ($allowed as $col) {
        if (array_key_exists($col, $body)) {
            $sets[] = "$col = ?";
            $val = $body[$col];
            if ($col === 'is_public') $val = $val ? 1 : 0;
            $params[] = $val;
        }
    }
    if (empty($sets)) json_response(['error' => 'Nothing to update'], 400);

    $params[] = $deckId;
    $stmt = $pdo->prepare('UPDATE decks SET ' . implode(', ', $sets) . ' WHERE id = ?');
    $stmt->execute($params);

    $stmt = $pdo->prepare('SELECT * FROM decks WHERE id = ?');
    $stmt->execute([$deckId]);
    json_response($stmt->fetch());
}

// DELETE /decks/:id
if ($method === 'DELETE' && preg_match('#^/decks/(\d+)$#', $path, $m)) {
    $payload = require_auth($config);
    $deckId = (int)$m[1];

    $stmt = $pdo->prepare('SELECT user_id FROM decks WHERE id = ?');
    $stmt->execute([$deckId]);
    $deck = $stmt->fetch();
    if (!$deck || $deck['user_id'] !== $payload['sub']) {
        json_response(['error' => 'Not found or not owned'], 404);
    }

    // Explicit cascade: srs_cards, words, then deck
    $pdo->prepare('DELETE FROM srs_cards WHERE deck_id = ?')->execute([$deckId]);
    $pdo->prepare('DELETE FROM words WHERE deck_id = ?')->execute([$deckId]);
    $pdo->prepare('DELETE FROM decks WHERE id = ?')->execute([$deckId]);

    json_response(['ok' => true]);
}
