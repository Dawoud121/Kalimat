<?php
/**
 * Kalimat — API Router
 * Single entry point for all /api/* requests.
 */
declare(strict_types=1);

// Load libraries
require __DIR__ . '/lib/config.php';
require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/jwt.php';
require __DIR__ . '/lib/auth.php';
require __DIR__ . '/lib/helpers.php';
require __DIR__ . '/lib/tts.php';

// Default to JSON (TTS routes override with audio/mpeg)
if (!str_starts_with(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH), '/api/tts')) {
    header('Content-Type: application/json; charset=utf-8');
}

// Load config and DB
$config = load_config();
$pdo = get_db($config);

// CORS
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedOrigins = [
    $config['site_url'] ?? '',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
];
if (in_array($origin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
}
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Parse route
$requestUri = $_SERVER['REQUEST_URI'] ?? '/';
$path = parse_url($requestUri, PHP_URL_PATH);
$path = preg_replace('#^/api#', '', $path);
if ($path === '' || $path === false) $path = '/';
$method = $_SERVER['REQUEST_METHOD'];

// ===================== ROUTE DISPATCH =====================

if (str_starts_with($path, '/auth'))          { require __DIR__ . '/routes/auth.php';          }
if (str_starts_with($path, '/profiles'))      { require __DIR__ . '/routes/profiles.php';      }
if (str_starts_with($path, '/decks'))         { require __DIR__ . '/routes/decks.php';         }
if (str_starts_with($path, '/words'))         { require __DIR__ . '/routes/words.php';         }
if (str_starts_with($path, '/srs'))           { require __DIR__ . '/routes/srs.php';           }
if (str_starts_with($path, '/dictionary'))    { require __DIR__ . '/routes/dictionary.php';    }
if (str_starts_with($path, '/community'))     { require __DIR__ . '/routes/community.php';     }
if (str_starts_with($path, '/contributions')) { require __DIR__ . '/routes/contributions.php'; }
if (str_starts_with($path, '/sentences'))     { require __DIR__ . '/routes/sentences.php';     }
if (str_starts_with($path, '/stories'))       { require __DIR__ . '/routes/stories.php';       }
if (str_starts_with($path, '/collections'))   { require __DIR__ . '/routes/stories.php';       }
if (str_starts_with($path, '/quran'))         { require __DIR__ . '/routes/quran.php';         }
if (str_starts_with($path, '/study'))         { require __DIR__ . '/routes/study.php';         }
if (str_starts_with($path, '/sessions'))      { require __DIR__ . '/routes/sessions.php';      }
if (str_starts_with($path, '/feedback'))      { require __DIR__ . '/routes/feedback.php';      }
if (str_starts_with($path, '/admin'))         { require __DIR__ . '/routes/admin.php';         }
if (str_starts_with($path, '/tts'))           { require __DIR__ . '/routes/tts.php';           }

// Temporary diagnostic — remove after debugging
if ($path === '/debug-audio') {
    $info = [
        'curl_loaded' => extension_loaded('curl'),
        'php_version' => PHP_VERSION,
        'azure_key_set' => !empty($config['azure_tts_key'] ?? ''),
        'azure_region' => $config['azure_tts_region'] ?? '(not set)',
        'data_dir' => $config['data_dir'] ?? '(not set)',
        'cache_dir_exists' => is_dir(($config['data_dir'] ?? '') . '/tts-cache'),
        'cache_dir_writable' => is_writable(($config['data_dir'] ?? '') . '/tts-cache'),
        'cached_files' => count(glob(($config['data_dir'] ?? '') . '/tts-cache/*.mp3') ?: []),
    ];
    json_response($info);
}

json_response(['error' => 'Not found'], 404);
