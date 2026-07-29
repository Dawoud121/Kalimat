<?php
/**
 * Dictionary routes: browse, search, lookup, import, delete, form operations
 */

// GET /dictionary — alphabetical browse
if ($method === 'GET' && $path === '/dictionary') {
    $limit = min((int)($_GET['limit'] ?? 3000), 5000);
    $stmt = $pdo->prepare('SELECT id, arabic, definition, root, pos, forms, example_sentence, sources FROM dictionary ORDER BY arabic ASC LIMIT ?');
    $stmt->execute([$limit]);
    $rows = $stmt->fetchAll();
    // Decode JSON columns
    foreach ($rows as &$r) {
        $r['forms']   = json_decode($r['forms'] ?: '[]', true);
        $r['sources'] = json_decode($r['sources'] ?: '[]', true);
    }
    json_response($rows);
}

// GET /dictionary/count
if ($method === 'GET' && $path === '/dictionary/count') {
    $count = (int)$pdo->query('SELECT COUNT(*) FROM dictionary')->fetchColumn();
    json_response(['count' => $count]);
}

// GET /dictionary/search?q=X&limit=N — search_dictionary_v2 equivalent
if ($method === 'GET' && $path === '/dictionary/search') {
    $q = $_GET['q'] ?? '';
    $limit = min((int)($_GET['limit'] ?? 1000), 5000);
    if (!$q) json_response([]);

    $isArabic = (bool)preg_match('/[\x{0600}-\x{06FF}]/u', $q);

    if ($isArabic) {
        $qClean = normalize_arabic($q);
        if (!$qClean) json_response([]);

        // Fetch candidates and filter in PHP (SQLite lacks Unicode regex)
        $stmt = $pdo->prepare('SELECT * FROM dictionary ORDER BY arabic ASC LIMIT 5000');
        $stmt->execute();
        $all = $stmt->fetchAll();

        $results = [];
        foreach ($all as $entry) {
            $entryNorm = normalize_arabic($entry['arabic']);
            $rootNorm  = normalize_arabic($entry['root'] ?? '');
            $matched = mb_stripos($entryNorm, $qClean) !== false || mb_stripos($rootNorm, $qClean) !== false;
            if (!$matched) {
                $formsArr = json_decode($entry['forms'] ?: '[]', true) ?: [];
                foreach ($formsArr as $f) {
                    $fNorm = normalize_arabic($f['arabic'] ?? '');
                    if ($fNorm && mb_stripos($fNorm, $qClean) !== false) {
                        $matched = true;
                        break;
                    }
                }
            }
            if ($matched) {
                $results[] = $entry;
                if (count($results) >= $limit) break;
            }
        }
    } else {
        // English search with word-boundary matching
        $qClean = trim($q);
        if (!$qClean) json_response([]);

        $stmt = $pdo->prepare('SELECT * FROM dictionary WHERE definition LIKE ? ORDER BY arabic ASC LIMIT ?');
        $stmt->execute(['%' . $qClean . '%', $limit]);
        $results = $stmt->fetchAll();
    }

    // Decode JSON columns
    foreach ($results as &$r) {
        $r['forms']   = json_decode($r['forms'] ?: '[]', true);
        $r['sources'] = json_decode($r['sources'] ?: '[]', true);
    }

    json_response($results);
}

// GET /dictionary/lookup?q=X — lookup_word_stripped equivalent
if ($method === 'GET' && $path === '/dictionary/lookup') {
    $q = $_GET['q'] ?? '';
    if (!$q) json_response([]);

    $stripped = strip_arabic_diacritics(trim($q));
    if (!$stripped) json_response([]);

    // Prefix match on stripped form
    $stmt = $pdo->prepare('SELECT arabic, definition, root FROM dictionary LIMIT 5000');
    $stmt->execute();
    $all = $stmt->fetchAll();

    $matches = [];
    foreach ($all as $entry) {
        $entryStripped = strip_arabic_diacritics($entry['arabic']);
        if (str_starts_with($entryStripped, $stripped)) {
            $matches[] = $entry;
            if (count($matches) >= 3) break;
        }
    }

    // Sort by length (shortest first)
    usort($matches, fn($a, $b) => mb_strlen($a['arabic']) - mb_strlen($b['arabic']));

    json_response($matches);
}

// POST /dictionary/import — admin batch import
if ($method === 'POST' && $path === '/dictionary/import') {
    require_admin($config);
    $body = get_json_body();
    $entries = $body['entries'] ?? [];
    $source = $body['source'] ?? 'msa';

    $stmt = $pdo->prepare('
        INSERT INTO dictionary (arabic, definition, root, pos, forms, sources, example_sentence)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ');

    $count = 0;
    $pdo->beginTransaction();
    try {
        foreach ($entries as $e) {
            $sources = json_encode([$source]);
            $forms = json_encode($e['forms'] ?? []);
            $stmt->execute([
                $e['arabic'] ?? '',
                $e['definition'] ?? '',
                $e['root'] ?? null,
                $e['pos'] ?? null,
                $forms,
                $sources,
                $e['example_sentence'] ?? null,
            ]);
            $count++;
        }
        $pdo->commit();
    } catch (Exception $e) {
        $pdo->rollBack();
        json_response(['error' => 'Import failed: ' . $e->getMessage()], 500);
    }

    json_response(['imported' => $count]);
}

// PUT /dictionary/:id — admin update entry
if ($method === 'PUT' && preg_match('#^/dictionary/(\d+)$#', $path, $m)) {
    require_admin($config);
    $entryId = (int)$m[1];
    $body = get_json_body();

    $allowed = ['arabic', 'definition', 'root', 'pos', 'plural', 'verb_form', 'example_sentence'];
    $sets = [];
    $params = [];
    foreach ($allowed as $col) {
        if (array_key_exists($col, $body)) {
            $sets[] = "$col = ?";
            $params[] = $body[$col];
        }
    }
    // Handle JSON columns
    if (array_key_exists('forms', $body)) {
        $sets[] = 'forms = ?';
        $params[] = json_encode($body['forms']);
    }
    if (array_key_exists('sources', $body)) {
        $sets[] = 'sources = ?';
        $params[] = json_encode($body['sources']);
    }

    if (empty($sets)) json_response(['error' => 'Nothing to update'], 400);

    $params[] = $entryId;
    $stmt = $pdo->prepare('UPDATE dictionary SET ' . implode(', ', $sets) . ' WHERE id = ?');
    $stmt->execute($params);

    $stmt = $pdo->prepare('SELECT * FROM dictionary WHERE id = ?');
    $stmt->execute([$entryId]);
    $row = $stmt->fetch();
    if ($row) {
        $row['forms'] = json_decode($row['forms'] ?: '[]', true);
        $row['sources'] = json_decode($row['sources'] ?: '[]', true);
    }
    json_response($row);
}

// DELETE /dictionary/:id
if ($method === 'DELETE' && preg_match('#^/dictionary/(\d+)$#', $path, $m)) {
    require_admin($config);
    $entryId = (int)$m[1];
    $stmt = $pdo->prepare('DELETE FROM dictionary WHERE id = ?');
    $stmt->execute([$entryId]);
    // Verify deletion (Supabase silently ignores RLS-blocked deletes — we verify explicitly)
    $stmt = $pdo->prepare('SELECT id FROM dictionary WHERE id = ?');
    $stmt->execute([$entryId]);
    $still = $stmt->fetch();
    json_response(['ok' => !$still, 'deleted' => !$still]);
}

// DELETE /dictionary/:id/form/:index — delete_dictionary_form equivalent
if ($method === 'DELETE' && preg_match('#^/dictionary/(\d+)/form/(\d+)$#', $path, $m)) {
    require_admin($config);
    $entryId = (int)$m[1];
    $formIndex = (int)$m[2];

    $stmt = $pdo->prepare('SELECT forms FROM dictionary WHERE id = ?');
    $stmt->execute([$entryId]);
    $row = $stmt->fetch();
    if (!$row) json_response(['error' => 'Not found'], 404);

    $forms = json_decode($row['forms'] ?: '[]', true);
    if ($formIndex >= 0 && $formIndex < count($forms)) {
        array_splice($forms, $formIndex, 1);
    }

    $stmt = $pdo->prepare('UPDATE dictionary SET forms = ? WHERE id = ?');
    $stmt->execute([json_encode($forms), $entryId]);
    json_response(['ok' => true, 'forms' => $forms]);
}
