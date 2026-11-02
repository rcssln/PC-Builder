<?php
/**
 * Shared setup for every API endpoint: JSON headers, CORS, error handling
 * and small helper functions.
 */
require_once __DIR__ . '/../config/database.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

const CATEGORIES = array('cpu', 'gpu', 'motherboard', 'ram', 'storage', 'psu', 'case', 'cooler');
const USAGES = array('gaming', 'programming', 'video', 'rendering', 'general');
const RESOLUTIONS = array('1080p', '1440p', '4k');
const MAX_STORAGE_DRIVES = 4;

/** Sends a JSON response and stops the script. */
function respond($data, $status = 200)
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

/** Sends a JSON error response and stops the script. */
function fail($message, $status = 400, $details = null)
{
    $body = array('ok' => false, 'error' => $message);
    if ($details !== null) {
        $body['details'] = $details;
    }
    respond($body, $status);
}

/** Decodes the JSON request body into an associative array. */
function read_json_body()
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        fail('Request body is empty.');
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        fail('Request body must be a valid JSON object.');
    }
    return $data;
}

set_exception_handler(function ($e) {
    if ($e instanceof PDOException) {
        fail('Database error. Check backend/config/database.php and that the database was imported.', 500, $e->getMessage());
    }
    fail('Unexpected server error.', 500, $e->getMessage());
});
