<?php
/**
 * Database connection settings.
 * Defaults match a fresh XAMPP install (user "root", empty password).
 * Change these values if your MySQL server is configured differently.
 */
define('DB_HOST', '127.0.0.1');
define('DB_PORT', 3306);
define('DB_NAME', 'digital_pc_builder');
define('DB_USER', 'root');
define('DB_PASS', '');

/**
 * Returns a shared PDO connection (created on first use).
 *
 * @return PDO
 */
function db()
{
    static $pdo = null;
    if ($pdo === null) {
        $dsn = 'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . DB_NAME . ';charset=utf8mb4';
        $pdo = new PDO($dsn, DB_USER, DB_PASS, array(
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ));
    }
    return $pdo;
}
