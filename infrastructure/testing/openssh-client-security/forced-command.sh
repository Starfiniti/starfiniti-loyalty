#!/bin/sh
set -eu

test "${SSH_ORIGINAL_COMMAND:-}" = 'printf starfiniti-openssh-canary'
printf 'starfiniti-openssh-canary\n'
