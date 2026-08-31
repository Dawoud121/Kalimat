<?php
/**
 * TTS route — proxies to Azure TTS with local filesystem cache
 */

// POST /tts/speak
if ($method === 'POST' && $path === '/tts/speak') {
    try {
        $payload = require_auth($config);
        $body = get_json_body();
        $text = $body['text'] ?? '';
        $rate = $body['rate'] ?? '-15%';

        if (!$text || !is_string($text)) {
            json_response(['error' => 'Missing text'], 400);
        }

        // speak_arabic handles caching, rate limiting, Azure call, and streaming the response
        speak_arabic($pdo, $config, $payload['sub'], $text, $rate);
    } catch (\Throwable $e) {
        json_response([
            'error' => $e->getMessage(),
            'file' => $e->getFile(),
            'line' => $e->getLine(),
        ], 500);
    }
}

// GET /tts/diag — temporary diagnostic, remove after debugging
if ($method === 'GET' && $path === '/tts/diag') {
    json_response([
        'curl_loaded' => extension_loaded('curl'),
        'php_version' => PHP_VERSION,
        'azure_key_set' => !empty($config['azure_tts_key'] ?? ''),
        'azure_region' => $config['azure_tts_region'] ?? '(not set)',
        'cache_dir_exists' => is_dir(($config['data_dir'] ?? '') . '/tts-cache'),
        'cache_dir_writable' => is_writable(($config['data_dir'] ?? '') . '/tts-cache'),
    ]);
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
