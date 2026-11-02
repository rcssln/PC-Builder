<?php
/**
 * Hardware catalog endpoint (read-only).
 *
 * GET backend/api/components.php                 -> all components
 * GET backend/api/components.php?category=gpu    -> one category
 * GET backend/api/components.php?id=gpu-rtx4060  -> a single component
 */
require_once __DIR__ . '/_bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    fail('Method not allowed.', 405);
}

/** Converts a database row into the same shape used by data/components.json. */
function format_component($row)
{
    return array(
        'id'       => $row['id'],
        'category' => $row['category'],
        'name'     => $row['name'],
        'brand'    => $row['brand'],
        'price'    => (float) $row['price'],
        'release'  => $row['release_year'] === null ? null : (int) $row['release_year'],
        'image'    => $row['image'],
        'specs'    => json_decode($row['specs'], true),
        'priceSource' => $row['price_source'] === null ? null : json_decode($row['price_source'], true),
    );
}

$columns = 'id, category, name, brand, price, image, release_year, specs, price_source';

if (isset($_GET['id'])) {
    $stmt = db()->prepare("SELECT $columns FROM components WHERE id = ?");
    $stmt->execute(array((string) $_GET['id']));
    $row = $stmt->fetch();
    if (!$row) {
        fail('Component not found.', 404);
    }
    respond(array('ok' => true, 'component' => format_component($row)));
}

if (isset($_GET['category'])) {
    $category = (string) $_GET['category'];
    if (!in_array($category, CATEGORIES, true)) {
        fail('Unknown category. Use one of: ' . implode(', ', CATEGORIES));
    }
    $stmt = db()->prepare("SELECT $columns FROM components WHERE category = ? ORDER BY price");
    $stmt->execute(array($category));
} else {
    $stmt = db()->query("SELECT $columns FROM components ORDER BY category, price");
}

respond(array(
    'ok'   => true,
    'meta' => array(
        'source'    => 'mysql',
        'currency'  => 'PHP',
        'priceNote' => 'Prices in Philippine pesos, checked at Philippine retailers on 2 November 2026. See priceSource on each component.',
        'indexNote' => 'Performance indices are relative estimates derived from general public benchmark trends. They are not measured results.',
    ),
    'components' => array_map('format_component', $stmt->fetchAll()),
));
