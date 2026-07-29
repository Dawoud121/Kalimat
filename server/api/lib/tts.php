<?php
/**
 * Azure TTS proxy with local filesystem cache.
 * Replaces the Supabase Edge Function + Storage bucket.
 */

define('TTS_MAX_TEXT_LENGTH', 2500);
define('TTS_DAILY_USER_LIMIT', 300);

function speak_arabic(PDO $pdo, array $config, string $userId, string $text, string $rate = '-15%'): void {
    if (strlen($text) > TTS_MAX_TEXT_LENGTH) {
        json_response(['error' => 'Text too long (max ' . TTS_MAX_TEXT_LENGTH . ' characters)'], 400);
    }

    $cacheDir = $config['data_dir'] . '/tts-cache';
    if (!is_dir($cacheDir)) mkdir($cacheDir, 0755, true);

    // Cache key: SHA-256 of text|rate, truncated to 20 hex chars
    $cacheKey = substr(hash('sha256', $text . '|' . $rate), 0, 20) . '.mp3';
    $cachePath = $cacheDir . '/' . $cacheKey;

    // Serve from cache if available (free — no Azure charge, no rate limit hit)
    if (file_exists($cachePath)) {
        header('Content-Type: audio/mpeg');
        header('Cache-Control: public, max-age=31536000');
        readfile($cachePath);
        exit;
    }

    // Not cached — will hit Azure. Check + increment rate limit.
    $today = date('Y-m-d');
    $stmt = $pdo->prepare('
        INSERT INTO tts_rate_limits (user_id, usage_date, call_count)
        VALUES (?, ?, 1)
        ON CONFLICT(user_id, usage_date)
        DO UPDATE SET call_count = tts_rate_limits.call_count + 1
    ');
    $stmt->execute([$userId, $today]);

    $stmt = $pdo->prepare('SELECT call_count FROM tts_rate_limits WHERE user_id = ? AND usage_date = ?');
    $stmt->execute([$userId, $today]);
    $count = (int)$stmt->fetchColumn();

    if ($count > TTS_DAILY_USER_LIMIT) {
        json_response(['error' => 'Daily TTS limit reached. Try again tomorrow.'], 429);
    }

    // Call Azure TTS
    $azureKey = $config['azure_tts_key'] ?? '';
    $azureRegion = $config['azure_tts_region'] ?? 'australiaeast';

    if (!$azureKey) {
        json_response(['error' => 'TTS not configured'], 500);
    }

    $ssml = "<speak version=\"1.0\" xmlns=\"http://www.w3.org/2001/10/synthesis\" xml:lang=\"ar-SA\"><voice name=\"ar-SA-HamedNeural\"><prosody rate=\"{$rate}\">{$text}</prosody></voice></speak>";

    $ch = curl_init("https://{$azureRegion}.tts.speech.microsoft.com/cognitiveservices/v1");
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $ssml,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => [
            'Ocp-Apim-Subscription-Key: ' . $azureKey,
            'Content-Type: application/ssml+xml',
            'X-Microsoft-OutputFormat: audio-24khz-48kbitrate-mono-mp3',
            'User-Agent: Kalimat',
        ],
        CURLOPT_TIMEOUT        => 30,
    ]);

    $audio = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);

    if ($httpCode !== 200 || !$audio) {
        json_response(['error' => 'TTS generation failed', 'http_code' => $httpCode, 'curl_error' => $curlError], 502);
    }

    // Cache the audio for future free access
    @file_put_contents($cachePath, $audio);

    header('Content-Type: audio/mpeg');
    header('Cache-Control: public, max-age=31536000');
    echo $audio;
    exit;
}
