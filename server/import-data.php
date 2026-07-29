<?php
/**
 * Kalimat — CSV Data Import Script
 *
 * Usage: php import-data.php [--data-dir=path] [--exports-dir=path]
 *
 * Imports all Supabase CSV exports into the SQLite database.
 * Run this once after setting up config.php.
 *
 * IMPORTANT: The profiles CSV doesn't have passwords. You'll need to
 * manually create users or reset passwords after import.
 */
declare(strict_types=1);

require __DIR__ . '/api/lib/config.php';
require __DIR__ . '/api/lib/db.php';
require __DIR__ . '/api/lib/helpers.php';

$config = load_config();
$pdo = get_db($config);

$exportsDir = $config['data_dir'] . '/exports';

// Override from CLI args
foreach ($argv ?? [] as $arg) {
    if (str_starts_with($arg, '--exports-dir=')) {
        $exportsDir = substr($arg, 14);
    }
}

if (!is_dir($exportsDir)) {
    echo "Exports directory not found: $exportsDir\n";
    exit(1);
}

echo "Importing from: $exportsDir\n";
echo "Database: " . $config['data_dir'] . "/kalimat.sqlite\n\n";

// ── Import order matters (foreign keys) ──

// 1. Users — created from profiles CSV (no passwords in Supabase export)
import_users_from_profiles($pdo, "$exportsDir/profiles_rows.csv", $config);

// 2. Reference data (no foreign key deps on users)
import_csv($pdo, 'collections',           "$exportsDir/collections_rows.csv");
import_csv($pdo, 'stories',               "$exportsDir/stories_rows.csv", ['segments']);
import_csv($pdo, 'community_collections', "$exportsDir/community_collections_rows.csv");
import_csv($pdo, 'dictionary',            "$exportsDir/dictionary_rows.csv", ['forms', 'sources']);

// 3. Quran words (large — 77K rows)
import_csv($pdo, 'quran_words', "$exportsDir/quran_words_rows.csv");

// 4. User data (depends on users existing)
import_csv($pdo, 'decks',               "$exportsDir/decks_rows.csv");
import_csv($pdo, 'words',               "$exportsDir/words_rows.csv");
import_csv($pdo, 'srs_cards',           "$exportsDir/srs_cards_rows.csv");
import_csv($pdo, 'sentences',           "$exportsDir/sentences_rows.csv");
import_csv($pdo, 'community_decks',     "$exportsDir/community_decks_rows.csv", ['words_json']);
import_csv($pdo, 'contributions',       "$exportsDir/contributions_rows.csv");
import_csv($pdo, 'contribution_votes',  "$exportsDir/contribution_votes_rows.csv");
import_csv($pdo, 'contribution_audit',  "$exportsDir/contribution_audit_rows.csv");
import_csv($pdo, 'study_log',           "$exportsDir/study_log_rows.csv");
import_csv($pdo, 'app_sessions',        "$exportsDir/app_sessions_rows.csv");
import_csv($pdo, 'story_progress',      "$exportsDir/story_progress_rows.csv");
import_csv($pdo, 'feedback',            "$exportsDir/feedback_rows.csv");
import_csv($pdo, 'tts_rate_limits',     "$exportsDir/tts_rate_limits_rows.csv");

echo "\n✓ Import complete!\n";
echo "\nNOTE: Users were imported WITHOUT passwords.\n";
echo "Run this to set the admin password:\n";
echo "  php set-password.php dawoudhussein07@gmail.com YourNewPassword\n\n";

// ── Functions ──

function import_users_from_profiles(PDO $pdo, string $csvPath, array $config): void {
    if (!file_exists($csvPath)) {
        echo "  SKIP users (profiles CSV not found)\n";
        return;
    }

    $handle = fopen($csvPath, 'r');
    $headers = fgetcsv($handle);
    $idIdx = array_search('id', $headers);

    $count = 0;
    $pdo->beginTransaction();

    // Check if users already exist
    $existing = (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
    if ($existing > 0) {
        echo "  SKIP users (already have $existing rows)\n";
        fclose($handle);
        $pdo->commit();
        // Still import profiles
        import_csv($pdo, 'profiles', $csvPath);
        return;
    }

    // Insert placeholder users (no real passwords — need manual reset)
    $stmt = $pdo->prepare('INSERT OR IGNORE INTO users (id, email, password_hash) VALUES (?, ?, ?)');
    $profileStmt = $pdo->prepare('INSERT OR IGNORE INTO profiles (id, username, role, trust_score, trust_score_vocab, trust_score_forms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');

    while (($row = fgetcsv($handle)) !== false) {
        if (count($row) < count($headers)) continue;
        $data = array_combine($headers, $row);

        $userId = $data['id'];
        $username = $data['username'] ?? 'user';
        $email = strtolower($username) . '@placeholder.local';

        // Admin gets real email
        if ($userId === '5bcbd5db-3e8c-4943-ac04-39d1f32ceb5a' || $username === 'Dawoud') {
            $email = $config['admin_email'];
        }

        // Placeholder password hash (user must reset)
        $hash = password_hash('changeme_' . $userId, PASSWORD_BCRYPT);

        $stmt->execute([$userId, $email, $hash]);
        $profileStmt->execute([
            $userId,
            $username,
            $data['role'] ?? 'user',
            (int)($data['trust_score'] ?? 0),
            (int)($data['trust_score_vocab'] ?? 50),
            (int)($data['trust_score_forms'] ?? 50),
            $data['created_at'] ?? date('Y-m-d H:i:s'),
        ]);
        $count++;
    }

    fclose($handle);
    $pdo->commit();
    echo "  users + profiles: $count rows\n";
}

function import_csv(PDO $pdo, string $table, string $csvPath, array $jsonColumns = []): void {
    if (!file_exists($csvPath)) {
        echo "  SKIP $table (CSV not found: $csvPath)\n";
        return;
    }

    // Check if table already has data
    $existing = (int)$pdo->query("SELECT COUNT(*) FROM $table")->fetchColumn();
    if ($existing > 0) {
        echo "  SKIP $table (already has $existing rows)\n";
        return;
    }

    $handle = fopen($csvPath, 'r');
    $headers = fgetcsv($handle);
    if (!$headers) {
        echo "  SKIP $table (empty CSV)\n";
        fclose($handle);
        return;
    }

    // Get actual table columns to filter out any that don't exist in SQLite schema
    $tableInfo = $pdo->query("PRAGMA table_info($table)")->fetchAll();
    $validCols = array_map(fn($c) => $c['name'], $tableInfo);

    // Filter CSV headers to only valid columns
    $useHeaders = [];
    $useIndices = [];
    foreach ($headers as $i => $h) {
        $h = trim($h);
        if (in_array($h, $validCols)) {
            $useHeaders[] = $h;
            $useIndices[] = $i;
        }
    }

    if (empty($useHeaders)) {
        echo "  SKIP $table (no matching columns)\n";
        fclose($handle);
        return;
    }

    $colStr = implode(', ', $useHeaders);
    $placeholders = implode(', ', array_fill(0, count($useHeaders), '?'));
    $stmt = $pdo->prepare("INSERT OR IGNORE INTO $table ($colStr) VALUES ($placeholders)");

    $count = 0;
    $pdo->beginTransaction();

    while (($row = fgetcsv($handle)) !== false) {
        if (count($row) < max($useIndices) + 1) continue;

        $values = [];
        foreach ($useIndices as $idx => $csvIdx) {
            $val = $row[$csvIdx] ?? null;
            $colName = $useHeaders[$idx];

            // Handle empty strings as NULL for nullable fields
            if ($val === '') $val = null;

            // Boolean columns (is_public, completed)
            if (in_array($colName, ['is_public', 'completed'])) {
                $val = ($val === 'true' || $val === '1' || $val === 't') ? 1 : 0;
            }

            // JSON columns stay as-is (already JSON strings in CSV)
            // sources column: convert Postgres array format {x,y} to JSON ["x","y"]
            if ($colName === 'sources' && $val && str_starts_with($val, '{')) {
                $inner = trim($val, '{}');
                $parts = $inner ? array_map(fn($s) => trim($s, '"'), explode(',', $inner)) : [];
                $val = json_encode($parts);
            }

            $values[] = $val;
        }

        try {
            $stmt->execute($values);
            $count++;
        } catch (PDOException $e) {
            // Skip rows that fail (e.g., FK violations for orphaned data)
            // Log first few errors
            if ($count < 3) {
                echo "  WARN $table row $count: " . $e->getMessage() . "\n";
            }
        }
    }

    fclose($handle);
    $pdo->commit();
    echo "  $table: $count rows\n";
}
