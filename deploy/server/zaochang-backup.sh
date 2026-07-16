#!/usr/bin/env bash
set -Eeuo pipefail

backup_root=/var/backups/zaochang
state_root=/var/lib/zaochang
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="$backup_root/state-$timestamp.tar.gz"
temporary="$archive.partial"
was_active=0

install -d -m 700 -o root -g root "$backup_root"
if systemctl is-active --quiet zaochang.service; then
  was_active=1
  systemctl stop zaochang.service
fi

restart_app() {
  if [[ "$was_active" -eq 1 ]]; then
    systemctl start zaochang.service
  fi
}
trap restart_app EXIT

tar --acls --xattrs --numeric-owner -C "$state_root" -czf "$temporary" state
mv "$temporary" "$archive"
chmod 600 "$archive"
sha256sum "$archive" > "$archive.sha256"
chmod 600 "$archive.sha256"
find "$backup_root" -maxdepth 1 -type f -name 'state-*.tar.gz*' -mtime +14 -delete

trap - EXIT
restart_app
systemctl is-active --quiet zaochang.service
printf '%s\n' "$archive"
