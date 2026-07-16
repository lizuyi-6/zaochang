#!/usr/bin/env bash
set -Eeuo pipefail

failures=()
if ! systemctl is-active --quiet zaochang.service; then
  failures+=("app_inactive")
fi
if ! systemctl is-active --quiet nginx.service; then
  failures+=("nginx_inactive")
fi
if ! curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3001/api/community >/dev/null; then
  failures+=("app_probe_failed")
fi

disk_percent="$(df --output=pcent / | tail -n 1 | tr -dc '0-9')"
if [[ -z "$disk_percent" || "$disk_percent" -ge 80 ]]; then
  failures+=("disk_${disk_percent:-unknown}_percent")
fi
available_kib="$(awk '/MemAvailable:/ { print $2 }' /proc/meminfo)"
if [[ -z "$available_kib" || "$available_kib" -lt 131072 ]]; then
  failures+=("memory_${available_kib:-unknown}_kib")
fi

latest_backup="$(find /var/backups/zaochang -maxdepth 1 -type f -name 'state-*.tar.gz' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n 1 | cut -d' ' -f2-)"
if [[ -z "$latest_backup" ]]; then
  failures+=("backup_missing")
else
  backup_age="$(( $(date +%s) - $(stat -c %Y "$latest_backup") ))"
  if [[ "$backup_age" -gt 93600 ]]; then
    failures+=("backup_${backup_age}_seconds_old")
  fi
  if ! sha256sum --check --status "$latest_backup.sha256"; then
    failures+=("backup_checksum_invalid")
  fi
fi

if ! openssl x509 -checkend 1209600 -noout -in /etc/letsencrypt/live/aetherstudio.top/fullchain.pem; then
  failures+=("certificate_expires_within_14_days")
fi

if [[ "${#failures[@]}" -gt 0 ]]; then
  message="zaochang health check failed: ${failures[*]}"
  logger -p daemon.err -t zaochang-health "$message"
  printf '%s\n' "$message" >&2
  exit 1
fi

logger -p daemon.info -t zaochang-health "zaochang health check passed: disk=${disk_percent}% mem_available=${available_kib}KiB"
