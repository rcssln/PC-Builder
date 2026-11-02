<?php
/**
 * Saved builds endpoint (CRUD).
 *
 * GET    backend/api/builds.php          -> list all saved builds
 * GET    backend/api/builds.php?id=3     -> one saved build
 * POST   backend/api/builds.php          -> create  (JSON body)
 * PUT    backend/api/builds.php?id=3     -> update  (JSON body)
 * DELETE backend/api/builds.php?id=3     -> delete
 *
 * JSON body: { name, usage, budget, resolution, notes, parts: { cpu: "id", ..., storage: ["id"] } }
 * The total price is always recalculated on the server from the catalog.
 */
require_once __DIR__ . '/_bootstrap.php';

/** Converts a database row into the build shape used by the frontend. */
function format_build($row)
{
    return array(
        'id'         => (int) $row['id'],
        'name'       => $row['name'],
        'usage'      => $row['usage_type'],
        'budget'     => (float) $row['budget'],
        'resolution' => $row['resolution'],
        'notes'      => $row['notes'],
        'parts'      => json_decode($row['parts'], true),
        'totalPrice' => (float) $row['total_price'],
        'createdAt'  => date('c', strtotime($row['created_at'])),
        'updatedAt'  => date('c', strtotime($row['updated_at'])),
    );
}

/** Reads and validates the ?id= query parameter. */
function require_id()
{
    $id = isset($_GET['id']) ? filter_var($_GET['id'], FILTER_VALIDATE_INT) : false;
    if ($id === false || $id < 1) {
        fail('A valid numeric build id is required (?id=).');
    }
    return $id;
}

/** Loads one build or responds with 404. */
function find_build($id)
{
    $stmt = db()->prepare('SELECT * FROM builds WHERE id = ?');
    $stmt->execute(array($id));
    $row = $stmt->fetch();
    if (!$row) {
        fail('Build not found.', 404);
    }
    return $row;
}

/**
 * Validates a build payload. Returns a clean array ready for the database,
 * or responds with a 422 error listing every problem found.
 */
function validate_build($input)
{
    $errors = array();

    $name = isset($input['name']) ? trim((string) $input['name']) : '';
    if ($name === '') {
        $errors[] = 'Build name is required.';
    } elseif (mb_strlen($name) > 100) {
        $errors[] = 'Build name must be 100 characters or fewer.';
    }

    $usage = isset($input['usage']) ? (string) $input['usage'] : 'gaming';
    if (!in_array($usage, USAGES, true)) {
        $errors[] = 'Usage must be one of: ' . implode(', ', USAGES) . '.';
    }

    $resolution = isset($input['resolution']) ? (string) $input['resolution'] : '1440p';
    if (!in_array($resolution, RESOLUTIONS, true)) {
        $errors[] = 'Resolution must be one of: ' . implode(', ', RESOLUTIONS) . '.';
    }

    $budget = isset($input['budget']) ? $input['budget'] : 0;
    if (!is_numeric($budget) || $budget < 0 || $budget > 10000000) {
        $errors[] = 'Budget must be a number between 0 and 10,000,000 (PHP).';
    }

    $notes = isset($input['notes']) ? trim((string) $input['notes']) : '';
    if (mb_strlen($notes) > 500) {
        $errors[] = 'Notes must be 500 characters or fewer.';
    }

    $parts = isset($input['parts']) && is_array($input['parts']) ? $input['parts'] : null;
    $cleanParts = array();
    $wanted = array(); // id => expected category
    if ($parts === null) {
        $errors[] = 'Parts must be an object that maps categories to component ids.';
    } else {
        foreach ($parts as $category => $value) {
            if (!in_array($category, CATEGORIES, true)) {
                $errors[] = "Unknown category \"$category\".";
                continue;
            }
            if ($category === 'storage') {
                $list = is_array($value) ? array_values($value) : array();
                if (count($list) > MAX_STORAGE_DRIVES) {
                    $errors[] = 'A build can contain at most ' . MAX_STORAGE_DRIVES . ' storage drives.';
                }
                foreach ($list as $sid) {
                    if (!is_string($sid) || $sid === '') {
                        $errors[] = 'Storage ids must be non-empty strings.';
                        continue;
                    }
                    $wanted[] = array($sid, 'storage');
                }
                $cleanParts['storage'] = array_values(array_filter($list, 'is_string'));
            } elseif ($value === null || $value === '') {
                $cleanParts[$category] = null;
            } elseif (!is_string($value)) {
                $errors[] = "The $category id must be a string.";
            } else {
                $cleanParts[$category] = $value;
                $wanted[] = array($value, $category);
            }
        }
    }

    // Every referenced component must exist in the catalog with the right category.
    $total = 0.0;
    if ($wanted) {
        $ids = array_values(array_unique(array_map(function ($w) { return $w[0]; }, $wanted)));
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = db()->prepare("SELECT id, category, price FROM components WHERE id IN ($placeholders)");
        $stmt->execute($ids);
        $catalog = array();
        foreach ($stmt->fetchAll() as $row) {
            $catalog[$row['id']] = $row;
        }
        foreach ($wanted as $w) {
            list($id, $category) = $w;
            if (!isset($catalog[$id])) {
                $errors[] = "Component \"$id\" does not exist in the catalog.";
            } elseif ($catalog[$id]['category'] !== $category) {
                $errors[] = "Component \"$id\" is not a $category.";
            } else {
                $total += (float) $catalog[$id]['price'];
            }
        }
    }

    if ($errors) {
        fail('Validation failed.', 422, $errors);
    }

    return array(
        'name'        => $name,
        'usage_type'  => $usage,
        'budget'      => round((float) $budget, 2),
        'resolution'  => $resolution,
        'notes'       => $notes,
        'parts'       => json_encode((object) $cleanParts, JSON_UNESCAPED_SLASHES),
        'total_price' => round($total, 2),
    );
}

switch ($_SERVER['REQUEST_METHOD']) {
    case 'GET':
        if (isset($_GET['id'])) {
            respond(array('ok' => true, 'build' => format_build(find_build(require_id()))));
        }
        $rows = db()->query('SELECT * FROM builds ORDER BY updated_at DESC, id DESC')->fetchAll();
        respond(array('ok' => true, 'builds' => array_map('format_build', $rows)));
        break;

    case 'POST':
        $b = validate_build(read_json_body());
        $stmt = db()->prepare('INSERT INTO builds (name, usage_type, budget, resolution, notes, parts, total_price)
                               VALUES (?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute(array($b['name'], $b['usage_type'], $b['budget'], $b['resolution'], $b['notes'], $b['parts'], $b['total_price']));
        respond(array('ok' => true, 'build' => format_build(find_build((int) db()->lastInsertId()))), 201);
        break;

    case 'PUT':
        $id = require_id();
        find_build($id);
        $b = validate_build(read_json_body());
        $stmt = db()->prepare('UPDATE builds SET name = ?, usage_type = ?, budget = ?, resolution = ?, notes = ?, parts = ?, total_price = ?
                               WHERE id = ?');
        $stmt->execute(array($b['name'], $b['usage_type'], $b['budget'], $b['resolution'], $b['notes'], $b['parts'], $b['total_price'], $id));
        respond(array('ok' => true, 'build' => format_build(find_build($id))));
        break;

    case 'DELETE':
        $id = require_id();
        find_build($id);
        db()->prepare('DELETE FROM builds WHERE id = ?')->execute(array($id));
        respond(array('ok' => true, 'deleted' => $id));
        break;

    default:
        fail('Method not allowed.', 405);
}
