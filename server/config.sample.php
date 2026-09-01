<?php
/**
 * Kalimat — sample config. Copy to config.php and fill in real values.
 * config.php is gitignored — never commit secrets.
 */
return [
    'jwt_secret'      => 'CHANGE_ME_TO_A_LONG_RANDOM_STRING',
    'admin_email'     => 'dawoudhussein07@gmail.com',
    'data_dir'        => __DIR__ . '/data',
    'site_url'        => 'https://your-domain.com',
    'azure_tts_key'   => '',
    'azure_tts_region'=> 'australiaeast',
    'google_vision_api_key' => '',  // Optional: for Arabic handwriting recognition in notebook
];
