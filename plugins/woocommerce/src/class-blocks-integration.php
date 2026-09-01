<?php

namespace Starfiniti\Loyalty;

defined('ABSPATH') || exit;

use Automattic\WooCommerce\Blocks\Integrations\IntegrationInterface;

final class BlocksIntegration implements IntegrationInterface
{
    private const SCRIPT_HANDLE = 'starfiniti-loyalty-blocks';
    private const STYLE_HANDLE = 'starfiniti-loyalty-blocks';

    public function get_name()
    {
        return Blocks::NAMESPACE;
    }

    public function initialize()
    {
        $asset = require dirname(__DIR__) . '/assets/blocks.asset.php';
        wp_register_script(
            self::SCRIPT_HANDLE,
            plugins_url('assets/blocks.js', STARFINITI_LOYALTY_FILE),
            $asset['dependencies'],
            $asset['version'],
            true
        );
        wp_register_style(
            self::STYLE_HANDLE,
            plugins_url('assets/blocks.css', STARFINITI_LOYALTY_FILE),
            [],
            $asset['version']
        );
        wp_enqueue_style(self::STYLE_HANDLE);
        wp_set_script_translations(
            self::SCRIPT_HANDLE,
            'starfiniti-loyalty',
            dirname(__DIR__) . '/languages'
        );
    }

    public function get_script_handles()
    {
        return [self::SCRIPT_HANDLE];
    }

    public function get_editor_script_handles()
    {
        return [];
    }

    public function get_script_data()
    {
        return ['version' => '1'];
    }
}
