<?php
/**
 * Sentence routes: CRUD + approve/reject + propagate
 */

// GET /sentences?wordId=X — sentences for a word
if ($method === 'GET' && $path === '/sentences' && isset($_GET['wordId'])) {
    $stmt = $pdo->prepare("SELECT * FROM sentences WHERE word_id = ? AND source != 'propagated' ORDER BY created_at DESC");
    $stmt->execute([(int)$_GET['wordId']]);
    json_response($stmt->fetchAll());
}

// GET /sentences/user — current user's sentences
if ($method === 'GET' && $path === '/sentences/user') {
    $payload = require_auth($config);
    $stmt = $pdo->prepare('SELECT * FROM sentences WHERE user_id = ? ORDER BY created_at DESC');
    $stmt->execute([$payload['sub']]);
    json_response($stmt->fetchAll());
}

// GET /sentences/admin — all sentences (admin only)
if ($method === 'GET' && $path === '/sentences/admin') {
    require_admin($config);
    $stmt = $pdo->query('SELECT * FROM sentences ORDER BY created_at DESC');
    json_response($stmt->fetchAll());
}

// GET /sentences (no wordId) — all user sentences
if ($method === 'GET' && $path === '/sentences' && !isset($_GET['wordId'])) {
    $payload = require_auth($config);
    $stmt = $pdo->prepare('SELECT * FROM sentences WHERE user_id = ? ORDER BY created_at DESC');
    $stmt->execute([$payload['sub']]);
    json_response($stmt->fetchAll());
}

// POST /sentences — create
if ($method === 'POST' && $path === '/sentences') {
    $payload = require_auth($config);
    $body = get_json_body();

    $stmt = $pdo->prepare('
        INSERT INTO sentences (user_id, arabic, translation, word_id, source, status)
        VALUES (?, ?, ?, ?, ?, ?)
    ');
    $stmt->execute([
        $payload['sub'],
        trim($body['arabic'] ?? ''),
        trim($body['translation'] ?? ''),
        $body['word_id'] ?? null,
        $body['source'] ?? 'user',
        'pending',
    ]);
    $id = $pdo->lastInsertId();
    $stmt = $pdo->prepare('SELECT * FROM sentences WHERE id = ?');
    $stmt->execute([$id]);
    json_response($stmt->fetch(), 201);
}

// POST /sentences/batch — batch insert (used during deck import)
if ($method === 'POST' && $path === '/sentences/batch') {
    $payload = require_auth($config);
    $body = get_json_body();
    $sentences = $body['sentences'] ?? [];

    $stmt = $pdo->prepare('INSERT INTO sentences (user_id, arabic, translation, word_id, source, status) VALUES (?, ?, ?, ?, ?, ?)');
    $pdo->beginTransaction();
    try {
        foreach ($sentences as $s) {
            $stmt->execute([
                $payload['sub'],
                trim($s['arabic'] ?? ''),
                trim($s['translation'] ?? ''),
                $s['word_id'] ?? null,
                $s['source'] ?? 'user',
                $s['status'] ?? 'pending',
            ]);
        }
        $pdo->commit();
    } catch (Exception $e) {
        $pdo->rollBack();
        json_response(['error' => 'Batch insert failed'], 500);
    }
    json_response(['ok' => true, 'count' => count($sentences)], 201);
}

// PUT /sentences/:id
if ($method === 'PUT' && preg_match('#^/sentences/(\d+)$#', $path, $m)) {
    $payload = require_auth($config);
    $sentId = (int)$m[1];
    $body = get_json_body();
    $isAdmin = (($payload['email'] ?? '') === $config['admin_email']);

    $sets = [];
    $params = [];
    if (isset($body['arabic']))      { $sets[] = 'arabic = ?';      $params[] = trim($body['arabic']); }
    if (isset($body['translation'])) { $sets[] = 'translation = ?'; $params[] = trim($body['translation']); }
    $sets[] = "updated_at = datetime('now')";

    // Protect status/source — admin only (replaces protect_sentence_status trigger)
    if ($isAdmin) {
        if (isset($body['status'])) { $sets[] = 'status = ?'; $params[] = $body['status']; }
        if (isset($body['source'])) { $sets[] = 'source = ?'; $params[] = $body['source']; }
    }

    $params[] = $sentId;
    $pdo->prepare('UPDATE sentences SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);

    $stmt = $pdo->prepare('SELECT * FROM sentences WHERE id = ?');
    $stmt->execute([$sentId]);
    json_response($stmt->fetch());
}

// POST /sentences/:id/approve — admin
if ($method === 'POST' && preg_match('#^/sentences/(\d+)/approve$#', $path, $m)) {
    require_admin($config);
    $pdo->prepare("UPDATE sentences SET status = 'approved' WHERE id = ?")->execute([(int)$m[1]]);
    json_response(['ok' => true]);
}

// POST /sentences/:id/reject — admin
if ($method === 'POST' && preg_match('#^/sentences/(\d+)/reject$#', $path, $m)) {
    require_admin($config);
    $pdo->prepare("UPDATE sentences SET status = 'rejected' WHERE id = ?")->execute([(int)$m[1]]);
    json_response(['ok' => true]);
}

// POST /sentences/:id/propagate — propagate to matching words
if ($method === 'POST' && preg_match('#^/sentences/(\d+)/propagate$#', $path, $m)) {
    require_admin($config);
    $sentId = (int)$m[1];
    $body = get_json_body();
    $words = $body['words'] ?? [];

    $stmt = $pdo->prepare('SELECT * FROM sentences WHERE id = ?');
    $stmt->execute([$sentId]);
    $sentence = $stmt->fetch();
    if (!$sentence) json_response(['error' => 'Sentence not found'], 404);

    // Tokenize and strip
    $tokens = preg_split('/\s+/u', trim($sentence['arabic']));
    $strippedTokens = array_filter(array_map(function($t) {
        $t = strip_arabic_diacritics($t);
        // Remove common prefixes
        $t = preg_replace('/^[\x{0648}\x{0641}\x{0628}\x{0644}\x{0643}](?=[\x{0600}-\x{06FF}])/u', '', $t);
        $t = preg_replace('/^\x{0627}\x{0644}/u', '', $t);
        return trim($t);
    }, $tokens));

    $matched = [];
    foreach ($words as $w) {
        if (($w['id'] ?? null) == $sentence['word_id']) continue;
        $ws = strip_arabic_diacritics($w['arabic'] ?? '');
        foreach ($strippedTokens as $t) {
            if ($t === $ws || (str_starts_with($t, $ws) && mb_strlen($t) - mb_strlen($ws) <= 2)) {
                $matched[] = $w;
                break;
            }
        }
    }

    if (empty($matched)) json_response(['matched' => [], 'count' => 0]);

    $stmt = $pdo->prepare("INSERT INTO sentences (user_id, word_id, arabic, translation, source, status) VALUES (?, ?, ?, ?, 'propagated', 'approved')");
    foreach ($matched as $w) {
        $stmt->execute([
            $sentence['user_id'],
            $w['id'],
            $sentence['arabic'],
            $sentence['translation'] ?? '',
        ]);
    }

    json_response(['matched' => $matched, 'count' => count($matched)]);
}

// DELETE /sentences/:id
if ($method === 'DELETE' && preg_match('#^/sentences/(\d+)$#', $path, $m)) {
    $payload = require_auth($config);
    $pdo->prepare('DELETE FROM sentences WHERE id = ? AND user_id = ?')->execute([(int)$m[1], $payload['sub']]);
    json_response(['ok' => true]);
}
