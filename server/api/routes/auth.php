<?php
/**
 * Auth routes: register, login, me, update, delete
 */

// POST /auth/register
if ($method === 'POST' && $path === '/auth/register') {
    rate_limit($pdo, 'register:' . get_client_ip(), 10, 3600);
    $body = get_json_body();
    $email    = trim($body['email'] ?? '');
    $password = $body['password'] ?? '';
    $username = trim($body['username'] ?? '');

    if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        json_response(['error' => 'Valid email is required'], 400);
    }
    if (strlen($password) < 6) {
        json_response(['error' => 'Password must be at least 6 characters'], 400);
    }
    if (!$username || strlen($username) < 2) {
        json_response(['error' => 'Username must be at least 2 characters'], 400);
    }

    $email = strtolower($email);

    // Check duplicate email
    $stmt = $pdo->prepare('SELECT id FROM users WHERE email = ?');
    $stmt->execute([$email]);
    if ($stmt->fetch()) {
        json_response(['error' => 'Email already registered'], 409);
    }

    // Check duplicate username
    $stmt = $pdo->prepare('SELECT id FROM profiles WHERE LOWER(username) = LOWER(?)');
    $stmt->execute([$username]);
    if ($stmt->fetch()) {
        json_response(['error' => 'Username already taken'], 409);
    }

    $userId = generate_uuid();
    $hash = password_hash($password, PASSWORD_BCRYPT);

    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)');
        $stmt->execute([$userId, $email, $hash]);

        $stmt = $pdo->prepare('INSERT INTO profiles (id, username) VALUES (?, ?)');
        $stmt->execute([$userId, $username]);

        $pdo->commit();
    } catch (Exception $e) {
        $pdo->rollBack();
        json_response(['error' => 'Registration failed'], 500);
    }

    $token = jwt_encode([
        'sub'   => $userId,
        'email' => $email,
        'exp'   => time() + 7 * 86400,
    ], $config['jwt_secret']);

    json_response([
        'token' => $token,
        'user'  => ['id' => $userId, 'email' => $email, 'username' => $username],
    ]);
}

// POST /auth/login
if ($method === 'POST' && $path === '/auth/login') {
    rate_limit($pdo, 'login:' . get_client_ip(), 20, 900);
    $body = get_json_body();
    $email    = strtolower(trim($body['email'] ?? ''));
    $password = $body['password'] ?? '';

    if (!$email || !$password) {
        json_response(['error' => 'Email and password are required'], 400);
    }

    $stmt = $pdo->prepare('SELECT id, email, password_hash FROM users WHERE email = ?');
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash'])) {
        json_response(['error' => 'Invalid email or password'], 401);
    }

    $stmt = $pdo->prepare('SELECT username FROM profiles WHERE id = ?');
    $stmt->execute([$user['id']]);
    $profile = $stmt->fetch();

    $token = jwt_encode([
        'sub'   => $user['id'],
        'email' => $user['email'],
        'exp'   => time() + 7 * 86400,
    ], $config['jwt_secret']);

    json_response([
        'token' => $token,
        'user'  => [
            'id'       => $user['id'],
            'email'    => $user['email'],
            'username' => $profile['username'] ?? $user['email'],
        ],
    ]);
}

// GET /auth/me
if ($method === 'GET' && $path === '/auth/me') {
    $payload = require_auth($config);
    $userId = $payload['sub'];

    $stmt = $pdo->prepare('SELECT u.id, u.email, p.username FROM users u JOIN profiles p ON p.id = u.id WHERE u.id = ?');
    $stmt->execute([$userId]);
    $user = $stmt->fetch();

    if (!$user) json_response(['error' => 'User not found'], 404);

    // Issue a fresh token
    $token = jwt_encode([
        'sub'   => $user['id'],
        'email' => $user['email'],
        'exp'   => time() + 7 * 86400,
    ], $config['jwt_secret']);

    json_response([
        'token' => $token,
        'user'  => $user,
    ]);
}

// PUT /auth/update
if ($method === 'PUT' && $path === '/auth/update') {
    $payload = require_auth($config);
    $userId = $payload['sub'];
    $body = get_json_body();

    if (isset($body['username'])) {
        $username = trim($body['username']);
        if (strlen($username) < 2) json_response(['error' => 'Username too short'], 400);

        // Check uniqueness (excluding self)
        $stmt = $pdo->prepare('SELECT id FROM profiles WHERE LOWER(username) = LOWER(?) AND id != ?');
        $stmt->execute([$username, $userId]);
        if ($stmt->fetch()) json_response(['error' => 'Username already taken'], 409);

        $stmt = $pdo->prepare('UPDATE profiles SET username = ? WHERE id = ?');
        $stmt->execute([$username, $userId]);
    }

    $stmt = $pdo->prepare('SELECT u.id, u.email, p.username FROM users u JOIN profiles p ON p.id = u.id WHERE u.id = ?');
    $stmt->execute([$userId]);
    json_response(['user' => $stmt->fetch()]);
}

// DELETE /auth/delete
if ($method === 'DELETE' && $path === '/auth/delete') {
    $payload = require_auth($config);
    $userId = $payload['sub'];

    // CASCADE handles profiles, decks, words, srs_cards, etc.
    $stmt = $pdo->prepare('DELETE FROM users WHERE id = ?');
    $stmt->execute([$userId]);

    json_response(['ok' => true]);
}
