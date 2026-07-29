<?php
/**
 * Profile routes
 */

// GET /profiles/:id
if ($method === 'GET' && preg_match('#^/profiles/([a-f0-9\-]+)$#', $path, $m)) {
    $stmt = $pdo->prepare('SELECT id, username, role, trust_score, trust_score_vocab, trust_score_forms, created_at FROM profiles WHERE id = ?');
    $stmt->execute([$m[1]]);
    $profile = $stmt->fetch();
    if (!$profile) json_response(['error' => 'Profile not found'], 404);
    json_response($profile);
}

// PUT /profiles/:id
if ($method === 'PUT' && preg_match('#^/profiles/([a-f0-9\-]+)$#', $path, $m)) {
    $payload = require_auth($config);
    $userId = $payload['sub'];
    $targetId = $m[1];

    // Only own profile or admin
    $isAdmin = (($payload['email'] ?? '') === $config['admin_email']);
    if ($userId !== $targetId && !$isAdmin) {
        json_response(['error' => 'Forbidden'], 403);
    }

    $body = get_json_body();
    $sets = [];
    $params = [];

    if (isset($body['username'])) {
        $sets[] = 'username = ?';
        $params[] = trim($body['username']);
    }

    // Trust score fields — admin only (replaces protect_trust_score trigger)
    if ($isAdmin) {
        if (isset($body['trust_score']))       { $sets[] = 'trust_score = ?';       $params[] = (int)$body['trust_score']; }
        if (isset($body['trust_score_vocab'])) { $sets[] = 'trust_score_vocab = ?'; $params[] = (int)$body['trust_score_vocab']; }
        if (isset($body['trust_score_forms'])) { $sets[] = 'trust_score_forms = ?'; $params[] = (int)$body['trust_score_forms']; }
    }
    // Non-admin: trust score fields are silently ignored (mirrors Supabase trigger behavior)

    if (empty($sets)) json_response(['error' => 'Nothing to update'], 400);

    $params[] = $targetId;
    $stmt = $pdo->prepare('UPDATE profiles SET ' . implode(', ', $sets) . ' WHERE id = ?');
    $stmt->execute($params);

    $stmt = $pdo->prepare('SELECT id, username, role, trust_score, trust_score_vocab, trust_score_forms, created_at FROM profiles WHERE id = ?');
    $stmt->execute([$targetId]);
    json_response($stmt->fetch());
}
