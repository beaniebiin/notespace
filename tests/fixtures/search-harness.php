<?php
// Regression-test helper: drives the REAL api.php `search` branch with fixture
// data + a stubbed login session. Lives next to the api.php copy under test,
// so __DIR__ . '/data' resolves to the fixture data dir.
// Usage: php search-harness.php "<query>"
error_reporting(E_ALL & ~E_DEPRECATED);
session_save_path(__DIR__ . '/sess');
@mkdir(__DIR__ . '/sess', 0777, true);
session_start();
$_SESSION['loggedin'] = true;
session_write_close();
$_SERVER['REQUEST_METHOD'] = 'GET';
$_GET['action'] = 'search';
$_GET['query'] = $argv[1] ?? '';
include __DIR__ . '/api.php';
