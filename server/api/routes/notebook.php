<?php
/**
 * Notebook routes — classes, lessons, strokes CRUD
 */

// ── Classes ─────────────────────────────────────────────────────────────

// GET /notebook/classes
if ($method === 'GET' && $path === '/notebook/classes') {
    $payload = require_auth($config);
    $stmt = $pdo->prepare('SELECT * FROM notebook_classes WHERE user_id = ? ORDER BY order_index ASC, created_at ASC');
    $stmt->execute([$payload['sub']]);
    json_response($stmt->fetchAll());
}

// POST /notebook/classes
if ($method === 'POST' && $path === '/notebook/classes') {
    $payload = require_auth($config);
    $body = get_json_body();
    $title = trim($body['title'] ?? '');
    if (!$title) json_response(['error' => 'Title is required'], 400);

    $stmt = $pdo->prepare('SELECT COALESCE(MAX(order_index), -1) + 1 FROM notebook_classes WHERE user_id = ?');
    $stmt->execute([$payload['sub']]);
    $nextOrder = (int)$stmt->fetchColumn();

    $stmt = $pdo->prepare('INSERT INTO notebook_classes (user_id, title, order_index) VALUES (?, ?, ?)');
    $stmt->execute([$payload['sub'], $title, $nextOrder]);
    $id = (int)$pdo->lastInsertId();

    $stmt = $pdo->prepare('SELECT * FROM notebook_classes WHERE id = ?');
    $stmt->execute([$id]);
    json_response($stmt->fetch(), 201);
}

// PUT /notebook/classes/:id
if ($method === 'PUT' && preg_match('#^/notebook/classes/(\d+)$#', $path, $m)) {
    $payload = require_auth($config);
    $classId = (int)$m[1];

    // Ownership check
    $stmt = $pdo->prepare('SELECT id FROM notebook_classes WHERE id = ? AND user_id = ?');
    $stmt->execute([$classId, $payload['sub']]);
    if (!$stmt->fetch()) json_response(['error' => 'Not found'], 404);

    $body = get_json_body();
    $fields = [];
    $params = [];
    if (isset($body['title'])) { $fields[] = 'title = ?'; $params[] = trim($body['title']); }
    if (isset($body['order_index'])) { $fields[] = 'order_index = ?'; $params[] = (int)$body['order_index']; }
    if (empty($fields)) json_response(['error' => 'No fields to update'], 400);

    $params[] = $classId;
    $pdo->prepare('UPDATE notebook_classes SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($params);

    $stmt = $pdo->prepare('SELECT * FROM notebook_classes WHERE id = ?');
    $stmt->execute([$classId]);
    json_response($stmt->fetch());
}

// DELETE /notebook/classes/:id
if ($method === 'DELETE' && preg_match('#^/notebook/classes/(\d+)$#', $path, $m)) {
    $payload = require_auth($config);
    $classId = (int)$m[1];

    $stmt = $pdo->prepare('SELECT id FROM notebook_classes WHERE id = ? AND user_id = ?');
    $stmt->execute([$classId, $payload['sub']]);
    if (!$stmt->fetch()) json_response(['error' => 'Not found'], 404);

    $pdo->prepare('DELETE FROM notebook_classes WHERE id = ?')->execute([$classId]);
    json_response(['ok' => true]);
}

// ── Lessons ─────────────────────────────────────────────────────────────

// GET /notebook/classes/:id/lessons
if ($method === 'GET' && preg_match('#^/notebook/classes/(\d+)/lessons$#', $path, $m)) {
    $payload = require_auth($config);
    $classId = (int)$m[1];

    // Ownership check
    $stmt = $pdo->prepare('SELECT id FROM notebook_classes WHERE id = ? AND user_id = ?');
    $stmt->execute([$classId, $payload['sub']]);
    if (!$stmt->fetch()) json_response(['error' => 'Not found'], 404);

    $stmt = $pdo->prepare('SELECT * FROM notebook_lessons WHERE class_id = ? AND user_id = ? ORDER BY order_index ASC, created_at ASC');
    $stmt->execute([$classId, $payload['sub']]);
    json_response($stmt->fetchAll());
}

// POST /notebook/classes/:id/lessons
if ($method === 'POST' && preg_match('#^/notebook/classes/(\d+)/lessons$#', $path, $m)) {
    $payload = require_auth($config);
    $classId = (int)$m[1];

    // Ownership check
    $stmt = $pdo->prepare('SELECT id FROM notebook_classes WHERE id = ? AND user_id = ?');
    $stmt->execute([$classId, $payload['sub']]);
    if (!$stmt->fetch()) json_response(['error' => 'Not found'], 404);

    $body = get_json_body();
    $title = trim($body['title'] ?? '');
    $date = $body['date'] ?? date('Y-m-d');
    if (!$title) json_response(['error' => 'Title is required'], 400);

    $stmt = $pdo->prepare('SELECT COALESCE(MAX(order_index), -1) + 1 FROM notebook_lessons WHERE class_id = ?');
    $stmt->execute([$classId]);
    $nextOrder = (int)$stmt->fetchColumn();

    $stmt = $pdo->prepare('INSERT INTO notebook_lessons (class_id, user_id, title, date, order_index) VALUES (?, ?, ?, ?, ?)');
    $stmt->execute([$classId, $payload['sub'], $title, $date, $nextOrder]);
    $id = (int)$pdo->lastInsertId();

    $stmt = $pdo->prepare('SELECT * FROM notebook_lessons WHERE id = ?');
    $stmt->execute([$id]);
    json_response($stmt->fetch(), 201);
}

// PUT /notebook/lessons/:id
if ($method === 'PUT' && preg_match('#^/notebook/lessons/(\d+)$#', $path, $m)) {
    $payload = require_auth($config);
    $lessonId = (int)$m[1];

    // Ownership check
    $stmt = $pdo->prepare('SELECT id FROM notebook_lessons WHERE id = ? AND user_id = ?');
    $stmt->execute([$lessonId, $payload['sub']]);
    if (!$stmt->fetch()) json_response(['error' => 'Not found'], 404);

    $body = get_json_body();
    $fields = [];
    $params = [];
    if (isset($body['title'])) { $fields[] = 'title = ?'; $params[] = trim($body['title']); }
    if (isset($body['date'])) { $fields[] = 'date = ?'; $params[] = $body['date']; }
    if (isset($body['template'])) { $fields[] = 'template = ?'; $params[] = $body['template']; }
    if (isset($body['order_index'])) { $fields[] = 'order_index = ?'; $params[] = (int)$body['order_index']; }
    if (empty($fields)) json_response(['error' => 'No fields to update'], 400);

    $params[] = $lessonId;
    $pdo->prepare('UPDATE notebook_lessons SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($params);

    $stmt = $pdo->prepare('SELECT * FROM notebook_lessons WHERE id = ?');
    $stmt->execute([$lessonId]);
    json_response($stmt->fetch());
}

// DELETE /notebook/lessons/:id
if ($method === 'DELETE' && preg_match('#^/notebook/lessons/(\d+)$#', $path, $m)) {
    $payload = require_auth($config);
    $lessonId = (int)$m[1];

    $stmt = $pdo->prepare('SELECT id FROM notebook_lessons WHERE id = ? AND user_id = ?');
    $stmt->execute([$lessonId, $payload['sub']]);
    if (!$stmt->fetch()) json_response(['error' => 'Not found'], 404);

    $pdo->prepare('DELETE FROM notebook_lessons WHERE id = ?')->execute([$lessonId]);
    json_response(['ok' => true]);
}

// ── Strokes ─────────────────────────────────────────────────────────────

// GET /notebook/lessons/:id/strokes
if ($method === 'GET' && preg_match('#^/notebook/lessons/(\d+)/strokes$#', $path, $m)) {
    $payload = require_auth($config);
    $lessonId = (int)$m[1];

    // Ownership check
    $stmt = $pdo->prepare('SELECT id FROM notebook_lessons WHERE id = ? AND user_id = ?');
    $stmt->execute([$lessonId, $payload['sub']]);
    if (!$stmt->fetch()) json_response(['error' => 'Not found'], 404);

    $stmt = $pdo->prepare('SELECT id, stroke_data, order_index FROM notebook_strokes WHERE lesson_id = ? ORDER BY order_index ASC');
    $stmt->execute([$lessonId]);
    $rows = $stmt->fetchAll();

    // Parse stroke_data JSON for each row
    $result = array_map(function($row) {
        $row['stroke_data'] = json_decode($row['stroke_data'], true);
        return $row;
    }, $rows);

    json_response($result);
}

// PUT /notebook/lessons/:id/strokes — full replace (save all strokes)
if ($method === 'PUT' && preg_match('#^/notebook/lessons/(\d+)/strokes$#', $path, $m)) {
    $payload = require_auth($config);
    $lessonId = (int)$m[1];

    // Ownership check
    $stmt = $pdo->prepare('SELECT id FROM notebook_lessons WHERE id = ? AND user_id = ?');
    $stmt->execute([$lessonId, $payload['sub']]);
    if (!$stmt->fetch()) json_response(['error' => 'Not found'], 404);

    $body = get_json_body();
    $strokes = $body['strokes'] ?? [];

    $pdo->beginTransaction();
    try {
        // Delete existing strokes
        $pdo->prepare('DELETE FROM notebook_strokes WHERE lesson_id = ?')->execute([$lessonId]);

        // Insert new strokes
        $stmt = $pdo->prepare('INSERT INTO notebook_strokes (lesson_id, user_id, stroke_data, order_index) VALUES (?, ?, ?, ?)');
        foreach ($strokes as $i => $stroke) {
            $data = $stroke['stroke_data'] ?? $stroke;
            $stmt->execute([
                $lessonId,
                $payload['sub'],
                is_string($data) ? $data : json_encode($data, JSON_UNESCAPED_UNICODE),
                $stroke['order_index'] ?? $i,
            ]);
        }
        $pdo->commit();
    } catch (\Throwable $e) {
        $pdo->rollBack();
        json_response(['error' => 'Failed to save strokes: ' . $e->getMessage()], 500);
    }

    json_response(['ok' => true, 'count' => count($strokes)]);
}

// ── Images ─────────────────────────────────────────────────────────────

// POST /notebook/images
if ($method === 'POST' && $path === '/notebook/images') {
    $payload = require_auth($config);
    $lessonId = (int)($_POST['lesson_id'] ?? 0);
    if (!$lessonId) json_response(['error' => 'lesson_id is required'], 400);

    // Ownership check
    $stmt = $pdo->prepare('SELECT id FROM notebook_lessons WHERE id = ? AND user_id = ?');
    $stmt->execute([$lessonId, $payload['sub']]);
    if (!$stmt->fetch()) json_response(['error' => 'Not found'], 404);

    if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        json_response(['error' => 'File upload failed'], 400);
    }

    $imageDir = $config['data_dir'] . '/notebook-images';
    if (!is_dir($imageDir)) mkdir($imageDir, 0755, true);

    $filename = uniqid() . '_' . basename($_FILES['file']['name']);
    $destPath = $imageDir . '/' . $filename;

    if (!move_uploaded_file($_FILES['file']['tmp_name'], $destPath)) {
        json_response(['error' => 'Failed to save file'], 500);
    }

    $stmt = $pdo->prepare('INSERT INTO notebook_images (lesson_id, user_id, filename) VALUES (?, ?, ?)');
    $stmt->execute([$lessonId, $payload['sub'], $filename]);
    $id = (int)$pdo->lastInsertId();

    json_response([
        'id' => $id,
        'filename' => $filename,
        'url' => '/data/notebook-images/' . $filename,
    ], 201);
}

// GET /notebook/images/:lesson_id
if ($method === 'GET' && preg_match('#^/notebook/images/(\d+)$#', $path, $m)) {
    $payload = require_auth($config);
    $lessonId = (int)$m[1];

    // Ownership check
    $stmt = $pdo->prepare('SELECT id FROM notebook_lessons WHERE id = ? AND user_id = ?');
    $stmt->execute([$lessonId, $payload['sub']]);
    if (!$stmt->fetch()) json_response(['error' => 'Not found'], 404);

    $stmt = $pdo->prepare('SELECT id, lesson_id, filename, created_at FROM notebook_images WHERE lesson_id = ? ORDER BY created_at ASC');
    $stmt->execute([$lessonId]);
    $rows = $stmt->fetchAll();

    // Add url field
    $result = array_map(function($row) {
        $row['url'] = '/data/notebook-images/' . $row['filename'];
        return $row;
    }, $rows);

    json_response($result);
}

// DELETE /notebook/images/:id
if ($method === 'DELETE' && preg_match('#^/notebook/images/(\d+)$#', $path, $m)) {
    $payload = require_auth($config);
    $imageId = (int)$m[1];

    // Ownership check
    $stmt = $pdo->prepare('SELECT id, filename FROM notebook_images WHERE id = ? AND user_id = ?');
    $stmt->execute([$imageId, $payload['sub']]);
    $image = $stmt->fetch();
    if (!$image) json_response(['error' => 'Not found'], 404);

    // Delete file
    $filePath = $config['data_dir'] . '/notebook-images/' . $image['filename'];
    if (file_exists($filePath)) unlink($filePath);

    // Delete record
    $pdo->prepare('DELETE FROM notebook_images WHERE id = ?')->execute([$imageId]);
    json_response(['ok' => true]);
}

