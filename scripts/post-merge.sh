#!/bin/bash
set -e

# Install/update Node dependencies after any merge
npm install --prefer-offline 2>/dev/null || npm install
