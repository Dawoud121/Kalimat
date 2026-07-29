<?php
/**
 * SRS card routes: CRUD + due/all with word joins + batch + reset + mark-known
 */

// GET /srs — all user cards (raw)
if ($method === 'GET' && $path === '/srs') {
    $payload = require_auth($config);
    $stmt = $pdo->prepare('SELECT * FROM srs_cards WHERE user_id = ?');
    $stmt->execute([$payload['sub']]);
    json_response($stmt->fetchAll());
}

// GET /srs/due?deckId=X — due cards with joined word data
if ($method === 'GET' && $path === '/srs/due') {
    $payload = require_auth($config);
    $now = gmdate('Y-m-d\TH:i:s\Z');
    $deckId = $_GET['deckId'] ?? null;

    $sql = '
        SELECT s.*, w.arabic, w.english, w.root, w.part_of_speech, w.example_sentence,
               w.notes, w.color, w.deck_id AS word_deck_id, w.past, w.present, w.command,
               w.masdar, w.singular, w.dual, w.plural
        FROM srs_cards s
        JOIN words w ON w.id = s.word_id
        WHERE s.user_id = ? AND s.next_review_date <= ?
    ';
    $params = [$payload['sub'], $now];

    if ($deckId) {
        $sql .= ' AND s.deck_id = ?';
        $params[] = (int)$deckId;
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    // Shape: card + nested word object (matches Supabase select('*, words(*)') shape)
    $result = array_map(function($r) {
        $word = [
            'id' => $r['word_id'], 'arabic' => $r['arabic'], 'english' => $r['english'],
            'root' => $r['root'], 'part_of_speech' => $r['part_of_speech'],
            'example_sentence' => $r['example_sentence'], 'notes' => $r['notes'],
            'color' => $r['color'], 'deck_id' => $r['word_deck_id'],
            'past' => $r['past'], 'present' => $r['present'], 'command' => $r['command'],
            'masdar' => $r['masdar'], 'singular' => $r['singular'], 'dual' => $r['dual'],
            'plural' => $r['plural'],
        ];
        return [
            'id' => $r['id'], 'user_id' => $r['user_id'], 'word_id' => $r['word_id'],
            'deck_id' => $r['deck_id'], 'repetitions' => $r['repetitions'],
            'ease_factor' => $r['ease_factor'], 'interval' => $r['interval'],
            'next_review_date' => $r['next_review_date'], 'last_reviewed' => $r['last_reviewed'],
            'created_at' => $r['created_at'], 'words' => $word,
        ];
    }, $rows);

    json_response($result);
}

// GET /srs/all?deckId=X — all cards with joined word data
if ($method === 'GET' && $path === '/srs/all') {
    $payload = require_auth($config);
    $deckId = $_GET['deckId'] ?? null;

    $sql = '
        SELECT s.*, w.arabic, w.english, w.root, w.part_of_speech, w.example_sentence,
               w.notes, w.color, w.deck_id AS word_deck_id, w.past, w.present, w.command,
               w.masdar, w.singular, w.dual, w.plural
        FROM srs_cards s
        JOIN words w ON w.id = s.word_id
        WHERE s.user_id = ?
    ';
    $params = [$payload['sub']];

    if ($deckId) {
        $sql .= ' AND s.deck_id = ?';
        $params[] = (int)$deckId;
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    $result = array_map(function($r) {
        $word = [
            'id' => $r['word_id'], 'arabic' => $r['arabic'], 'english' => $r['english'],
            'root' => $r['root'], 'part_of_speech' => $r['part_of_speech'],
            'example_sentence' => $r['example_sentence'], 'notes' => $r['notes'],
            'color' => $r['color'], 'deck_id' => $r['word_deck_id'],
            'past' => $r['past'], 'present' => $r['present'], 'command' => $r['command'],
            'masdar' => $r['masdar'], 'singular' => $r['singular'], 'dual' => $r['dual'],
            'plural' => $r['plural'],
        ];
        return [
            'id' => $r['id'], 'user_id' => $r['user_id'], 'word_id' => $r['word_id'],
            'deck_id' => $r['deck_id'], 'repetitions' => $r['repetitions'],
            'ease_factor' => $r['ease_factor'], 'interval' => $r['interval'],
            'next_review_date' => $r['next_review_date'], 'last_reviewed' => $r['last_reviewed'],
            'created_at' => $r['created_at'], 'words' => $word,
        ];
    }, $rows);

    json_response($result);
}

// GET /srs/deck/:deckId — raw cards in a deck
if ($method === 'GET' && preg_match('#^/srs/deck/(\d+)$#', $path, $m)) {
    $payload = require_auth($config);
    $stmt = $pdo->prepare('SELECT * FROM srs_cards WHERE user_id = ? AND deck_id = ?');
    $stmt->execute([$payload['sub'], (int)$m[1]]);
    json_response($stmt->fetchAll());
}

// GET /srs/word/:wordId
if ($method === 'GET' && preg_match('#^/srs/word/(\d+)$#', $path, $m)) {
    $payload = require_auth($config);
    $stmt = $pdo->prepare('SELECT * FROM srs_cards WHERE user_id = ? AND word_id = ?');
    $stmt->execute([$payload['sub'], (int)$m[1]]);
    $card = $stmt->fetch();
    json_response($card ?: null);
}

// POST /srs — create single card
if ($method === 'POST' && $path === '/srs') {
    $payload = require_auth($config);
    $body = get_json_body();
    $now = gmdate('Y-m-d\TH:i:s\Z');
    $stmt = $pdo->prepare('
        INSERT INTO srs_cards (user_id, word_id, deck_id, repetitions, ease_factor, interval, next_review_date)
        VALUES (?, ?, ?, 0, 2.5, 1, ?)
    ');
    $stmt->execute([
        $payload['sub'],
        (int)($body['word_id'] ?? 0),
        $body['deck_id'] ?? null,
        $now,
    ]);
    $id = $pdo->lastInsertId();
    $stmt = $pdo->prepare('SELECT * FROM srs_cards WHERE id = ?');
    $stmt->execute([$id]);
    json_response($stmt->fetch(), 201);
}

// POST /srs/batch — batch create cards
if ($method === 'POST' && $path === '/srs/batch') {
    $payload = require_auth($config);
    $body = get_json_body();
    $cards = $body['cards'] ?? [];
    $now = gmdate('Y-m-d\TH:i:s\Z');

    $stmt = $pdo->prepare('
        INSERT INTO srs_cards (user_id, word_id, deck_id, repetitions, ease_factor, interval, next_review_date)
        VALUES (?, ?, ?, 0, 2.5, 1, ?)
    ');

    $pdo->beginTransaction();
    try {
        foreach ($cards as $c) {
            $stmt->execute([
                $payload['sub'],
                (int)($c['word_id'] ?? 0),
                $c['deck_id'] ?? null,
                $now,
            ]);
        }
        $pdo->commit();
    } catch (Exception $e) {
        $pdo->rollBack();
        json_response(['error' => 'Batch insert failed'], 500);
    }

    json_response(['ok' => true, 'count' => count($cards)], 201);
}

// PUT /srs/:id — update card (SRS state after rating)
if ($method === 'PUT' && preg_match('#^/srs/(\d+)$#', $path, $m)) {
    $payload = require_auth($config);
    $cardId = (int)$m[1];
    $body = get_json_body();

    $stmt = $pdo->prepare('SELECT user_id FROM srs_cards WHERE id = ?');
    $stmt->execute([$cardId]);
    $card = $stmt->fetch();
    if (!$card || $card['user_id'] !== $payload['sub']) {
        json_response(['error' => 'Not found'], 404);
    }

    $allowed = ['repetitions', 'ease_factor', 'interval', 'next_review_date', 'last_reviewed'];
    $sets = [];
    $params = [];
    foreach ($allowed as $col) {
        if (array_key_exists($col, $body)) {
            $sets[] = "$col = ?";
            $params[] = $body[$col];
        }
    }
    if (empty($sets)) json_response(['error' => 'Nothing to update'], 400);

    $params[] = $cardId;
    $stmt = $pdo->prepare('UPDATE srs_cards SET ' . implode(', ', $sets) . ' WHERE id = ?');
    $stmt->execute($params);
    json_response(['ok' => true]);
}

// POST /srs/reset/:id — reset single card
if ($method === 'POST' && preg_match('#^/srs/reset/(\d+)$#', $path, $m)) {
    $payload = require_auth($config);
    $now = gmdate('Y-m-d\TH:i:s\Z');
    $stmt = $pdo->prepare('
        UPDATE srs_cards SET repetitions = 0, ease_factor = 2.5, interval = 1,
               next_review_date = ?, last_reviewed = NULL
        WHERE id = ? AND user_id = ?
    ');
    $stmt->execute([$now, (int)$m[1], $payload['sub']]);
    json_response(['ok' => true]);
}

// POST /srs/reset-deck — reset all cards in a deck
if ($method === 'POST' && $path === '/srs/reset-deck') {
    $payload = require_auth($config);
    $body = get_json_body();
    $deckId = (int)($body['deckId'] ?? 0);
    $now = gmdate('Y-m-d\TH:i:s\Z');
    $stmt = $pdo->prepare('
        UPDATE srs_cards SET repetitions = 0, ease_factor = 2.5, interval = 1,
               next_review_date = ?, last_reviewed = NULL
        WHERE user_id = ? AND deck_id = ?
    ');
    $stmt->execute([$now, $payload['sub'], $deckId]);
    json_response(['ok' => true]);
}

// POST /srs/mark-known — mark multiple cards as mastered
if ($method === 'POST' && $path === '/srs/mark-known') {
    $payload = require_auth($config);
    $body = get_json_body();
    $cardIds = $body['cardIds'] ?? [];
    if (empty($cardIds)) json_response(['ok' => true]);

    $now = gmdate('Y-m-d\TH:i:s\Z');
    $future = gmdate('Y-m-d\TH:i:s\Z', time() + 21 * 86400);
    $placeholders = implode(',', array_fill(0, count($cardIds), '?'));
    $params = array_merge([$future, $now], $cardIds, [$payload['sub']]);

    $stmt = $pdo->prepare("
        UPDATE srs_cards SET repetitions = 3, ease_factor = 2.5, interval = 21,
               next_review_date = ?, last_reviewed = ?
        WHERE id IN ($placeholders) AND user_id = ?
    ");
    $stmt->execute($params);
    json_response(['ok' => true]);
}
