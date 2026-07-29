<?php
/**
 * Helper functions: JSON responses, input parsing, rate limiting, Arabic utilities.
 */

function json_response(mixed $data, int $code = 200): never {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function get_json_body(): array {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function get_client_ip(): string {
    return $_SERVER['HTTP_X_FORWARDED_FOR']
        ?? $_SERVER['HTTP_X_REAL_IP']
        ?? $_SERVER['REMOTE_ADDR']
        ?? '0.0.0.0';
}

/**
 * Simple rate limiter using SQLite.
 */
function rate_limit(PDO $pdo, string $key, int $max, int $windowSecs): void {
    $now = time();
    $row = $pdo->prepare('SELECT count, window_start FROM rate_limits WHERE key = ?');
    $row->execute([$key]);
    $record = $row->fetch();

    if (!$record || ($now - $record['window_start']) >= $windowSecs) {
        $stmt = $pdo->prepare('INSERT OR REPLACE INTO rate_limits (key, count, window_start) VALUES (?, 1, ?)');
        $stmt->execute([$key, $now]);
        return;
    }

    if ($record['count'] >= $max) {
        json_response(['error' => 'Too many attempts, please try again later.'], 429);
    }

    $stmt = $pdo->prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?');
    $stmt->execute([$key]);
}

/**
 * Strip Arabic diacritics (tashkeel) from a string.
 * Mirrors the Postgres strip_arabic_diacritics() function.
 */
function strip_arabic_diacritics(string $s): string {
    // Unicode diacritics: fathah, dammah, kasrah, tanween, shadda, sukun, etc.
    return preg_replace('/[\x{064B}-\x{065F}\x{0610}-\x{061A}\x{0670}\x{0640}]/u', '', $s);
}

/**
 * Normalize Arabic for search: strip diacritics, remove spaces, normalize alef/ya.
 */
function normalize_arabic(string $s): string {
    $s = strip_arabic_diacritics($s);
    $s = str_replace(' ', '', $s);
    // Normalize alef variants to bare alef
    $s = preg_replace('/[\x{0623}\x{0625}\x{0622}\x{0671}]/u', "\u{0627}", $s);
    // Normalize alef maqsura to ya
    $s = preg_replace('/\x{0649}/u', "\u{064A}", $s);
    return $s;
}

/**
 * Extract path segments after a prefix.
 * e.g. extract_path_id('/decks/123', '/decks') => '123'
 */
function extract_path_id(string $path, string $prefix): ?string {
    $rest = substr($path, strlen($prefix));
    if ($rest && $rest[0] === '/') $rest = substr($rest, 1);
    if ($rest && !str_contains($rest, '/')) return $rest;
    return null;
}
