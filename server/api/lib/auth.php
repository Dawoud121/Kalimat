<?php
/**
 * Auth helpers: extract and validate JWT from Authorization header.
 */

function require_auth(array $config): array {
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!$header && function_exists('apache_request_headers')) {
        $headers = apache_request_headers();
        $header = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    }

    if (!$header || !str_starts_with($header, 'Bearer ')) {
        json_response(['error' => 'Missing or invalid authorization header'], 401);
    }

    $token = substr($header, 7);
    $payload = jwt_decode($token, $config['jwt_secret']);
    if (!$payload) {
        json_response(['error' => 'Invalid or expired token'], 401);
    }

    return $payload;
}

function require_admin(array $config): array {
    $payload = require_auth($config);
    if (($payload['email'] ?? '') !== $config['admin_email']) {
        json_response(['error' => 'Unauthorized — admin only'], 403);
    }
    return $payload;
}

function optional_auth(array $config): ?array {
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!$header && function_exists('apache_request_headers')) {
        $headers = apache_request_headers();
        $header = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    }
    if (!$header || !str_starts_with($header, 'Bearer ')) return null;

    $token = substr($header, 7);
    return jwt_decode($token, $config['jwt_secret']);
}

function generate_uuid(): string {
    $data = random_bytes(16);
    $data[6] = chr(ord($data[6]) & 0x0f | 0x40); // version 4
    $data[8] = chr(ord($data[8]) & 0x3f | 0x80); // variant
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}
