<?php
/**
 * Word routes: CRUD + batch operations
 */

// GET /words — all user words
if ($method === 'GET' && $path === '/words') {
    $payload = require_auth($config);
    $stmt = $pdo->prepare('SELECT * FROM words WHERE user_id = ? ORDER BY created_at ASC');
    $stmt->execute([$payload['sub']]);
    json_response($stmt->fetchAll());
}

// GET /words/deck/:deckId
if ($method === 'GET' && preg_match('#^/words/deck/(\d+)$#', $path, $m)) {
    $payload = require_auth($config);
    $stmt = $pdo->prepare('SELECT * FROM words WHERE deck_id = ? AND user_id = ? ORDER BY created_at ASC');
    $stmt->execute([(int)$m[1], $payload['sub']]);
    json_response($stmt->fetchAll());
}

// GET /words/counts — { deckId: count } map for the user
if ($method === 'GET' && $path === '/words/counts') {
    $payload = require_auth($config);
    $stmt = $pdo->prepare('SELECT deck_id, COUNT(*) as cnt FROM words WHERE user_id = ? GROUP BY deck_id');
    $stmt->execute([$payload['sub']]);
    $rows = $stmt->fetchAll();
    $map = [];
    foreach ($rows as $r) {
        $map[$r['deck_id'] ?? 'null'] = (int)$r['cnt'];
    }
    json_response($map);
}

// GET /words/exists?arabic=Y[&deckId=X]
if ($method === 'GET' && $path === '/words/exists') {
    $payload = require_auth($config);
    $deckId = $_GET['deckId'] ?? null;
    $arabic = $_GET['arabic'] ?? '';
    if ($deckId) {
        $stmt = $pdo->prepare('SELECT id FROM words WHERE user_id = ? AND deck_id = ? AND arabic = ? LIMIT 1');
        $stmt->execute([$payload['sub'], $deckId, $arabic]);
    } else {
        $stmt = $pdo->prepare('SELECT id FROM words WHERE user_id = ? AND arabic = ? LIMIT 1');
        $stmt->execute([$payload['sub'], $arabic]);
    }
    json_response(['exists' => (bool)$stmt->fetch()]);
}

// POST /words — create single word
if ($method === 'POST' && $path === '/words') {
    $payload = require_auth($config);
    $body = get_json_body();

    // Auto-fill root from dictionary if not supplied
    $root = $body['root'] ?? '';
    if (!$root && !empty($body['arabic'])) {
        $root = _lookup_root($pdo, $body['arabic']) ?? '';
    }

    $stmt = $pdo->prepare('
        INSERT INTO words (user_id, deck_id, arabic, english, root, part_of_speech, example_sentence,
                           notes, color, past, present, command, masdar, singular, dual, plural)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ');
    $stmt->execute([
        $payload['sub'],
        $body['deck_id'] ?? null,
        $body['arabic'] ?? '',
        $body['english'] ?? '',
        $root,
        $body['part_of_speech'] ?? '',
        $body['example_sentence'] ?? '',
        $body['notes'] ?? '',
        $body['color'] ?? null,
        $body['past'] ?? '',
        $body['present'] ?? '',
        $body['command'] ?? '',
        $body['masdar'] ?? '',
        $body['singular'] ?? '',
        $body['dual'] ?? '',
        $body['plural'] ?? '',
    ]);
    $id = $pdo->lastInsertId();
    $stmt = $pdo->prepare('SELECT * FROM words WHERE id = ?');
    $stmt->execute([$id]);
    json_response($stmt->fetch(), 201);
}

// POST /words/batch — batch insert (used by batchImportDeck)
if ($method === 'POST' && $path === '/words/batch') {
    $payload = require_auth($config);
    $body = get_json_body();
    $words = $body['words'] ?? [];
    $deckId = $body['deck_id'] ?? null;

    if (empty($words)) json_response([]);

    $stmt = $pdo->prepare('
        INSERT INTO words (user_id, deck_id, arabic, english, root, part_of_speech, example_sentence,
                           notes, past, present, command, masdar, singular, dual, plural)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ');

    $inserted = [];
    $pdo->beginTransaction();
    try {
        foreach ($words as $w) {
            $root = $w['root'] ?? '';
            if (!$root && !empty($w['arabic'])) {
                $root = _lookup_root($pdo, $w['arabic']) ?? '';
            }
            $stmt->execute([
                $payload['sub'],
                $deckId,
                $w['arabic'] ?? '',
                $w['english'] ?? '',
                $root,
                $w['part_of_speech'] ?? '',
                $w['example_sentence'] ?? '',
                $w['notes'] ?? '',
                $w['past'] ?? '',
                $w['present'] ?? '',
                $w['command'] ?? '',
                $w['masdar'] ?? '',
                $w['singular'] ?? '',
                $w['dual'] ?? '',
                $w['plural'] ?? '',
            ]);
            $inserted[] = ['id' => (int)$pdo->lastInsertId()];
        }
        $pdo->commit();
    } catch (Exception $e) {
        $pdo->rollBack();
        json_response(['error' => 'Batch insert failed'], 500);
    }

    json_response($inserted, 201);
}

// PUT /words/:id
if ($method === 'PUT' && preg_match('#^/words/(\d+)$#', $path, $m)) {
    $payload = require_auth($config);
    $wordId = (int)$m[1];

    // Verify ownership
    $stmt = $pdo->prepare('SELECT user_id FROM words WHERE id = ?');
    $stmt->execute([$wordId]);
    $word = $stmt->fetch();
    if (!$word || $word['user_id'] !== $payload['sub']) {
        json_response(['error' => 'Not found'], 404);
    }

    $body = get_json_body();
    $allowed = ['arabic','english','root','part_of_speech','example_sentence','notes','color',
                'deck_id','past','present','command','masdar','singular','dual','plural'];
    $sets = [];
    $params = [];
    foreach ($allowed as $col) {
        if (array_key_exists($col, $body)) {
            $sets[] = "$col = ?";
            $params[] = $body[$col];
        }
    }
    if (empty($sets)) json_response(['error' => 'Nothing to update'], 400);

    $params[] = $wordId;
    $stmt = $pdo->prepare('UPDATE words SET ' . implode(', ', $sets) . ' WHERE id = ?');
    $stmt->execute($params);

    $stmt = $pdo->prepare('SELECT * FROM words WHERE id = ?');
    $stmt->execute([$wordId]);
    json_response($stmt->fetch());
}

// DELETE /words/:id
if ($method === 'DELETE' && preg_match('#^/words/(\d+)$#', $path, $m)) {
    $payload = require_auth($config);
    $wordId = (int)$m[1];

    $stmt = $pdo->prepare('SELECT user_id FROM words WHERE id = ?');
    $stmt->execute([$wordId]);
    $word = $stmt->fetch();
    if (!$word || $word['user_id'] !== $payload['sub']) {
        json_response(['error' => 'Not found'], 404);
    }

    $pdo->prepare('DELETE FROM srs_cards WHERE word_id = ?')->execute([$wordId]);
    $pdo->prepare('DELETE FROM words WHERE id = ?')->execute([$wordId]);
    json_response(['ok' => true]);
}

// POST /words/batch-delete
if ($method === 'POST' && $path === '/words/batch-delete') {
    $payload = require_auth($config);
    $body = get_json_body();
    $ids = $body['ids'] ?? [];
    if (empty($ids)) json_response(['ok' => true]);

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $params = array_merge($ids, [$payload['sub']]);

    $pdo->prepare("DELETE FROM srs_cards WHERE word_id IN ($placeholders)")->execute($ids);
    $pdo->prepare("DELETE FROM words WHERE id IN ($placeholders) AND user_id = ?")->execute($params);
    json_response(['ok' => true]);
}

// ── Helper: look up root from dictionary ──
function _lookup_root(PDO $pdo, string $arabic): ?string {
    $stripped = normalize_arabic($arabic);
    if (!$stripped) return null;
    $stmt = $pdo->prepare("SELECT root FROM dictionary WHERE arabic = ? LIMIT 1");
    $stmt->execute([$arabic]);
    $row = $stmt->fetch();
    if ($row && $row['root']) return $row['root'];
    // Try stripped match
    $all = $pdo->query("SELECT arabic, root FROM dictionary WHERE root != '' AND root IS NOT NULL LIMIT 5000")->fetchAll();
    foreach ($all as $entry) {
        if (normalize_arabic($entry['arabic']) === $stripped && $entry['root']) {
            return $entry['root'];
        }
    }
    return null;
}
