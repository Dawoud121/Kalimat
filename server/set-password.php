<?php
/**
 * Set or reset a user's password.
 * Usage: php set-password.php <email> <new-password>
 */
declare(strict_types=1);

require __DIR__ . '/api/lib/config.php';
require __DIR__ . '/api/lib/db.php';

if ($argc < 3) {
    echo "Usage: php set-password.php <email> <new-password>\n";
    exit(1);
}

$email = strtolower(trim($argv[1]));
$password = $argv[2];

$config = load_config();
$pdo = get_db($config);

$stmt = $pdo->prepare('SELECT id FROM users WHERE email = ?');
$stmt->execute([$email]);
$user = $stmt->fetch();

if (!$user) {
    // Try updating by matching profile username
    echo "No user found with email: $email\n";
    echo "Existing users:\n";
    $stmt = $pdo->query('SELECT u.email, p.username FROM users u JOIN profiles p ON p.id = u.id');
    foreach ($stmt->fetchAll() as $r) {
        echo "  {$r['email']} ({$r['username']})\n";
    }
    exit(1);
}

$hash = password_hash($password, PASSWORD_BCRYPT);
$stmt = $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
$stmt->execute([$hash, $user['id']]);

echo "Password updated for: $email\n";
