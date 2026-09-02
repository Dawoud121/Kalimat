<?php
/**
 * Contribution routes: submit, vote, moderate, list
 */

define('TRUST_BASELINE', 50);
define('TRUST_APPROVE_DELTA', 2);
define('TRUST_REJECT_DELTA', 1);
define('COMMUNITY_VERIFIED_THRESHOLD', 5);

// GET /contributions?status=pending&source=user&limit=50&offset=0
if ($method === 'GET' && $path === '/contributions') {
    $payload = require_auth($config);
    $status = $_GET['status'] ?? 'pending';
    $source = $_GET['source'] ?? null;
    $limit  = min((int)($_GET['limit'] ?? 50), 200);
    $offset = (int)($_GET['offset'] ?? 0);

    $sql = 'SELECT * FROM contributions WHERE status = ?';
    $params = [$status];
    if ($source) {
        $sql .= ' AND source = ?';
        $params[] = $source;
    }
    $sql .= ' ORDER BY vote_score DESC, created_at DESC LIMIT ? OFFSET ?';
    $params[] = $limit;
    $params[] = $offset;

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    json_response($stmt->fetchAll());
}

// GET /contributions/user — current user's contributions
if ($method === 'GET' && $path === '/contributions/user') {
    $payload = require_auth($config);
    $status = $_GET['status'] ?? null;
    $sql = 'SELECT * FROM contributions WHERE submitted_by = ?';
    $params = [$payload['sub']];
    if ($status) { $sql .= ' AND status = ?'; $params[] = $status; }
    $sql .= ' ORDER BY created_at DESC';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    json_response($stmt->fetchAll());
}

// GET /contributions/flagged — sentence_flag source
if ($method === 'GET' && $path === '/contributions/flagged') {
    $payload = require_auth($config);
    $limit = min((int)($_GET['limit'] ?? 100), 500);
    $stmt = $pdo->prepare('SELECT * FROM contributions WHERE source = ? ORDER BY created_at DESC LIMIT ?');
    $stmt->execute(['sentence_flag', $limit]);
    json_response($stmt->fetchAll());
}

// GET /contributions/votes?ids=1,2,3 — current user's votes
if ($method === 'GET' && $path === '/contributions/votes') {
    $payload = require_auth($config);
    $ids = array_filter(explode(',', $_GET['ids'] ?? ''), fn($v) => is_numeric($v));
    if (empty($ids)) json_response([]);
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $params = array_merge([$payload['sub']], $ids);
    $stmt = $pdo->prepare("SELECT contribution_id, vote FROM contribution_votes WHERE user_id = ? AND contribution_id IN ($placeholders)");
    $stmt->execute($params);
    $map = [];
    foreach ($stmt->fetchAll() as $r) $map[$r['contribution_id']] = (int)$r['vote'];
    json_response($map);
}

// POST /contributions — submit new contribution
if ($method === 'POST' && $path === '/contributions') {
    $payload = require_auth($config);
    $body = get_json_body();

    // Duplicate detection for new_word
    if (($body['type'] ?? '') === 'new_word' && !empty($body['arabic'])) {
        $normalized = strip_arabic_diacritics(trim($body['arabic']));
        $source = $body['source'] ?? 'user';

        if ($source === 'gemini') {
            // For gemini auto-logged words, silently skip if already exists (any status)
            $stmt = $pdo->prepare("SELECT id, arabic FROM contributions WHERE type = 'new_word' AND source = 'gemini'");
            $stmt->execute();
            foreach ($stmt->fetchAll() as $c) {
                if (strip_arabic_diacritics($c['arabic']) === $normalized) {
                    json_response(['isDuplicate' => true, 'existingId' => (int)$c['id']]);
                }
            }
        } else {
            // For user submissions, check pending and auto-vote
            $stmt = $pdo->prepare("SELECT id, arabic FROM contributions WHERE type = 'new_word' AND status = 'pending'");
            $stmt->execute();
            foreach ($stmt->fetchAll() as $c) {
                if (strip_arabic_diacritics($c['arabic']) === $normalized) {
                    _do_vote($pdo, $config, $payload['sub'], (int)$c['id'], 1);
                    json_response(['isDuplicate' => true, 'existingId' => (int)$c['id']]);
                }
            }
        }
    }

    $allowed = ['type','arabic','definition','root','pos','dictionary_entry_id','form_type',
                'form_label','form_arabic','correction_note','quran_reference','source','status','vote_score'];
    $cols = ['submitted_by', 'submitter_username'];
    $vals = [$payload['sub'], $body['submitter_username'] ?? null];
    foreach ($allowed as $col) {
        if (array_key_exists($col, $body)) {
            $cols[] = $col;
            $vals[] = $body[$col];
        }
    }
    $placeholders = implode(',', array_fill(0, count($cols), '?'));
    $colStr = implode(',', $cols);
    $stmt = $pdo->prepare("INSERT INTO contributions ($colStr) VALUES ($placeholders)");
    $stmt->execute($vals);

    $id = $pdo->lastInsertId();
    $stmt = $pdo->prepare('SELECT * FROM contributions WHERE id = ?');
    $stmt->execute([$id]);
    json_response($stmt->fetch(), 201);
}

// POST /contributions/:id/vote — vote {vote: 1|-1}
if ($method === 'POST' && preg_match('#^/contributions/(\d+)/vote$#', $path, $m)) {
    $payload = require_auth($config);
    $contribId = (int)$m[1];
    $body = get_json_body();
    $vote = (int)($body['vote'] ?? 0);
    if ($vote !== 1 && $vote !== -1) json_response(['error' => 'Vote must be 1 or -1'], 400);

    $score = _do_vote($pdo, $config, $payload['sub'], $contribId, $vote);
    json_response(['score' => $score]);
}

// DELETE /contributions/:id/vote — remove vote
if ($method === 'DELETE' && preg_match('#^/contributions/(\d+)/vote$#', $path, $m)) {
    $payload = require_auth($config);
    $contribId = (int)$m[1];

    $pdo->prepare('DELETE FROM contribution_votes WHERE user_id = ? AND contribution_id = ?')
        ->execute([$payload['sub'], $contribId]);

    // Recalculate
    $stmt = $pdo->prepare('SELECT COALESCE(SUM(vote), 0) FROM contribution_votes WHERE contribution_id = ?');
    $stmt->execute([$contribId]);
    $score = (int)$stmt->fetchColumn();
    $pdo->prepare('UPDATE contributions SET vote_score = ? WHERE id = ?')->execute([$score, $contribId]);
    json_response(['score' => $score]);
}

// PUT /contributions/:id — update contribution
if ($method === 'PUT' && preg_match('#^/contributions/(\d+)$#', $path, $m)) {
    $payload = require_auth($config);
    $contribId = (int)$m[1];
    $body = get_json_body();
    $isAdmin = (($payload['email'] ?? '') === $config['admin_email']);

    $allowed = ['arabic','definition','root','pos','form_type','form_label','form_arabic',
                'correction_note','quran_reference','moderator_note'];
    if ($isAdmin) $allowed[] = 'status'; // Non-admins can't change status (protect_sentence_status equivalent)
    if ($isAdmin) $allowed[] = 'source';

    $sets = [];
    $params = [];
    foreach ($allowed as $col) {
        if (array_key_exists($col, $body)) {
            $sets[] = "$col = ?";
            $params[] = $body[$col];
        }
    }
    if (empty($sets)) json_response(['error' => 'Nothing to update'], 400);

    $params[] = $contribId;
    $pdo->prepare('UPDATE contributions SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);

    $stmt = $pdo->prepare('SELECT * FROM contributions WHERE id = ?');
    $stmt->execute([$contribId]);
    json_response($stmt->fetch());
}

// POST /contributions/:id/moderate — admin approve/reject
if ($method === 'POST' && preg_match('#^/contributions/(\d+)/moderate$#', $path, $m)) {
    $payload = require_admin($config);
    $contribId = (int)$m[1];
    $body = get_json_body();
    $action = $body['action'] ?? ''; // 'approved' or 'rejected'
    $note   = $body['note'] ?? '';

    if (!in_array($action, ['approved', 'rejected'])) {
        json_response(['error' => 'Action must be approved or rejected'], 400);
    }

    // Update status + moderator note
    $updateSql = 'UPDATE contributions SET status = ?';
    $updateParams = [$action];
    if (trim($note)) {
        $updateSql .= ', moderator_note = ?';
        $updateParams[] = trim($note);
    }
    $updateSql .= ' WHERE id = ?';
    $updateParams[] = $contribId;
    $pdo->prepare($updateSql)->execute($updateParams);

    // Fetch the updated contribution
    $stmt = $pdo->prepare('SELECT * FROM contributions WHERE id = ?');
    $stmt->execute([$contribId]);
    $contrib = $stmt->fetch();

    // Write audit log
    $pdo->prepare('INSERT INTO contribution_audit (contribution_id, moderator_id, moderator_username, action, note) VALUES (?, ?, ?, ?, ?)')
        ->execute([$contribId, $payload['sub'], null, $action, $note]);

    // Write to dictionary if approved (replaces write_approved_contribution RPC)
    if ($action === 'approved') {
        _write_approved_to_dictionary($pdo, $contrib);
    }

    // Update trust score
    if ($contrib['submitted_by']) {
        $isFormType = in_array($contrib['type'], ['add_form', 'correct_form']);
        $subField = $isFormType ? 'trust_score_forms' : 'trust_score_vocab';
        $delta = $action === 'approved' ? TRUST_APPROVE_DELTA : -TRUST_REJECT_DELTA;

        $pdo->prepare('UPDATE profiles SET trust_score = MAX(0, trust_score + ?) WHERE id = ?')
            ->execute([$delta, $contrib['submitted_by']]);

        if ($subField === 'trust_score_vocab') {
            $pdo->prepare('UPDATE profiles SET trust_score_vocab = MAX(0, trust_score_vocab + ?) WHERE id = ?')
                ->execute([$delta, $contrib['submitted_by']]);
        } else {
            $pdo->prepare('UPDATE profiles SET trust_score_forms = MAX(0, trust_score_forms + ?) WHERE id = ?')
                ->execute([$delta, $contrib['submitted_by']]);
        }
    }

    json_response($contrib);
}

// POST /contributions/:id/to-dictionary — admin: add gemini word to dictionary
if ($method === 'POST' && preg_match('#^/contributions/(\d+)/to-dictionary$#', $path, $m)) {
    $payload = require_admin($config);
    $contribId = (int)$m[1];

    $stmt = $pdo->prepare('SELECT * FROM contributions WHERE id = ?');
    $stmt->execute([$contribId]);
    $contrib = $stmt->fetch();
    if (!$contrib) json_response(['error' => 'Not found'], 404);

    // Check if already in dictionary (by stripped diacritics)
    $normalized = strip_arabic_diacritics(trim($contrib['arabic']));
    $stmt = $pdo->prepare('SELECT id, arabic FROM dictionary');
    $stmt->execute();
    foreach ($stmt->fetchAll() as $d) {
        if (strip_arabic_diacritics($d['arabic']) === $normalized) {
            json_response(['error' => 'Already in dictionary', 'existingId' => (int)$d['id']], 409);
        }
    }

    // Look up forms from the words table (if user added it to a deck)
    $forms = [];
    $exampleSentence = null;
    $stmtW = $pdo->prepare("SELECT * FROM words WHERE arabic = ? LIMIT 1");
    $stmtW->execute([trim($contrib['arabic'])]);
    $wordRow = $stmtW->fetch();
    if ($wordRow) {
        $formEntries = [];
        if (!empty($wordRow['past']))    $formEntries[] = ['type' => 'verb', 'label' => 'Past',    'arabic' => $wordRow['past']];
        if (!empty($wordRow['present'])) $formEntries[] = ['type' => 'verb', 'label' => 'Present', 'arabic' => $wordRow['present']];
        if (!empty($wordRow['command'])) $formEntries[] = ['type' => 'verb', 'label' => 'Command', 'arabic' => $wordRow['command']];
        if (!empty($wordRow['masdar']))  $formEntries[] = ['type' => 'verb', 'label' => 'Masdar',  'arabic' => $wordRow['masdar']];
        if (!empty($wordRow['singular']))$formEntries[] = ['type' => 'noun', 'label' => 'Singular','arabic' => $wordRow['singular']];
        if (!empty($wordRow['dual']))    $formEntries[] = ['type' => 'noun', 'label' => 'Dual',    'arabic' => $wordRow['dual']];
        if (!empty($wordRow['plural']))  $formEntries[] = ['type' => 'noun', 'label' => 'Plural',  'arabic' => $wordRow['plural']];
        $forms = $formEntries;
        $exampleSentence = $wordRow['example_sentence'] ?? null;
    }

    $stmt = $pdo->prepare('INSERT INTO dictionary (arabic, definition, root, pos, forms, example_sentence, sources) VALUES (?, ?, ?, ?, ?, ?, ?)');
    $stmt->execute([
        $contrib['arabic'] ?? '',
        $contrib['definition'] ?? '',
        $contrib['root'] ?? null,
        $contrib['pos'] ?? null,
        json_encode($forms),
        $exampleSentence,
        json_encode(['gemini']),
    ]);

    $dictId = $pdo->lastInsertId();
    $stmt = $pdo->prepare('SELECT * FROM dictionary WHERE id = ?');
    $stmt->execute([$dictId]);
    json_response($stmt->fetch(), 201);
}

// DELETE /contributions/:id — admin delete contribution
if ($method === 'DELETE' && preg_match('#^/contributions/(\d+)$#', $path, $m)) {
    $payload = require_admin($config);
    $contribId = (int)$m[1];

    // Delete votes first (foreign key)
    $pdo->prepare('DELETE FROM contribution_votes WHERE contribution_id = ?')->execute([$contribId]);
    // Delete audit logs
    $pdo->prepare('DELETE FROM contribution_audit WHERE contribution_id = ?')->execute([$contribId]);
    // Delete the contribution
    $pdo->prepare('DELETE FROM contributions WHERE id = ?')->execute([$contribId]);

    json_response(['deleted' => true]);
}

// ── Helpers ──

function _do_vote(PDO $pdo, array $config, string $userId, int $contribId, int $vote): int {
    // Upsert vote
    $pdo->prepare('INSERT INTO contribution_votes (contribution_id, user_id, vote) VALUES (?, ?, ?)
        ON CONFLICT(contribution_id, user_id) DO UPDATE SET vote = excluded.vote')
        ->execute([$contribId, $userId, $vote]);

    // Recalculate score
    $stmt = $pdo->prepare('SELECT COALESCE(SUM(vote), 0) FROM contribution_votes WHERE contribution_id = ?');
    $stmt->execute([$contribId]);
    $score = (int)$stmt->fetchColumn();

    $updates = ['vote_score' => $score];

    // Check for community_verified auto-promotion
    $stmt = $pdo->prepare('SELECT status, submitted_by FROM contributions WHERE id = ?');
    $stmt->execute([$contribId]);
    $contrib = $stmt->fetch();

    if ($contrib && $contrib['status'] === 'pending' && $contrib['submitted_by']) {
        $stmt = $pdo->prepare('SELECT trust_score FROM profiles WHERE id = ?');
        $stmt->execute([$contrib['submitted_by']]);
        $profile = $stmt->fetch();
        $trust = $profile ? (int)$profile['trust_score'] : TRUST_BASELINE;
        $weighted = $score * ($trust / TRUST_BASELINE);
        if ($weighted >= COMMUNITY_VERIFIED_THRESHOLD) {
            $updates['status'] = 'community_verified';
        }
    }

    $sets = [];
    $params = [];
    foreach ($updates as $k => $v) { $sets[] = "$k = ?"; $params[] = $v; }
    $params[] = $contribId;
    $pdo->prepare('UPDATE contributions SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);

    return $score;
}

function _write_approved_to_dictionary(PDO $pdo, array $contrib): void {
    if ($contrib['type'] === 'new_word') {
        $stmt = $pdo->prepare('INSERT INTO dictionary (arabic, definition, root, pos) VALUES (?, ?, ?, ?)');
        $stmt->execute([
            $contrib['arabic'] ?? '',
            $contrib['definition'] ?? '',
            $contrib['root'] ?? null,
            $contrib['pos'] ?? null,
        ]);
    } elseif ($contrib['type'] === 'add_form' && $contrib['dictionary_entry_id']) {
        $stmt = $pdo->prepare('SELECT forms FROM dictionary WHERE id = ?');
        $stmt->execute([$contrib['dictionary_entry_id']]);
        $row = $stmt->fetch();
        if ($row) {
            $forms = json_decode($row['forms'] ?: '[]', true);
            $forms[] = [
                'type'   => $contrib['form_type'],
                'label'  => $contrib['form_label'],
                'arabic' => $contrib['form_arabic'],
            ];
            $pdo->prepare('UPDATE dictionary SET forms = ? WHERE id = ?')
                ->execute([json_encode($forms), $contrib['dictionary_entry_id']]);
        }
    }
}
