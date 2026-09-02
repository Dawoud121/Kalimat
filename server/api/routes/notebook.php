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

// ── Gemini Analysis ───────────────────────────────────────────────────

// POST /notebook/analyze
if ($method === 'POST' && $path === '/notebook/analyze') {
    $payload = require_auth($config);
    $apiKey = $config['gemini_api_key'] ?? '';
    if (!$apiKey) json_response(['error' => 'Gemini API key not configured'], 500);

    $body = get_json_body();
    $imageData = $body['image'] ?? '';
    $userPrompt = trim($body['prompt'] ?? 'Analyze this note');
    $history = $body['history'] ?? [];

    // Image required for first analysis, optional for follow-ups
    if (!$imageData && empty($history)) json_response(['error' => 'No image provided'], 400);

    // Build Gemini request
    $systemInstruction = <<<'PROMPT'
You are an expert Arabic tutor specialising in Modern Standard Arabic (Fusha). Analyse the student's handwritten lesson notes.

Return valid JSON only.

For a new image, return:

{
"transcription": "",
"translation": "",
"words": [],
"analysis": ""
}

"transcription":

* Transcribe all readable Arabic with full tashkeel.
* Fix obvious spelling or grammar mistakes when the intended form is clear.
* Preserve meaningful line breaks with \n.
* Preserve relevant English text, headings, numbers, and mixed-language notes.
* If a word is uncertain, give your best reading and mark it like "[word? 0.65]".
* Treat spatially separate text as separate lines/items. Do not combine nearby words into the same sentence unless the layout clearly indicates they belong together.
* If the page contains corrections, annotations or teacher markings in another colour, recognise them as corrections/annotations rather than merging them into the original sentence.
* Mention important corrections or low-confidence readings in "analysis".

"translation":

* Give a clear natural English translation of the Arabic content.

"words":
Extract as many useful Arabic content words and phrases from the note as reasonably possible for the student's Word Bank / Add to Deck feature.

Each item:
{
"arabic": "",
"root": "",
"meaning": "",
"partOfSpeech": "",
"forms": {},
"exampleSentence": "",
"exampleTranslation": "",
"confidence": 1
}

Rules:

* Include useful nouns, verbs, adjectives, adverbs, expressions, and lesson-specific vocabulary.
* Skip only very common particles and function words unless they are important to the lesson.
* Use the dictionary/headword form in "arabic".
* Use full tashkeel.
* Give the Arabic root with spaces, e.g. ك ت ب.
* Roots may contain 3 or 4 radicals.
* For derived words, give the underlying lexical root, e.g. اِسْتَخْدَمَ → خ د م.
* If the root is uncertain or not applicable, use null.
* "partOfSpeech" must be one of: "noun", "verb", "adjective", "adverb", "preposition", "particle", "phrase".
* For verbs, "forms" should use:
  {"past": "", "present": "", "command": "", "masdar": ""}
* For nouns/adjectives, "forms" should use:
  {"singular": "", "dual": "", "plural": ""}
* Include full tashkeel on all forms.
* Use null for forms that are not applicable, uncommon, or uncertain. Do not invent forms.
* "exampleSentence" should be a short natural Fusha sentence using the word, with full tashkeel.
* "exampleTranslation" should translate that sentence naturally into English.
* "confidence" is your confidence from 0 to 1 that the vocabulary entry is correct.

"analysis":
Give concise tutor feedback in English using markdown formatting. Focus only on relevant points such as:

* corrections you made and why
* grammar or spelling issues
* unclear handwriting
* useful vocabulary distinctions
* important language patterns
* what the student did well

Do not force feedback categories that are not relevant. Keep analysis under 200 words for short notes and expand only when useful.

For follow-up questions without a new image, return only:

{"response": "your answer in markdown"}

Always return valid JSON with no markdown code fences.
PROMPT;

    // Build contents array
    $contents = [];

    // Add conversation history
    foreach ($history as $msg) {
        $contents[] = [
            'role' => $msg['role'],
            'parts' => [['text' => $msg['text']]],
        ];
    }

    // Build current user message parts
    $parts = [];

    // Add image on first message (no history) or if image is provided
    if ($imageData) {
        // Strip data URL prefix if present
        $base64 = $imageData;
        if (strpos($imageData, ',') !== false) {
            $base64 = explode(',', $imageData, 2)[1];
        }
        $parts[] = [
            'inlineData' => [
                'mimeType' => 'image/png',
                'data' => $base64,
            ],
        ];
    }

    $parts[] = ['text' => $userPrompt];
    $contents[] = ['role' => 'user', 'parts' => $parts];

    $geminiPayload = [
        'system_instruction' => ['parts' => [['text' => $systemInstruction]]],
        'contents' => $contents,
        'generationConfig' => [
            'temperature' => 0.3,
            'responseMimeType' => 'application/json',
        ],
    ];

    $url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=' . urlencode($apiKey);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode($geminiPayload, JSON_UNESCAPED_UNICODE),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 60,
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($curlErr) json_response(['error' => 'Gemini request failed: ' . $curlErr], 500);
    if ($httpCode !== 200) {
        $errBody = json_decode($response, true);
        $errMsg = $errBody['error']['message'] ?? 'Gemini API error';
        json_response(['error' => $errMsg], $httpCode);
    }

    $result = json_decode($response, true);
    $text = $result['candidates'][0]['content']['parts'][0]['text'] ?? '';

    // Try to parse the JSON response
    $parsed = json_decode($text, true);
    if ($parsed === null) {
        // If Gemini didn't return valid JSON, wrap it
        $parsed = ['response' => $text];
    }

    json_response($parsed);
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

