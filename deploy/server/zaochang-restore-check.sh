#!/usr/bin/env bash
set -Eeuo pipefail

archive="${1:-}"
if [[ -z "$archive" || ! -f "$archive" || "$archive" != /var/backups/zaochang/state-*.tar.gz ]]; then
  printf 'invalid backup path\n' >&2
  exit 2
fi
sha256sum --check --status "$archive.sha256"

restore_root="$(mktemp -d /tmp/zaochang-restore-check.XXXXXX)"
cleanup() {
  rm -rf -- "$restore_root"
}
trap cleanup EXIT

tar --acls --xattrs -C "$restore_root" -xzf "$archive"
sqlite_count=0
while IFS= read -r -d '' database; do
  result="$(sqlite3 "$database" 'PRAGMA integrity_check;')"
  if [[ "$result" != "ok" ]]; then
    printf 'sqlite integrity failure: %s: %s\n' "$database" "$result" >&2
    exit 1
  fi
  sqlite_count="$((sqlite_count + 1))"
done < <(find "$restore_root/state" -type f -name '*.sqlite' -print0)

if [[ "$sqlite_count" -lt 4 ]]; then
  printf 'expected at least four sqlite databases, found %s\n' "$sqlite_count" >&2
  exit 1
fi
file_count="$(find "$restore_root/state" -type f | wc -l)"
printf 'restore_check=ok sqlite=%s files=%s\n' "$sqlite_count" "$file_count"
