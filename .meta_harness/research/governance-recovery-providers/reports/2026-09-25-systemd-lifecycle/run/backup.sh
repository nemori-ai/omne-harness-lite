#!/bin/sh
if systemctl is-active --quiet omne-probe-center.service; then echo attempted-live-backup; exit 0; fi
echo center-unavailable >&2
exit 1
