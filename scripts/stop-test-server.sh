#!/bin/sh
# Stops the isolated e2e Vite server (port 5176) without matching this script's own command line.
PAT="vite.test"
for pid in $(pgrep -f "config ${PAT}.config"); do
  [ "$pid" != "$$" ] && kill "$pid" 2>/dev/null
done
exit 0
