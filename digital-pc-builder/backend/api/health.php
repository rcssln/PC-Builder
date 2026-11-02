<?php
/**
 * GET backend/api/health.php
 * Lets the frontend detect whether the PHP + MySQL backend is available.
 */
require_once __DIR__ . '/_bootstrap.php';

$count = (int) db()->query('SELECT COUNT(*) FROM components')->fetchColumn();
respond(array(
    'ok'         => true,
    'backend'    => 'php-mysql',
    'database'   => DB_NAME,
    'components' => $count,
    'time'       => date('c'),
));
