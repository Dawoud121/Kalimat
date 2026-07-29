<?php
/**
 * TTS route — proxies to Azure TTS with local filesystem cache
 */

// POST /tts/speak
if ($method === 'POST' && $path === '/tts/speak') {
    $payload = require_auth($config);
    $body = get_json_body();
    $text = $body['text'] ?? '';
    $rate = $body['rate'] ?? '-15%';

    if (!$text || !is_string($text)) {
        json_response(['error' => 'Missing text'], 400);
    }

    // speak_arabic handles caching, rate limiting, Azure call, and streaming the response
    speak_arabic($pdo, $config, $payload['sub'], $text, $rate);
}

// GET /tts/cache/:hash — serve cached audio file directly
if ($method === 'GET' && preg_match('#^/tts/cache/([a-f0-9]+\.mp3)$#', $path, $m)) {
    $cacheDir = $config['data_dir'] . '/tts-cache';
    $file = $cacheDir . '/' . $m[1];
    if (file_exists($file)) {
        header('Content-Type: audio/mpeg');
        header('Cache-Control: public, max-age=31536000');
        readfile($file);
        exit;
    }
    json_response(['error' => 'Not found'], 404);
}
