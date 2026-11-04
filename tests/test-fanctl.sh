#!/usr/bin/env bash

set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FANCTL="$ROOT/scripts/fanctl"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PASS=0
FAIL=0

pass() {
    echo "PASS: $1"
    ((PASS+=1))
}

fail() {
    echo "FAIL: $1"
    ((FAIL+=1))
}

assert_contains() {
    local output="$1"
    local expected="$2"
    local description="$3"

    if grep -Fq "$expected" <<< "$output"; then
        pass "$description"
    else
        fail "$description"
    fi
}

create_mock() {
    local directory="$1"
    local boost1="${2:-255}"
    local boost2="${3:-255}"

    mkdir -p "$directory"

    printf 'alienware_wmi\n' > "$directory/name"
    printf '%s\n' "$boost1" > "$directory/fan1_boost"
    printf '%s\n' "$boost2" > "$directory/fan2_boost"
    printf '4000\n' > "$directory/fan1_input"
    printf '4200\n' > "$directory/fan2_input"
}

run_status() {
    FANCTL_HWMON_ROOT="$TMP/hwmon" "$FANCTL" status
}

echo "=== Dell Fan Control Tests ==="
echo

# 1. Maximum boost
create_mock "$TMP/hwmon/hwmon0" 255 255
OUTPUT="$(run_status)"
assert_contains "$OUTPUT" "Mode:         Maximum boost" "Detect maximum boost"

# 2. Fan RPM
assert_contains "$OUTPUT" "Fan 1:        4000 RPM" "Read Fan 1 RPM"
assert_contains "$OUTPUT" "Fan 2:        4200 RPM" "Read Fan 2 RPM"

# 3. Automatic mode
create_mock "$TMP/hwmon/hwmon0" 0 0
OUTPUT="$(run_status)"
assert_contains "$OUTPUT" "Mode:         Automatic" "Detect automatic mode"

# 4. Mixed state
create_mock "$TMP/hwmon/hwmon0" 255 0
OUTPUT="$(run_status)"
assert_contains "$OUTPUT" "Mode:         Mixed / custom" "Detect mixed fan state"

# 5. Missing driver
rm -rf "$TMP/hwmon"
mkdir -p "$TMP/hwmon"

if run_status >/dev/null 2>&1; then
    fail "Reject missing driver"
else
    pass "Reject missing driver"
fi

# 6. Missing boost control
create_mock "$TMP/hwmon/hwmon0"
rm "$TMP/hwmon/hwmon0/fan1_boost"

if run_status >/dev/null 2>&1; then
    fail "Reject missing boost control"
else
    pass "Reject missing boost control"
fi

# 7. Invalid boost value
create_mock "$TMP/hwmon/hwmon0"
printf 'invalid\n' > "$TMP/hwmon/hwmon0/fan1_boost"

if run_status >/dev/null 2>&1; then
    fail "Reject invalid boost value"
else
    pass "Reject invalid boost value"
fi

# 8. Missing RPM reading
create_mock "$TMP/hwmon/hwmon0"
rm "$TMP/hwmon/hwmon0/fan2_input"
OUTPUT="$(run_status)"
assert_contains "$OUTPUT" "Fan 2:        unavailable" "Handle missing RPM reading"

# 9. Dynamic hwmon numbering
rm -rf "$TMP/hwmon"
mkdir -p "$TMP/hwmon/hwmon0"
printf 'coretemp\n' > "$TMP/hwmon/hwmon0/name"
create_mock "$TMP/hwmon/hwmon7" 255 255

OUTPUT="$(run_status)"
assert_contains "$OUTPUT" "Interface:    hwmon7" "Discover changed hwmon number"

echo
echo "============================"
echo "Passed: $PASS"
echo "Failed: $FAIL"
echo "============================"

(( FAIL == 0 ))
