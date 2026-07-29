<?php
/**
 * Load config from server/config.php
 */
function load_config(): array {
    $path = realpath(__DIR__ . '/../../config.php');
    if (!$path || !file_exists($path)) {
        http_response_code(500);
        echo json_encode(['error' => 'Server config missing. Copy config.sample.php to config.php']);
        exit;
    }
    return require $path;
}
