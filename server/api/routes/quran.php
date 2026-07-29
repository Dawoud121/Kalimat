<?php
/**
 * Quran word routes
 */

// GET /quran/search?q=X&root=X&limit=200 — search quran words
if ($method === 'GET' && $path === '/quran/search') {
    $q     = $_GET['q'] ?? '';
    $root  = $_GET['root'] ?? '';
    $limit = min((int)($_GET['limit'] ?? 200), 500);

    if (!$q && !$root) json_response([]);

    $conditions = [];
    $params = [];

    if ($q) {
        // Detect Arabic vs English
        $isArabic = (bool)preg_match('/[\x{0600}-\x{06FF}]/u', $q);
        if ($isArabic) {
            $bare = strip_arabic_diacritics($q);
            $conditions[] = "arabic_bare LIKE ?";
            $params[] = "%{$bare}%";
        } else {
            $conditions[] = "english LIKE ?";
            $params[] = "%{$q}%";
        }
    }

    if ($root) {
        $rootBare = strip_arabic_diacritics($root);
        $conditions[] = "root_bare LIKE ?";
        $params[] = "%{$rootBare}%";
    }

    $where = implode(' AND ', $conditions);
    $stmt = $pdo->prepare("SELECT surah, verse, position, id FROM quran_words WHERE {$where} LIMIT ?");
    $params[] = $limit;
    $stmt->execute($params);
    json_response($stmt->fetchAll());
}

// GET /quran/count?arabic=X — count occurrences in Quran
if ($method === 'GET' && $path === '/quran/count') {
    $arabic = $_GET['arabic'] ?? '';
    if (!$arabic) json_response(['count' => 0]);

    // Try arabic_bare first (groups diacritical variants)
    $bare = strip_arabic_diacritics($arabic);
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM quran_words WHERE arabic_bare = ?');
    $stmt->execute([$bare]);
    $count = (int)$stmt->fetchColumn();

    // Fall back to exact match if bare returns 0
    if ($count === 0) {
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM quran_words WHERE arabic = ?');
        $stmt->execute([$arabic]);
        $count = (int)$stmt->fetchColumn();
    }

    json_response(['count' => $count]);
}

// GET /quran/:surah — all words for a surah (optional ?verse=N filter)
if ($method === 'GET' && preg_match('#^/quran/(\d+)$#', $path, $m)) {
    $surah = (int)$m[1];

    if (isset($_GET['verse'])) {
        $verse = (int)$_GET['verse'];
        $stmt = $pdo->prepare('SELECT * FROM quran_words WHERE surah = ? AND verse = ? ORDER BY position ASC');
        $stmt->execute([$surah, $verse]);
    } else {
        $stmt = $pdo->prepare('SELECT * FROM quran_words WHERE surah = ? ORDER BY verse ASC, position ASC');
        $stmt->execute([$surah]);
    }
    json_response($stmt->fetchAll());
}
