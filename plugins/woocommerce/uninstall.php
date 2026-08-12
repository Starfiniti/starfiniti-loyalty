<?php

defined('WP_UNINSTALL_PLUGIN') || exit;

// Value-bearing evidence is preserved by default. A site owner must explicitly
// opt in after confirming that the hub received or reconciled every local event.
if (! defined('STARFINITI_LOYALTY_REMOVE_DATA') || true !== STARFINITI_LOYALTY_REMOVE_DATA) {
    return;
}

global $wpdb;
$table = $wpdb->prefix . 'starfiniti_loyalty_outbox';
$wpdb->query('DROP TABLE IF EXISTS `' . esc_sql($table) . '`');
foreach ([
    'starfiniti_loyalty_endpoint',
    'starfiniti_loyalty_connection_id',
    'starfiniti_loyalty_key_version',
    'starfiniti_loyalty_signing_key_encrypted',
] as $option) {
    delete_option($option);
}
