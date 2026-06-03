#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."

BUN_BIN="${BUN_BIN:-}"
if [ -z "$BUN_BIN" ]; then
  if command -v bun >/dev/null 2>&1; then
    BUN_BIN="bun"
  elif command -v cygpath >/dev/null 2>&1 && [ -n "${USERPROFILE:-}" ] && [ -x "$(cygpath -u "$USERPROFILE")/.bun/bin/bun.exe" ]; then
    BUN_BIN="$(cygpath -u "$USERPROFILE")/.bun/bin/bun.exe"
  elif [ -x "$HOME/.bun/bin/bun.exe" ]; then
    BUN_BIN="$HOME/.bun/bin/bun.exe"
  elif [ -x "$HOME/.bun/bin/bun" ]; then
    BUN_BIN="$HOME/.bun/bin/bun"
  elif [ "${HOME#C:Users}" != "$HOME" ] && [ -x "/mnt/c/Users/${HOME#C:Users}/.bun/bin/bun.exe" ]; then
    BUN_BIN="/mnt/c/Users/${HOME#C:Users}/.bun/bin/bun.exe"
  elif command -v cmd.exe >/dev/null 2>&1; then
    USER_PROFILE="$(cmd.exe /c echo %USERPROFILE% 2>/dev/null | tr -d '\r')"
    USER_PROFILE_UNIX="$(printf '%s' "$USER_PROFILE" | sed -e 's#\\#/#g' -e 's#^C:#/mnt/c#')"
    if [ -x "$USER_PROFILE_UNIX/.bun/bin/bun.exe" ]; then
      BUN_BIN="$USER_PROFILE_UNIX/.bun/bin/bun.exe"
    fi
  fi

  if [ -z "$BUN_BIN" ]; then
    echo "[pre-commit] bun was not found. Install Bun or set BUN_BIN to the bun executable." >&2
    exit 127
  fi
fi

echo "[pre-commit] Running API TypeScript check..."
"$BUN_BIN" run tsc-check

echo "[pre-commit] Running API lint check..."
"$BUN_BIN" run lint

echo "[pre-commit] API checks passed."
